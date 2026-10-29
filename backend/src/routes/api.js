const express = require('express');
const bcrypt = require('bcryptjs');
const { Medicine, Batch, Sale, StockAdjustment, ForecastRun } = require('../models');
const { requireAuth } = require('../middleware/auth');
const { runPython } = require('../services/forecast');

const router = express.Router();
const dayStart = d => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const isExpired = (date) => dayStart(date) < dayStart(new Date());
const isSellableExpiry = (date) => dayStart(date) > dayStart(new Date());
const isExpiringSoon = date => {
  const today = dayStart(new Date());
  const exp = dayStart(date);
  const days = Math.round((exp - today) / 86400000);
  return days >= 0 && days <= 30;
};

router.post('/auth/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const expectedEmail = String(process.env.PHARMACIST_EMAIL || 'pharmacist@meditrack.local').toLowerCase();
  const expectedPassword = process.env.PHARMACIST_PASSWORD || 'ChangeMe123!';
  const valid = email === expectedEmail && await bcrypt.compare(password, await bcrypt.hash(expectedPassword, 10));
  if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });
  req.session.authenticated = true;
  req.session.pharmacist = process.env.PHARMACIST_NAME || 'Demo Pharmacist';
  res.json({ name: req.session.pharmacist, email });
});
router.post('/auth/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
router.get('/auth/me', (req, res) => res.json({ authenticated: !!req.session?.authenticated, name: req.session?.pharmacist || '' }));

router.use(requireAuth);

router.get('/dashboard/summary', async (req, res, next) => {
  try {
    const [medicines, batches, recentSales, salesAgg] = await Promise.all([
      Medicine.countDocuments({ isActive: true }),
      Batch.find().populate('medicineId', 'name medicineCode reorderLevel').lean(),
      Sale.find({ status: 'completed' }).sort({ soldAt: -1 }).limit(6).lean(),
      Sale.aggregate([{ $match: { status: 'completed', soldAt: { $gte: new Date(Date.now() - 30*86400000) } } }, { $group: { _id: null, revenue: { $sum: '$totalAmount' }, transactions: { $sum: 1 } } }])
    ]);
    const expired = batches.filter(b => isExpired(b.expiryDate) && b.quantityAvailable > 0);
    const expiring = batches.filter(b => isExpiringSoon(b.expiryDate) && !isExpired(b.expiryDate) && b.quantityAvailable > 0);
    const active = batches.filter(b => !isExpired(b.expiryDate));
    const stockByMedicine = {};
    for (const b of active) {
      const id = String(b.medicineId?._id || '');
      if (id) stockByMedicine[id] = (stockByMedicine[id] || 0) + b.quantityAvailable;
    }
    const lowStock = Object.entries(stockByMedicine).filter(([id, qty]) => {
      const med = batches.find(b => String(b.medicineId?._id) === id)?.medicineId;
      return med && qty <= med.reorderLevel;
    }).length;
    const chart = await Sale.aggregate([
      { $match: { status: 'completed', soldAt: { $gte: new Date(Date.now() - 6*86400000) } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$soldAt' } }, revenue: { $sum: '$totalAmount' } } },
      { $sort: { _id: 1 } }
    ]);
    res.json({ medicineCount: medicines, lowStockCount: lowStock, expiredBatchCount: expired.length, expiringSoonCount: expiring.length,
      revenue30Days: salesAgg[0]?.revenue || 0, transactions30Days: salesAgg[0]?.transactions || 0,
      recentSales, chart, alerts: [...expired.map(b => ({ type:'expired', medicine:b.medicineId?.name, batch:b.batchNumber, expiryDate:b.expiryDate, quantity:b.quantityAvailable })), ...expiring.map(b => ({ type:'expiring', medicine:b.medicineId?.name, batch:b.batchNumber, expiryDate:b.expiryDate, quantity:b.quantityAvailable }))].slice(0,8) });
  } catch (e) { next(e); }
});

router.get('/medicines', async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim();
    const filter = { isActive: true };
    if (search) filter.$or = [{ name: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }, { medicineCode: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }];
    const docs = await Medicine.find(filter).sort({ name: 1 }).lean();
    const batches = await Batch.find({ medicineId: { $in: docs.map(m => m._id) } }).lean();
    res.json(docs.map(m => {
      const own = batches.filter(b => String(b.medicineId) === String(m._id));
      const sellable = own.filter(b => !isExpired(b.expiryDate)).reduce((s,b) => s+b.quantityAvailable,0);
      return { ...m, totalStock: sellable, batches: own.map(b => ({...b, expired: isExpired(b.expiryDate), expiringSoon: isExpiringSoon(b.expiryDate)})) };
    }));
  } catch (e) { next(e); }
});

router.post('/medicines', async (req, res, next) => {
  try {
    const body = req.body;
    const name = String(body.name || '').trim();
    const medicineCode = String(body.medicineCode || '').trim().toUpperCase();
    const unit = String(body.unit || 'strip');
    const sellingPrice = Number(body.sellingPrice);
    const reorderLevel = Number(body.reorderLevel ?? 10);
    const hasBatch = Boolean(body.batchNumber || body.expiryDate);
    const quantity = Number(body.quantity || 0);
    const purchaseCost = Number(body.purchaseCost || 0);
    if (!name || !medicineCode || !Number.isFinite(sellingPrice) || sellingPrice < 0 || !Number.isFinite(reorderLevel) || reorderLevel < 0) return res.status(400).json({ error: 'Enter a name, code, valid price and reorder level.' });
    if (hasBatch && (!body.batchNumber || !body.expiryDate || Number.isNaN(new Date(body.expiryDate).getTime()) || !Number.isInteger(quantity) || quantity < 0 || !Number.isFinite(purchaseCost) || purchaseCost < 0)) return res.status(400).json({ error: 'Provide a valid batch number, expiry date, whole-number quantity and purchase cost.' });
    const med = await Medicine.create({ name, medicineCode, category: body.category || 'General', unit, sellingPrice, reorderLevel });
    if (hasBatch) {
      await Batch.create({ medicineId: med._id, batchNumber: String(body.batchNumber).trim(), expiryDate: new Date(body.expiryDate), quantityReceived: quantity, quantityAvailable: quantity, purchaseCost });
    }
    res.status(201).json(med);
  } catch (e) { if (e.code === 11000) return res.status(409).json({ error: 'Medicine code already exists.' }); next(e); }
});

router.patch('/medicines/:id', async (req, res, next) => {
  try {
    const allowed = ['name','category','unit','sellingPrice','reorderLevel'];
    const update = {};
    for (const k of allowed) if (req.body[k] !== undefined) update[k] = req.body[k];
    const med = await Medicine.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!med) return res.status(404).json({ error: 'Medicine not found.' });
    res.json(med);
  } catch (e) { next(e); }
});
router.delete('/medicines/:id', async (req, res, next) => {
  try {
    const med = await Medicine.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!med) return res.status(404).json({ error: 'Medicine not found.' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/batches', async (req, res, next) => {
  try {
    const batches = await Batch.find().populate('medicineId', 'name medicineCode unit reorderLevel').sort({ expiryDate: 1 }).lean();
    res.json(batches.map(b => ({ ...b, expired: isExpired(b.expiryDate), expiringSoon: isExpiringSoon(b.expiryDate) })));
  } catch (e) { next(e); }
});
router.post('/batches', async (req, res, next) => {
  try {
    const { medicineId, batchNumber, expiryDate, quantity, purchaseCost } = req.body;
    const qty = Number(quantity);
    if (!medicineId || !batchNumber || !expiryDate || !Number.isInteger(qty) || qty < 0 || !Number.isFinite(Number(purchaseCost)) || Number(purchaseCost) < 0) return res.status(400).json({ error: 'Enter valid batch details.' });
    const medicine = await Medicine.findById(medicineId);
    if (!medicine) return res.status(404).json({ error: 'Medicine not found.' });
    const batch = await Batch.create({ medicineId, batchNumber: String(batchNumber).trim(), expiryDate: new Date(expiryDate), quantityReceived: qty, quantityAvailable: qty, purchaseCost: Number(purchaseCost) });
    res.status(201).json(batch);
  } catch (e) { if (e.code === 11000) return res.status(409).json({ error: 'That batch number already exists for this medicine.' }); next(e); }
});

router.post('/sales', async (req, res, next) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: 'Add at least one medicine to the sale.' });
    const plan = [];
    const medicineIds = new Set();
    for (const item of items) {
      const medicine = await Medicine.findOne({ _id: item.medicineId, isActive: true });
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unitPrice ?? medicine?.sellingPrice);
      if (!medicine || !Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(unitPrice) || unitPrice < 0) return res.status(400).json({ error: 'Enter a valid medicine, quantity and unit price for each sale item.' });
      if (medicineIds.has(String(medicine._id))) return res.status(400).json({ error: 'Each medicine can only be added once to a sale.' });
      medicineIds.add(String(medicine._id));
      let remaining = quantity;
      const batches = await Batch.find({ medicineId: medicine._id, quantityAvailable: { $gt: 0 } }).sort({ expiryDate: 1 });
      for (const batch of batches) {
        if (!isSellableExpiry(batch.expiryDate)) continue;
        const take = Math.min(remaining, batch.quantityAvailable);
        if (take > 0) {
          plan.push({ medicine, batch, quantity: take, unitPrice });
          remaining -= take;
        }
        if (!remaining) break;
      }
      if (remaining > 0) return res.status(400).json({ error: `Insufficient unexpired stock for ${medicine.name}.` });
    }
    const appliedStock = [];
    const restoreStock = async () => {
      for (const line of appliedStock.reverse()) {
        const restored = await Batch.updateOne({ _id: line.batch._id }, { $inc: { quantityAvailable: line.quantity } });
        if (restored.modifiedCount !== 1) throw new Error(`Could not restore stock for ${line.medicine.name} after a failed sale.`);
      }
    };
    let stockConflict = false;
    try {
      for (const line of plan) {
        const result = await Batch.updateOne({ _id: line.batch._id, quantityAvailable: { $gte: line.quantity } }, { $inc: { quantityAvailable: -line.quantity } });
        if (result.modifiedCount !== 1) {
          stockConflict = true;
          break;
        }
        appliedStock.push(line);
      }
    } catch (error) {
      await restoreStock();
      throw error;
    }
    if (stockConflict) {
      await restoreStock();
      return res.status(409).json({ error: 'Stock changed during sale. Refresh and try again.' });
    }
    const saleItems = plan.map(line => ({ medicineId: line.medicine._id, batchId: line.batch._id, medicineName: line.medicine.name, batchNumber: line.batch.batchNumber, quantity: line.quantity, unitPrice: line.unitPrice, lineTotal: Number((line.quantity * line.unitPrice).toFixed(2)) }));
    const totalAmount = Number(saleItems.reduce((s,i) => s+i.lineTotal,0).toFixed(2));
    let sale;
    try {
      sale = await Sale.create({ saleNumber: 'MT-' + Date.now(), items: saleItems, totalAmount, soldAt: req.body.soldAt ? new Date(req.body.soldAt) : new Date() });
    } catch (error) {
      await restoreStock();
      throw error;
    }
    res.status(201).json(sale);
  } catch (e) { next(e); }
});
router.get('/sales/analytics', async (req, res, next) => {
  try {
    const days = Number(req.query.days || 30);
    if (![7, 30, 90].includes(days)) return res.status(400).json({ error: 'Analytics period must be 7, 30 or 90 days.' });

    const now = new Date();
    const currentStart = new Date(now.getTime() - days * 86400000);
    const previousStart = new Date(now.getTime() - 2 * days * 86400000);
    const [result] = await Sale.aggregate([
      { $match: { status: 'completed', soldAt: { $gte: previousStart } } },
      { $addFields: { unitCount: { $sum: '$items.quantity' } } },
      { $facet: {
        periods: [
          { $group: {
            _id: { $cond: [{ $gte: ['$soldAt', currentStart] }, 'current', 'previous'] },
            revenue: { $sum: '$totalAmount' },
            transactions: { $sum: 1 },
            unitsSold: { $sum: '$unitCount' }
          } }
        ],
        trend: [
          { $match: { soldAt: { $gte: currentStart } } },
          { $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$soldAt' } },
            revenue: { $sum: '$totalAmount' },
            transactions: { $sum: 1 }
          } },
          { $sort: { _id: 1 } }
        ],
        topProducts: [
          { $match: { soldAt: { $gte: currentStart } } },
          { $unwind: '$items' },
          { $group: {
            _id: '$items.medicineId',
            name: { $first: '$items.medicineName' },
            quantity: { $sum: '$items.quantity' },
            revenue: { $sum: '$items.lineTotal' }
          } },
          { $sort: { quantity: -1, revenue: -1 } },
          { $limit: 8 }
        ],
        categories: [
          { $match: { soldAt: { $gte: currentStart } } },
          { $unwind: '$items' },
          { $lookup: {
            from: Medicine.collection.name,
            localField: 'items.medicineId',
            foreignField: '_id',
            as: 'medicine'
          } },
          { $group: {
            _id: { $ifNull: [{ $arrayElemAt: ['$medicine.category', 0] }, 'General'] },
            revenue: { $sum: '$items.lineTotal' },
            quantity: { $sum: '$items.quantity' }
          } },
          { $sort: { revenue: -1 } },
          { $limit: 8 }
        ]
      } }
    ]);

    const periods = Object.fromEntries((result?.periods || []).map(period => [period._id, period]));
    const current = periods.current || { revenue: 0, transactions: 0, unitsSold: 0 };
    const previous = periods.previous || { revenue: 0, transactions: 0, unitsSold: 0 };
    res.json({
      days,
      revenue: current.revenue,
      transactions: current.transactions,
      unitsSold: current.unitsSold,
      averageTransaction: current.transactions ? current.revenue / current.transactions : 0,
      previousRevenue: previous.revenue,
      previousTransactions: previous.transactions,
      trend: result?.trend || [],
      topProducts: result?.topProducts || [],
      categories: result?.categories || []
    });
  } catch (e) { next(e); }
});
router.get('/sales', async (req, res, next) => {
  try {
    const sales = await Sale.find().sort({ soldAt: -1 }).limit(250).lean();
    res.json(sales);
  } catch (e) { next(e); }
});

