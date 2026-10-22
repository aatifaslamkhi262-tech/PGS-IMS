const mongoose = require('mongoose');
const MONGO_URI = 'mongodb+srv://aatifaslamkhi262_db_user:d6NVyVP7vDn5vfd5@pgsgameshop.zkl5dcb.mongodb.net/pgs-ims?retryWrites=true&w=majority';

async function run() {
  await mongoose.connect(MONGO_URI);
  const audit = await mongoose.connection.collection('stockaudits').findOne({ auditNumber: 'AUD-20261021-001' });
  console.log('AUDIT ITEM VARIANCES (non-zero):');
  const nonZero = (audit.itemVariances || []).filter(v => v.variance !== 0);
  console.log(JSON.stringify(nonZero, null, 2));

  const pIds = nonZero.map(v => v.product);
  const invs = await mongoose.connection.collection('inventories').find({ product: { $in: pIds } }).toArray();
  console.log('\nINVENTORIES FOR THESE PRODUCTS:');
  console.log(JSON.stringify(invs, null, 2));

  await mongoose.disconnect();
}

run().catch(console.error);
