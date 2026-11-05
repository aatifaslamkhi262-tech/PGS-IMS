const mongoose = require('mongoose');
const uri = 'mongodb+srv://aatifaslamkhi262_db_user:d6NVyVP7vDn5vfd5@pgsgameshop.zkl5dcb.mongodb.net/pgs-ims?retryWrites=true&w=majority';

async function run() {
  await mongoose.connect(uri);
  const attCol = mongoose.connection.collection('attendances');

  const rec = await attCol.findOne({ _id: new mongoose.Types.ObjectId('6ae8b68c0a7b38adb45ef9fa') });
  console.log('Current record:', rec);

  if (rec && rec.checkOut) {
    const grossMinutes = Math.round((new Date(rec.checkOut).getTime() - new Date(rec.checkIn).getTime()) / 60000);
    const cleanFlags = (rec.flags || []).filter(f => f !== 'MISSING_CHECKOUT');
    if (!cleanFlags.includes('MANUAL_CORRECTION')) cleanFlags.push('MANUAL_CORRECTION');

    const newStatus = rec.flags && rec.flags.includes('HALF_DAY_LATE') ? 'HALF_DAY' : (rec.flags && rec.flags.includes('LATE_ARRIVAL') ? 'LATE' : 'PRESENT');

    const res = await attCol.updateOne(
      { _id: rec._id },
      {
        $set: {
          status: newStatus,
          workedMinutes: grossMinutes,
          shortMinutes: Math.max(0, (rec.targetMinutes || 480) - grossMinutes),
          flags: cleanFlags
        }
      }
    );
    console.log('Updated result:', res);
  }
  await mongoose.disconnect();
}

run().catch(console.error);

