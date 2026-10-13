const fs = require('fs');
const mongoose = require('mongoose');

const env = fs.readFileSync('.env', 'utf8');
let uri = '';
env.split('\n').forEach(l => {
  if (l.trim().startsWith('MONGO_URI=')) {
    uri = l.trim().substring('MONGO_URI='.length).replace(/["']/g, '');
  }
});

async function check() {
  await mongoose.connect(uri);
  const Sale = mongoose.models.Sale || mongoose.model('Sale', new mongoose.Schema({}, { strict: false }));
  
  // Test with no params (Dashboard)
  const dashboardQuery = { status: { $in: ["DRAFT", "CHECKOUT", "PAYMENT_PENDING"] } };
  const dashSales = await Sale.find(dashboardQuery).sort({ createdAt: -1 }).limit(10).lean();
  console.log('Dash sales count:', dashSales.length);
  dashSales.forEach(s => console.log('Dash:', s.saleNumber, s.status, s.createdAt));

  // Test with Queue page params
  const queueQuery = { status: { $in: ["DRAFT", "CHECKOUT", "PAYMENT_PENDING"] } };
  const queueSales = await Sale.find(queueQuery).sort({ createdAt: -1 }).limit(10).lean();
  console.log('Queue sales count:', queueSales.length);
  queueSales.forEach(s => console.log('Queue:', s.saleNumber, s.status, s.createdAt));

  process.exit(0);
}
check();