router.post('/stock-adjustments', async (req, res, next) => {
  try {
    const { batchId, changeQuantity, reason, notes } = req.body;
    const change = Number(changeQuantity);
    if (!batchId || !Number.isInteger(change) || change === 0 || !['received','damaged','expired_writeoff','correction','return'].includes(reason)) return res.status(400).json({ error: 'Enter a valid adjustment and reason.' });
    const batch = await Batch.findById(batchId);
    if (!batch) return res.status(404).json({ error: 'Batch not found.' });
    if (batch.quantityAvailable + change < 0) return res.status(400).json({ error: 'Adjustment cannot make stock negative.' });
    batch.quantityAvailable += change;
    if (change > 0) batch.quantityReceived += change;
    await batch.save();
    const adjustment = await StockAdjustment.create({ medicineId: batch.medicineId, batchId, changeQuantity: change, reason, notes: notes || '' });
    res.status(201).json(adjustment);
  } catch (e) { next(e); }
});

router.get('/alerts', async (req, res, next) => {
  try {
    const batches = await Batch.find({ quantityAvailable: { $gt: 0 } }).populate('medicineId', 'name medicineCode reorderLevel').lean();
    const alerts = [];
    const byMed = {};
    for (const b of batches) {
      if (isExpired(b.expiryDate)) alerts.push({ type:'expired', severity:'critical', medicine:b.medicineId?.name, medicineId:b.medicineId?._id, batchNumber:b.batchNumber, expiryDate:b.expiryDate, quantity:b.quantityAvailable });
      else if (isExpiringSoon(b.expiryDate)) alerts.push({ type:'expiring', severity:'warning', medicine:b.medicineId?.name, medicineId:b.medicineId?._id, batchNumber:b.batchNumber, expiryDate:b.expiryDate, quantity:b.quantityAvailable });
      if (!isExpired(b.expiryDate) && b.medicineId) byMed[String(b.medicineId._id)] = (byMed[String(b.medicineId._id)] || 0) + b.quantityAvailable;
    }
    for (const [id, qty] of Object.entries(byMed)) {
      const med = batches.find(b => String(b.medicineId?._id) === id)?.medicineId;
      if (med && qty <= med.reorderLevel) alerts.push({ type:'low_stock', severity:'warning', medicine:med.name, medicineId:id, quantity:qty, reorderLevel:med.reorderLevel });
    }
    res.json(alerts);
  } catch (e) { next(e); }
});

