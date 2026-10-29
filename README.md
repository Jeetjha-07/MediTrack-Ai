# MediTrack AI

A minimal pharmacy inventory and demand-forecasting demo built with HTML, CSS, JavaScript, Node.js, Express, MongoDB, Python, Pandas and scikit-learn.

## Features
- Single-pharmacist demo login
- Medicine catalogue and archive
- Batch-wise stock and expiry tracking
- Expired, expiring-soon (30 days), and low-stock alerts
- Multi-medicine sales in one transaction with earliest-expiry-first (FEFO) batch allocation
- Sales history and dashboard with revenue trends, average sale value, top-selling medicines and category performance
- 7-day and 30-day demand estimates from historical sales
- Demo seed data with 204 medicine SKUs and multi-item sales across 180 days

## Requirements
- Node.js 18+ and npm
- MongoDB running locally, or a MongoDB Atlas connection string
- Python 3.10+ and pip

## Quick start (Windows PowerShell)

1. Open a terminal in `MediTrack-AI/backend`.
2. Install Node dependencies:

   ```powershell
   npm install
   ```

3. Create your environment file:

   ```powershell
   Copy-Item .env.example .env
   ```

4. Open `.env`. Set `MONGODB_URI` to your local MongoDB or Atlas URI. Set a private `SESSION_SECRET` and change `PHARMACIST_PASSWORD`.
5. Install Python dependencies:

   ```powershell
   py -m pip install -r ml/requirements.txt
   ```

   If `py` is not available, use `python -m pip install -r ml/requirements.txt` and set `PYTHON_EXECUTABLE=python` in `.env`.

6. Seed sample data:

   ```powershell
   npm run seed
   ```

   **Warning:** `npm run seed` clears the app's medicines, batches, sales, adjustments and forecast runs before recreating 204 medicine SKUs, their batches, and 1,440 demo sales. Run it only on a demo database.

7. Start the server:

   ```powershell
   npm start
   ```

8. Open `http://localhost:4000`.

## Demo login
The defaults are prefilled on the sign-in screen:
- Email: `pharmacist@meditrack.local`
- Password: `ChangeMe123!`

Change these in `.env` before using the app beyond a local demo. The demo login is configured via environment variables and is not a full user-administration system.

## Folder structure

```text
MediTrack-AI/
├── frontend/
│   ├── index.html
│   ├── css/styles.css
│   └── js/app.js
├── backend/
│   ├── server.js
│   ├── seed.js
│   ├── package.json
│   ├── .env.example
│   ├── src/
│   │   ├── config/db.js
│   │   ├── models/index.js
│   │   ├── middleware/auth.js
│   │   ├── routes/api.js
│   │   └── services/forecast.js
│   └── ml/
│       ├── forecast.py
│       └── requirements.txt
└── README.md
```

## Forecasting notes
The Python script aggregates completed sale lines into daily medicine-wise demand, includes zero-sales days, uses lag and calendar features, trains a `RandomForestRegressor`, and creates recursive 7/30-day estimates. A chronological holdout is used for an MAE comparison with a weekly-lag baseline. Seed data is synthetic, so metrics demonstrate the pipeline and do not establish real-world forecasting accuracy.

## Important demo limitations
- This is a coursework/demo application, not a validated production pharmacy or dispensing system.
- Login uses one environment-configured pharmacist account; harden authentication and session storage before deployment.
- For multi-document sale/stock writes, use MongoDB transactions on a replica set and add idempotency protections before production use. The demo performs guarded stock updates but does not promise full transaction rollback if a multi-batch operation fails partway through.
- The default Express session store is in-memory and intended for local development only.
- Python and its listed dependencies must be installed for forecasting. Core inventory/sales pages work independently of the forecast process.
- The dashboard uses Chart.js via CDN, so charts need internet access unless Chart.js is served locally.
- Validate the project against your instructor's report format and run it locally before describing features as tested.
