
import json
import os
import sys

import numpy as np
import pandas as pd
from pymongo import MongoClient
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error


def connect_database():
    """Connect to MongoDB and return the database and client."""

    uri = os.environ.get(
        "MONGODB_URI",
        "mongodb://127.0.0.1:27017/meditrack_ai"
    )

    client = MongoClient(uri, serverSelectionTimeoutMS=5000)
    database = client.get_default_database()

    return client, database


def get_sales_data(database):
    """Get completed sales and active medicines."""

    sales = list(
        database.sales.find(
            {"status": "completed"},
            {"soldAt": 1, "items": 1}
        )
    )

    medicines = list(
        database.medicines.find(
            {"isActive": True},
            {"name": 1, "medicineCode": 1}
        )
    )

    return sales, medicines


def prepare_sales_data(sales):
    """Convert sales into a simple table of daily medicine sales."""

    rows = []

    for sale in sales:
        sold_at = sale.get("soldAt")

        if not sold_at:
            continue

        sale_date = pd.Timestamp(sold_at).tz_localize(None).normalize()

        for item in sale.get("items", []):
            medicine_id = item.get("medicineId")

            if medicine_id is None:
                continue

            rows.append({
                "medicineId": str(medicine_id),
                "date": sale_date,
                "quantity": float(item.get("quantity", 0))
            })

    if not rows:
        raise ValueError("No usable sales line items found.")

    sales_table = pd.DataFrame(rows)

    # Add quantities when the same medicine was sold on the same day
    sales_table = sales_table.groupby(
        ["medicineId", "date"],
        as_index=False
    )["quantity"].sum()

    return sales_table


def create_features(sales_series):
    """Create the data that the model uses to learn sales patterns."""

    data = pd.DataFrame({"y": sales_series})

    # Day information
    data["dow"] = data.index.dayofweek
    data["day_of_year"] = data.index.dayofyear

    # Sales from previous days
    for days in [1, 2, 7, 14, 28]:
        data[f"lag_{days}"] = data["y"].shift(days)

    # Average sales from previous days
    data["mean_7"] = data["y"].shift(1).rolling(7).mean()
    data["mean_28"] = data["y"].shift(1).rolling(28).mean()

    # Remove rows that do not have enough previous data
    data = data.dropna()

    return data


def train_model(data):
    """Train the model and calculate its accuracy metrics."""

    features = [column for column in data.columns if column != "y"]

    # Keep the data in date order when splitting
    split = max(
        int(len(data) * 0.8),
        len(data) - 30
    )
    split = min(split, len(data) - 1)

    train_data = data.iloc[:split]
    test_data = data.iloc[split:]

    model = RandomForestRegressor(
        n_estimators=120,
        max_depth=8,
        min_samples_leaf=2,
        random_state=42,
        n_jobs=1
    )

    model.fit(train_data[features], train_data["y"])

    # Test the model on data it was not trained on
    test_predictions = np.maximum(
        0,
        model.predict(test_data[features])
    )

    mae = float(
        mean_absolute_error(
            test_data["y"],
            test_predictions
        )
    ) if len(test_data) else None

    # Compare with a simple prediction based on sales 7 days ago
    baseline_predictions = np.maximum(
        0,
        test_data["lag_7"].to_numpy()
    )

    baseline_mae = float(
        mean_absolute_error(
            test_data["y"],
            baseline_predictions
        )
    ) if len(test_data) else None

    return model, features, mae, baseline_mae


def predict_future(model, features, sales_series, end_date, horizon):
    """Predict medicine demand for the next 7 or 30 days."""

    history = sales_series.astype(float).tolist()
    daily_predictions = []

    for step in range(horizon):
        target_date = end_date + pd.Timedelta(days=step + 1)

        # Get sales from previous days
        def get_lag(days):
            if len(history) >= days:
                return history[-days]

            return float(np.mean(history)) if history else 0.0

        last_7_days = history[-7:] if history else [0]
        last_28_days = history[-28:] if history else [0]

        # Prepare the information needed for the prediction
        row = {
            "dow": int(target_date.dayofweek),
            "day_of_year": int(target_date.dayofyear),
            "lag_1": get_lag(1),
            "lag_2": get_lag(2),
            "lag_7": get_lag(7),
            "lag_14": get_lag(14),
            "lag_28": get_lag(28),
            "mean_7": float(np.mean(last_7_days)),
            "mean_28": float(np.mean(last_28_days))
        }

        prediction = model.predict(
            pd.DataFrame([row])[features]
        )[0]

        quantity = int(max(0, round(float(prediction))))

        # Use the prediction for the next day's calculation
        history.append(float(quantity))

        daily_predictions.append({
            "date": target_date.strftime(
                "%Y-%m-%dT00:00:00.000Z"
            ),
            "quantity": quantity
        })

    return daily_predictions


def main():
    # Use 7 days by default, or read 7/30 from the command line
    horizon = int(sys.argv[1]) if len(sys.argv) > 1 else 7

    if horizon not in (7, 30):
        raise ValueError("Horizon must be 7 or 30 days")

    client = None

    try:
        # Step 1: Connect to the database
        client, database = connect_database()

        # Step 2: Get sales and medicine information
        sales, medicines = get_sales_data(database)

        if not medicines:
            print(json.dumps({
                "predictions": [],
                "modelName": "RandomForestRegressor",
                "metrics": {}
            }))
            return

        if not sales:
            raise ValueError(
                "No completed sales found. Run npm run seed first."
            )

        # Step 3: Prepare the sales data
        sales_table = prepare_sales_data(sales)

        today = pd.Timestamp.now().normalize()

        start_date = min(
            sales_table["date"].min(),
            today - pd.Timedelta(days=179)
        )

        end_date = min(
            sales_table["date"].max(),
            today - pd.Timedelta(days=1)
        )

        predictions = []

        # Step 4: Make predictions for each medicine
        for medicine in medicines:
            medicine_id = str(medicine["_id"])

            medicine_sales = sales_table[
                sales_table["medicineId"] == medicine_id
            ].set_index("date")["quantity"].sort_index()

            # Include days when no sales were made
            date_range = pd.date_range(
                start_date,
                end_date,
                freq="D"
            )

            sales_series = medicine_sales.reindex(
                date_range,
                fill_value=0
            ).astype(float)

            if len(sales_series) < 30:
                continue

            # Step 5: Prepare data and train the model
            training_data = create_features(sales_series)

            if len(training_data) < 20:
                continue

            model, features, mae, baseline_mae = train_model(
                training_data
            )

            # Step 6: Predict future demand
            daily = predict_future(
                model,
                features,
                sales_series,
                end_date,
                horizon
            )

            predictions.append({
                "medicineId": medicine_id,
                "medicineName": medicine.get("name", "Medicine"),
                "dailyPredictions": daily,
                "totalDemand": sum(
                    item["quantity"] for item in daily
                ),
                "metrics": {
                    "mae": round(mae, 3) if mae is not None else None,
                    "baselineMae": (
                        round(baseline_mae, 3)
                        if baseline_mae is not None
                        else None
                    )
                }
            })

        # Step 7: Print the final JSON result
        result = {
            "predictions": predictions,
            "modelName": "RandomForestRegressor",
            "trainingDataThrough": end_date.strftime(
                "%Y-%m-%dT00:00:00.000Z"
            ),
            "metrics": {
                "evaluatedMedicines": len(predictions),
                "note": (
                    "Metrics use a chronological holdout; "
                    "synthetic seed data is for demonstration only."
                )
            }
        }

        print(json.dumps(result, default=str))

    finally:
        # Always close the database connection
        if client is not None:
            client.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