router.post('/forecasts/run', async (req, res, next) => {
  try {
    const horizon = Number(req.body.horizonDays || 7);
    if (![7,30].includes(horizon)) return res.status(400).json({ error: 'Forecast horizon must be 7 or 30 days.' });
    const result = await runPython([String(horizon)]);
    const medMap = new Map((await Medicine.find({ isActive: true }).lean()).map(m => [String(m._id),m]));
    const batchDocs = await Batch.find().lean();
    const predictions = (result.predictions || []).map(p => {
      const med = medMap.get(String(p.medicineId));
      const stock = batchDocs.filter(b => String(b.medicineId) === String(p.medicineId) && !isExpired(b.expiryDate)).reduce((s,b)=>s+b.quantityAvailable,0);
      return { ...p, medicineName: med?.name || p.medicineName, currentSellableStock: stock, suggestedReorder: Math.max(0, Math.ceil(p.totalDemand - stock)) };
    }).filter(p => p.suggestedReorder > 0);
    const run = await ForecastRun.create({ horizonDays:horizon, modelName:result.modelName || 'RandomForestRegressor', modelVersion:'baseline-v1', trainingDataThrough:result.trainingDataThrough ? new Date(result.trainingDataThrough) : undefined, metrics:result.metrics || {}, predictions });
    res.json(run);
  } catch (e) { res.status(500).json({ error: 'Forecast could not be generated. Check Python dependencies and seeded sales data.', detail: e.message }); }
});
router.get('/forecasts/latest', async (req, res, next) => {
  try {
    const horizon = Number(req.query.horizonDays || 7);
    const run = await ForecastRun.findOne({ horizonDays:horizon, status:'success' }).sort({ generatedAt:-1 }).lean();
    res.json(run || { predictions: [], message:'No forecast generated yet. Run a forecast to see estimates.' });
  } catch (e) { next(e); }
});

module.exports = router;
