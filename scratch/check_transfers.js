const mongoose = require('mongoose');
const MONGO_URI = 'mongodb+srv://aatifaslamkhi262_db_user:d6NVyVP7vDn5vfd5@pgsgameshop.zkl5dcb.mongodb.net/pgs-ims?retryWrites=true&w=majority';

async function run() {
  await mongoose.connect(MONGO_URI);
  const transfers = await mongoose.connection.collection('stocktransfers').find({
    createdAt: { $gte: new Date('2026-10-21T13:00:00Z') }
  }).toArray();

  console.log('TRANSFERS CREATED TODAY:');
  for (const t of transfers) {
    console.log(t.transferNumber, '| Status:', t.status, '| Items:', JSON.stringify(t.items));
  }

  await mongoose.disconnect();
}

run().catch(console.error);
