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
  const sales = await Sale.find({
    saleNumber: { $in: ['WEB-20261011-5052', 'SALE-20261010-007', 'WEB-20261009-4801'] }
  }).lean();

  console.log('Found sales count:', sales.length);
  sales.forEach(s => {
    console.log(JSON.stringify({
      saleNumber: s.saleNumber,
      status: s.status,
      saleSource: s.saleSource,
      location: s.location,
      locationName: s.locationName,
      salesman: s.salesman,
      salesmanName: s.salesmanName,
      createdAt: s.createdAt
    }, null, 2));
  });
  process.exit(0);
}
check();
