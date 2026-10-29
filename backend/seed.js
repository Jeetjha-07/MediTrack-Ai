require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./src/config/db');
const { Medicine, Batch, Sale, StockAdjustment, ForecastRun } = require('./src/models');

const medicineCatalog = [
  ['Paracetamol 500 mg', 'PARA500', 'Pain relief', 'strip', 25],
  ['Ibuprofen 400 mg', 'IBU400', 'Pain relief', 'strip', 30],
  ['Aspirin 75 mg', 'ASP75', 'Pain relief', 'strip', 22],
  ['Diclofenac 50 mg', 'DIC50', 'Pain relief', 'strip', 28],
  ['Naproxen 250 mg', 'NAP250', 'Pain relief', 'strip', 42],
  ['Mefenamic Acid 500 mg', 'MEF500', 'Pain relief', 'strip', 38],
  ['Meloxicam 7.5 mg', 'MEL75', 'Pain relief', 'strip', 34],
  ['Celecoxib 100 mg', 'CEL100', 'Pain relief', 'capsule', 55],
  ['Ketorolac 10 mg', 'KET10', 'Pain relief', 'tablet', 32],
  ['Tramadol 50 mg', 'TRA50', 'Pain relief', 'capsule', 48],
  ['Cetirizine 10 mg', 'CET10', 'Allergy', 'strip', 18],
  ['Levocetirizine 5 mg', 'LEVO5', 'Allergy', 'strip', 24],
  ['Loratadine 10 mg', 'LORA10', 'Allergy', 'strip', 22],
  ['Fexofenadine 120 mg', 'FEX120', 'Allergy', 'strip', 46],
  ['Chlorpheniramine 4 mg', 'CHL4', 'Allergy', 'strip', 16],
  ['Montelukast 10 mg', 'MON10', 'Allergy', 'strip', 36],
  ['Omeprazole 20 mg', 'OME20', 'Digestive health', 'capsule', 26],
  ['Pantoprazole 40 mg', 'PAN40', 'Digestive health', 'tablet', 32],
  ['Famotidine 20 mg', 'FAM20', 'Digestive health', 'tablet', 24],
  ['Antacid Chewable Tablet', 'ANTACID', 'Digestive health', 'tablet', 12],
  ['Ondansetron 4 mg', 'OND4', 'Digestive health', 'tablet', 30],
  ['Domperidone 10 mg', 'DOM10', 'Digestive health', 'tablet', 28],
  ['Loperamide 2 mg', 'LOP2', 'Digestive health', 'capsule', 20],
  ['Simethicone 80 mg', 'SIM80', 'Digestive health', 'tablet', 18],
  ['Oral Rehydration Salts', 'ORS01', 'Rehydration', 'sachet', 22],
  ['Zinc Sulfate 20 mg', 'ZINC20', 'Supplements', 'tablet', 20],
  ['Vitamin C 500 mg', 'VITC500', 'Supplements', 'tablet', 45],
  ['Vitamin D3 1000 IU', 'VITD1000', 'Supplements', 'capsule', 52],
  ['Multivitamin Tablet', 'MULTI01', 'Supplements', 'tablet', 38],
  ['Ferrous Sulfate 200 mg', 'FER200', 'Supplements', 'tablet', 26],
  ['Calcium Carbonate 500 mg', 'CAL500', 'Supplements', 'tablet', 30],
  ['Amoxicillin 500 mg', 'AMOX500', 'Antibiotic', 'capsule', 58],
  ['Azithromycin 500 mg', 'AZI500', 'Antibiotic', 'tablet', 72],
  ['Cephalexin 500 mg', 'CEPH500', 'Antibiotic', 'capsule', 64],
  ['Doxycycline 100 mg', 'DOX100', 'Antibiotic', 'capsule', 42],
  ['Ciprofloxacin 500 mg', 'CIP500', 'Antibiotic', 'tablet', 48],
  ['Metronidazole 400 mg', 'MET400', 'Antibiotic', 'tablet', 32],
  ['Cefixime 200 mg', 'CEF200', 'Antibiotic', 'tablet', 68],
  ['Co-amoxiclav 625 mg', 'COAM625', 'Antibiotic', 'tablet', 85],
  ['Nitrofurantoin 100 mg', 'NIT100', 'Antibiotic', 'capsule', 54],
  ['Clindamycin 300 mg', 'CLI300', 'Antibiotic', 'capsule', 76],
  ['Metformin 500 mg', 'MET500', 'Diabetes care', 'tablet', 24],
  ['Glimepiride 2 mg', 'GLIM2', 'Diabetes care', 'tablet', 30],
  ['Amlodipine 5 mg', 'AML5', 'Cardiovascular', 'tablet', 26],
  ['Losartan 50 mg', 'LOS50', 'Cardiovascular', 'tablet', 38],
  ['Atorvastatin 10 mg', 'ATO10', 'Cardiovascular', 'tablet', 32],
  ['Levothyroxine 50 mcg', 'LEV50', 'Endocrine', 'tablet', 28],
  ['Salbutamol Inhaler 100 mcg', 'SAL100', 'Respiratory', 'piece', 145],
  ['Budesonide Inhaler 200 mcg', 'BUD200', 'Respiratory', 'piece', 210],
  ['Dextromethorphan Cough Syrup 100 ml', 'DEX100', 'Cold & cough', 'bottle', 78],
  ['Ambroxol Cough Syrup 100 ml', 'AMB100', 'Cold & cough', 'bottle', 82]
];

