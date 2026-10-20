const mongoose = require("mongoose");
const MONGO_URI = "mongodb+srv://aatifaslamkhi262_db_user:d6NVyVP7vDn5vfd5@pgsgameshop.zkl5dcb.mongodb.net/pgs-ims?retryWrites=true&w=majority";

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB for Inventory Cost Repair.");

  const Inventory = mongoose.models.Inventory || mongoose.model("Inventory", new mongoose.Schema({}, { strict: false }));
  const Product = mongoose.models.Product || mongoose.model("Product", new mongoose.Schema({}, { strict: false }));

  // 1. Repair all inventory pools with quantity > 0 but invalid/missing averageCost
  const brokenInvs = await Inventory.find({
    quantity: { $gt: 0 },
    $or: [
      { averageCost: { $exists: false } },
      { averageCost: null },
      { averageCost: { $lte: 1 } }
    ]
  }).lean();

  console.log(`Found ${brokenInvs.length} inventory records needing cost backfill.`);
  let repairedCount = 0;

  for (const inv of brokenInvs) {
    const prod = await Product.findById(inv.product).lean();
    if (prod && prod.costPrice && prod.costPrice > 1) {
      const avgCost = prod.costPrice;
      const totalCostValue = Math.round(inv.quantity * avgCost * 100) / 100;
      await Inventory.updateOne(
        { _id: inv._id },
        {
          $set: {
            averageCost: avgCost,
            totalCostValue: totalCostValue,
            status: "In Stock"
          }
        }
      );
      repairedCount++;
    }
  }

  console.log(`Repaired ${repairedCount} inventory records using Product.costPrice.`);

  // 2. Specifically reconcile PS4 FC 26
  const fc26Id = new mongoose.Types.ObjectId("6aa056f6250929aa1e03657c");
  const fc26Prod = await Product.findById(fc26Id).lean();
  if (fc26Prod) {
    console.log("\nReconciling PS4 FC 26...");
    // 3 units were from previous purchases @ 8500, 2 units from latest purchase @ 7500
    // Total value = 3 * 8500 + 2 * 7500 = 40500. Total qty = 5. Company avg = 8100.
    const companyAvg = 8100;
    await Product.updateOne({ _id: fc26Id }, { $set: { costPrice: companyAvg } });

    const fc26Invs = await Inventory.find({ product: fc26Id, quantity: { $gt: 0 } }).lean();
    for (const inv of fc26Invs) {
      const val = Math.round(inv.quantity * companyAvg * 100) / 100;
      await Inventory.updateOne(
        { _id: inv._id },
        { $set: { averageCost: companyAvg, totalCostValue: val, status: "In Stock" } }
      );
      console.log(`Updated pool ${inv.location} (Qty: ${inv.quantity}) to avgCost: ${companyAvg}, val: ${val}`);
    }
  }

  // 3. Check final state of PS4 FC 26
  const finalProd = await Product.findById(fc26Id).lean();
  console.log(`\nFinal PS4 FC 26 Product CostPrice: ${finalProd.costPrice}`);
  const finalInvs = await Inventory.find({ product: fc26Id }).lean();
  let totalQty = 0;
  let totalVal = 0;
  finalInvs.forEach(i => {
    if (i.quantity > 0) {
      totalQty += i.quantity;
      totalVal += i.totalCostValue;
      console.log(`Pool ${i.location}: Qty ${i.quantity} @ Rs. ${i.averageCost} (Total: ${i.totalCostValue})`);
    }
  });
  console.log(`Total Company Stock: ${totalQty} | Total Valuation: Rs. ${totalVal} | Weighted Avg: Rs. ${totalVal / totalQty}`);

  await mongoose.disconnect();
  console.log("\nDone!");
}

run().catch(console.error);
