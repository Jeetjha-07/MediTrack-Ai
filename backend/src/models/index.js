
const mongoose = require('mongoose');

// Get Schema from mongoose
const Schema = mongoose.Schema;


// ==========================================
// 1. Medicine Schema
// Stores basic information about medicines
// ==========================================

const MedicineSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },

    medicineCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true
    },

    category: {
      type: String,
      default: 'General',
      trim: true
    },

    unit: {
      type: String,
      required: true,
      enum: [
        'tablet',
        'strip',
        'bottle',
        'box',
        'capsule',
        'sachet',
        'piece'
      ]
    },

    sellingPrice: {
      type: Number,
      required: true,
      min: 0
    },

    reorderLevel: {
      type: Number,
      default: 10,
      min: 0
    },

    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

// Search medicines by name or medicine code
MedicineSchema.index({
  name: 'text',
  medicineCode: 'text'
});


// ==========================================
// 2. Batch Schema
// Stores medicine stock and expiry details
// ==========================================

const BatchSchema = new Schema(
  {
    medicineId: {
      type: Schema.Types.ObjectId,
      ref: 'Medicine',
      required: true,
      index: true
    },

    batchNumber: {
      type: String,
      required: true,
      trim: true
    },

    expiryDate: {
      type: Date,
      required: true
    },

    quantityReceived: {
      type: Number,
      required: true,
      min: 0
    },

    quantityAvailable: {
      type: Number,
      required: true,
      min: 0
    },

    purchaseCost: {
      type: Number,
      required: true,
      min: 0
    },

    receivedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

// The same medicine cannot have duplicate batch numbers
BatchSchema.index(
  { medicineId: 1, batchNumber: 1 },
  { unique: true }
);

// Helps find batches by expiry date
BatchSchema.index({ expiryDate: 1 });


// ==========================================
// 3. Sale Schema
// Stores completed sales and their items
// ==========================================

const SaleSchema = new Schema(
  {
    saleNumber: {
      type: String,
      required: true,
      unique: true
    },

    items: [
      {
        medicineId: {
          type: Schema.Types.ObjectId,
          ref: 'Medicine',
          required: true
        },

        batchId: {
          type: Schema.Types.ObjectId,
          ref: 'Batch',
          required: true
        },

        medicineName: {
          type: String,
          required: true
        },

        batchNumber: {
          type: String,
          required: true
        },

        quantity: {
          type: Number,
          required: true,
          min: 1
        },

        unitPrice: {
          type: Number,
          required: true,
          min: 0
        },

        lineTotal: {
          type: Number,
          required: true,
          min: 0
        }
      }
    ],

    totalAmount: {
      type: Number,
      required: true,
      min: 0
    },

    soldAt: {
      type: Date,
      default: Date.now,
      index: true
    },

    status: {
      type: String,
      enum: ['completed', 'reversed'],
      default: 'completed'
    }
  },
  {
    timestamps: true
  }
);

// Helps search sales by medicine and sale date
SaleSchema.index({
  'items.medicineId': 1,
  soldAt: 1
});


// ==========================================
// 4. Stock Adjustment Schema
// Records changes in medicine stock
// ==========================================

const StockAdjustmentSchema = new Schema(
  {
    medicineId: {
      type: Schema.Types.ObjectId,
      ref: 'Medicine',
      required: true
    },

    batchId: {
      type: Schema.Types.ObjectId,
      ref: 'Batch',
      required: true
    },

    changeQuantity: {
      type: Number,
      required: true
    },

    reason: {
      type: String,
      required: true,
      enum: [
        'received',
        'damaged',
        'expired_writeoff',
        'correction',
        'return'
      ]
    },

    notes: {
      type: String,
      default: '',
      maxlength: 500
    }
  },
  {
    timestamps: true
  }
);


// ==========================================
// 5. Forecast Run Schema
// Stores medicine demand predictions
// ==========================================

const ForecastRunSchema = new Schema(
  {
    generatedAt: {
      type: Date,
      default: Date.now,
      index: true
    },

    horizonDays: {
      type: Number,
      required: true,
      enum: [7, 30]
    },

    modelName: {
      type: String,
      default: 'RandomForestRegressor'
    },

    modelVersion: {
      type: String,
      default: 'baseline-v1'
    },

    trainingDataThrough: {
      type: Date
    },

    metrics: {
      mae: Number,
      baselineMae: Number
    },

    status: {
      type: String,
      enum: ['success', 'failed'],
      default: 'success'
    },

    errorMessage: {
      type: String,
      default: ''
    },

    // Predictions for individual medicines
    predictions: [
      {
        medicineId: {
          type: Schema.Types.ObjectId,
          ref: 'Medicine'
        },

        medicineName: String,

        // Predicted demand for each day
        dailyPredictions: [
          {
            date: Date,
            quantity: Number
          }
        ],

        // Total predicted demand
        totalDemand: {
          type: Number,
          min: 0
        },

        // Stock currently available for sale
        currentSellableStock: {
          type: Number,
          min: 0
        },

        // Suggested quantity to reorder
        suggestedReorder: {
          type: Number,
          min: 0
        }
      }
    ]
  },
  {
    timestamps: true
  }
);


// ==========================================
// 6. Create and Export Models
// Makes the schemas available in other files
// ==========================================

const Medicine = mongoose.model('Medicine', MedicineSchema);
const Batch = mongoose.model('Batch', BatchSchema);
const Sale = mongoose.model('Sale', SaleSchema);
const StockAdjustment = mongoose.model(
  'StockAdjustment',
  StockAdjustmentSchema
);
const ForecastRun = mongoose.model('ForecastRun', ForecastRunSchema);


// Export all models
module.exports = {
  Medicine,
  Batch,
  Sale,
  StockAdjustment,
  ForecastRun
};
