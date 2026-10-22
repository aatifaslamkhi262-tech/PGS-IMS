const mongoose = require('mongoose');
const MONGO_URI = 'mongodb+srv://aatifaslamkhi262_db_user:d6NVyVP7vDn5vfd5@pgsgameshop.zkl5dcb.mongodb.net/pgs-ims?retryWrites=true&w=majority';

async function run() {
  await mongoose.connect(MONGO_URI);
  const movements = await mongoose.connection.collection('inventorymovements').find({
    product: { $in: [new mongoose.Types.ObjectId('6ac235bf57fb3e5bcc63ed0f'), new mongoose.Types.ObjectId('6ac236b8e0d5e62826f08fb8')] }
  }).sort({ createdAt: -1 }).limit(10).toArray();

  console.log('MOVEMENTS FOR WOLVERINE JOYSTICKS:');
  for (const m of movements) {
    console.log(m.type, '| Qty:', m.quantity, '| Reason:', m.reason, '| User:', m.user, '| Time:', m.createdAt);
  }

  await mongoose.disconnect();
}

run().catch(console.error);