const packSizes = [1, 2, 5, 10];
const medicines = medicineCatalog.flatMap(([name, code, category, unit, price], catalogIndex) =>
  packSizes.map((packSize, packIndex) => {
    const index = catalogIndex * packSizes.length + packIndex;
    const suffix = `P${String(packSize).padStart(2, '0')}`;
    return {
      name: `${name} (Pack x${packSize})`,
      medicineCode: `${code}-${suffix}`,
      category,
      unit,
      sellingPrice: price * packSize,
      reorderLevel: 8 + (index % 13),
      stock: index % 17 === 0 ? 2 + (index % 5) : 24 + ((index * 19) % 100),
      cost: Number((price * packSize * 0.58).toFixed(2)),
      batch: `${code}-${suffix}-BATCH`,
      daysToExpiry: index % 43 === 0 ? -1 - (index % 9) : index % 19 === 0 ? 5 + (index % 20) : 90 + (index % 330)
    };
  })
);

function roundMoney(value) {
  return Number(value.toFixed(2));
}

async function removeLegacyUniqueIndexes(model, legacyKeys) {
  const collectionExists = await model.db.db
    .listCollections({ name: model.collection.name }, { nameOnly: true })
    .hasNext();
  if (!collectionExists) return;

  const indexes = await model.collection.indexes();
  for (const index of indexes) {
    const keys = Object.keys(index.key);
    const isLegacyIndex = index.unique &&
      keys.length === legacyKeys.length &&
      legacyKeys.every(key => index.key[key] === 1);
    if (isLegacyIndex) {
      await model.collection.dropIndex(index.name);
      console.log(`Removed legacy unique index ${index.name} from ${model.collection.name}.`);
    }
  }
}

function buildSales(medicinesByCode, batchByMedicine, startDate) {
  const sales = [];
  const transactionsPerDay = 8;

  for (let day = 0; day < 180; day++) {
    for (let transaction = 0; transaction < transactionsPerDay; transaction++) {
      const soldAt = new Date(startDate);
      soldAt.setDate(startDate.getDate() + day);
      soldAt.setHours(9 + transaction, (day * 7 + transaction * 13) % 60, 0, 0);

      const itemCount = 3 + ((day + transaction) % 4);
      const items = [];
      for (let itemIndex = 0; itemIndex < itemCount; itemIndex++) {
        const medicineIndex = (day * transactionsPerDay * 5 + transaction * 13 + itemIndex * 43) % medicines.length;
        const medicine = medicines[medicineIndex];
        const savedMedicine = medicinesByCode.get(medicine.medicineCode);
        const batch = batchByMedicine.get(String(savedMedicine._id));
        const quantity = 1 + ((day * 3 + transaction * 5 + itemIndex * 7) % 4);
        const lineTotal = roundMoney(quantity * medicine.sellingPrice);

        items.push({
          medicineId: savedMedicine._id,
          batchId: batch._id,
          medicineName: medicine.name,
          batchNumber: medicine.batch,
          quantity,
          unitPrice: medicine.sellingPrice,
          lineTotal
        });
      }

      const dateCode = `${soldAt.getFullYear()}${String(soldAt.getMonth() + 1).padStart(2, '0')}${String(soldAt.getDate()).padStart(2, '0')}`;
      sales.push({
        saleNumber: `DEMO-${dateCode}-${String(transaction + 1).padStart(2, '0')}`,
        items,
        totalAmount: roundMoney(items.reduce((total, item) => total + item.lineTotal, 0)),
        soldAt,
        status: 'completed'
      });
    }
  }

  return sales;
}

async function main() {
  await connectDB();
  await Promise.all([
    removeLegacyUniqueIndexes(Medicine, ['sku']),
    removeLegacyUniqueIndexes(Batch, ['medicine_id', 'batch_no'])
  ]);
  await Promise.all([
    Medicine.deleteMany({}),
    Batch.deleteMany({}),
    Sale.deleteMany({}),
    StockAdjustment.deleteMany({}),
    ForecastRun.deleteMany({})
  ]);

  const created = await Medicine.insertMany(medicines.map(({ stock, cost, batch, daysToExpiry, ...medicine }) => medicine));
  const byCode = new Map(created.map(medicine => [medicine.medicineCode, medicine]));
  const batchDocs = await Batch.insertMany(medicines.map(medicine => {
    const savedMedicine = byCode.get(medicine.medicineCode);
    const expiry = new Date();
    expiry.setHours(0, 0, 0, 0);
    expiry.setDate(expiry.getDate() + medicine.daysToExpiry);
    return {
      medicineId: savedMedicine._id,
      batchNumber: medicine.batch,
      expiryDate: expiry,
      quantityReceived: medicine.stock,
      quantityAvailable: medicine.stock,
      purchaseCost: medicine.cost,
      receivedAt: new Date(Date.now() - 45 * 86400000)
    };
  }));
  const batchByMedicine = new Map(batchDocs.map(batch => [String(batch.medicineId), batch]));

  const end = new Date();
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - 179);
  const sales = buildSales(byCode, batchByMedicine, start);
  await Sale.insertMany(sales);

  console.log(`Seed complete: ${created.length} medicines, ${batchDocs.length} batches, ${sales.length} sales across 180 days.`);
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(async error => {
    console.error(error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
}

module.exports = { medicines, buildSales, removeLegacyUniqueIndexes };
