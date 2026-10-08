/**
 * scripts/audit_costing_replay.js
 *
 * READ-ONLY Audit & Moving Average Cost Replay Script.
 *
 * SAFETIES:
 * 1. STRICTLY READ-ONLY. Contains NO db write methods (.save, .updateOne, .updateMany, .insert, .delete, .remove).
 * 2. Connects to process.env.MONGO_URI.
 * 3. Replays all approved PurchaseReceivings in chronological order per pool (Product + Location + Condition).
 * 4. Traces transfer TRF-20261006-001 items snapshot vs source pool avg vs replayed avg.
 *
 * Usage:
 *   $env:MONGO_URI="mongodb+srv://..."; node scripts/audit_costing_replay.js
 */

const mongoose = require("mongoose");
const { computeReplayedPools } = require("./costing_replay_helper");

const uri = process.env.MONGO_URI;

async function main() {
  if (!uri) {
    console.error("❌ ERROR: MONGO_URI environment variable is required.");
    console.error("Usage example:");
    console.error("  $env:MONGO_URI=\"mongodb+srv://...\"; node scripts/audit_costing_replay.js");
    process.exit(1);
  }

  console.log("=".repeat(100));
  console.log("🛡️ MODE: READ-ONLY AUDIT & COST REPLAY (NO DB WRITES OCCUR)");
  console.log("=".repeat(100));

  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const inventories = await db.collection("inventories").find({}).toArray();
  const { replayedPools, poolEvents, prodMap, locMap } = await computeReplayedPools(db);

  console.log("\n--- INVENTORY COSTING AUDIT (CSV FORMAT) ---");
  console.log("InventoryID,Product,Condition,Location,Quantity,CurrentAvgCost,TotalCostVal,Flag,ReplayedAvgCost");

  for (const inv of inventories) {
    const pObj = prodMap.get(inv.product?.toString());
    const lObj = locMap.get(inv.location?.toString());
    const pName = pObj?.name || inv.product?.toString();
    const lName = lObj?.name || inv.location?.toString();
    const cond = inv.condition || "New";
    const key = `${inv.product?.toString()}:${inv.location?.toString()}:${cond}`;
    const replayed = replayedPools[key]?.avg || "N/A";

    let flag = "OK";
    if (inv.quantity > 0 && (inv.averageCost === undefined || inv.averageCost <= 0)) {
      flag = "ZERO_COST_ACTIVE_POOL";
    } else if (inv.quantity > 0 && inv.averageCost <= 1) {
      flag = "PLACEHOLDER_COST_ACTIVE_POOL";
    }

    console.log(`"${inv._id}","${pName}","${cond}","${lName}",${inv.quantity},${inv.averageCost ?? 0},${inv.totalCostValue ?? 0},"${flag}",${replayed}`);
  }

  // Trace Specific Transfer TRF-20261006-001
  console.log("\n--- TRANSFER TRF-20261006-001 SNAPSHOT TRACE ---");
  const trf = await db.collection("stocktransfers").findOne({ transferNumber: "TRF-20261006-001" });

  if (!trf) {
    console.log("Transfer TRF-20261006-001 not found in database.");
  } else {
    console.log(`Transfer: ${trf.transferNumber} | Status: ${trf.status} | CreatedAt: ${trf.createdAt}`);
    for (const item of trf.items || []) {
      const pObj = prodMap.get(item.product?.toString());
      const pName = pObj?.name || item.product?.toString();
      const cond = item.condition || "New";
      const srcLocId = trf.sourceLocation?.toString();
      const srcKey = `${item.product?.toString()}:${srcLocId}:${cond}`;
      const srcInv = inventories.find((i) => i.product?.toString() === item.product?.toString() && i.location?.toString() === srcLocId && i.condition === cond);

      console.log(`- Item: ${pName} (${cond}) | Qty: ${item.quantity}`);
      console.log(`  Snapshotted unitCost: ${item.unitCost ?? "None"}`);
      console.log(`  Source Pool Current Avg: ${srcInv?.averageCost ?? "N/A"}`);
      console.log(`  Source Pool Replayed Avg: ${replayedPools[srcKey]?.avg ?? "N/A"}`);

      const events = poolEvents[srcKey] || [];
      console.log(`  Source Pool Approved Receiving Replay Events (${events.length}):`);
      for (const ev of events) {
        console.log(`    * [${ev.receivingNumber}] Date: ${ev.date} | IntakeQty: ${ev.intakeQty} @ Rs.${ev.unitCost} -> NewAvg: ${ev.newAvg}`);
      }
    }
  }

  await mongoose.disconnect();
  console.log("\n✅ READ-ONLY Audit Completed.");
}

main().catch((err) => {
  console.error("❌ Audit script failed:", err);
  process.exit(1);
});
