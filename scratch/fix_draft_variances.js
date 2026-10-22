const mongoose = require('mongoose');
const MONGO_URI = 'mongodb+srv://aatifaslamkhi262_db_user:d6NVyVP7vDn5vfd5@pgsgameshop.zkl5dcb.mongodb.net/pgs-ims?retryWrites=true&w=majority';

async function run() {
  await mongoose.connect(MONGO_URI);
  const audit = await mongoose.connection.collection('stockaudits').findOne({ auditNumber: 'AUD-20261021-001' });
  if (!audit) {
    console.log('Audit not found');
    return;
  }

  // Update itemVariances so physicalQuantity equals systemQuantity for all non-serialized items
  const updatedVariances = (audit.itemVariances || []).map(v => {
    return {
      ...v,
      physicalQuantity: v.systemQuantity,
      variance: 0,
      totalCostDelta: 0
    };
  });

  const unregisteredCount = audit.unregisteredSerials?.length || 0;
  const reactivatedCount = audit.reactivatedSerials?.length || 0;
  const newSurplus = unregisteredCount + reactivatedCount; // should be exactly 2

  // Recalculate net cost delta: only missing serials
  const missingCost = (audit.missingSerials || []).reduce((acc, m) => acc + (m.unitCost || 0), 0);
  const newNetCostDelta = -missingCost;

  await mongoose.connection.collection('stockaudits').updateOne(
    { _id: audit._id },
    {
      $set: {
        itemVariances: updatedVariances,
        'summary.totalSurplusUnits': newSurplus,
        'summary.netCostDelta': newNetCostDelta
      }
    }
  );

  console.log('Successfully synced AUD-20261021-001! New Surplus:', newSurplus);
  await mongoose.disconnect();
}

run().catch(console.error);
