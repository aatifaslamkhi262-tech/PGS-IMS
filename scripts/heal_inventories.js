/**
 * scripts/heal_inventories.js
 *
 * Safe Inventory Cost & Transfer Snapshot Healing Script.
 *
 * SAFETIES:
 * 1. Default mode: DRY-RUN (Read-Only). No DB writes occur.
 *    Write mode ONLY activates when explicitly passing: --apply
 * 2. Selection: Checks active pools (quantity > 0). Filterable via --only-sku <list> and --limit N.
 * 3. Statuses:
 *    - UPDATE_CANDIDATE  : Replayable, replayed qty matches current qty, valid replayed avg (> 1), NOT override suspect.
 *    - OVERRIDE_SUSPECT  : Manual cost adjustment record found; skipped from auto-heal.
 *    - MANUAL_REVIEW     : Replayed final qty does not match current DB stock qty; skipped from auto-heal.
 *    - NEEDS_MANUAL_COST : No valid purchase receiving history found (> 1); skipped from auto-heal.
 *    - MATCHED           : Current averageCost already matches replayed averageCost.
 * 4. Transfer Snapshot Healing (--fix-transfers):
 *    - Compares dispatched/received transfer items unitCost vs replayed source pool avg at dispatch time.
 *    - Dry-run by default; creates backups/transfers_<timestamp>.json before --apply execution.
 */

const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const { computeReplayedPools } = require("./costing_replay_helper");

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error("❌ ERROR: MONGO_URI environment variable is required.");
  console.error("Usage example:");
  console.error("  $env:MONGO_URI=\"mongodb+srv://...\"; node scripts/heal_inventories.js");
  console.error("  $env:MONGO_URI=\"mongodb+srv://...\"; node scripts/heal_inventories.js --only-sku SKU123 --limit 10");
  console.error("  $env:MONGO_URI=\"mongodb+srv://...\"; node scripts/heal_inventories.js --fix-transfers");
  console.error("  $env:MONGO_URI=\"mongodb+srv://...\"; node scripts/heal_inventories.js --apply --fix-transfers");
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const isApply = args.includes("--apply");
  const isFixTransfers = args.includes("--fix-transfers");

  // CLI argument parsing for --only-sku and --limit
  let onlySkuList = null;
  const skuIdx = args.indexOf("--only-sku");
  if (skuIdx >= 0 && args[skuIdx + 1]) {
    onlySkuList = args[skuIdx + 1].split(",").map((s) => s.trim().toLowerCase());
  }

  let limitN = 0;
  const limitIdx = args.indexOf("--limit");
  if (limitIdx >= 0 && args[limitIdx + 1]) {
    limitN = parseInt(args[limitIdx + 1], 10) || 0;
  }

  console.log("=".repeat(100));
  console.log(`MODE: ${isApply ? "🚨 APPLY MODE (WRITES ENABLED WITH BACKUP)" : "🛡️ DRY-RUN MODE (READ-ONLY - NO DB WRITES)"}`);
  if (onlySkuList) console.log(`FILTER: --only-sku (${onlySkuList.join(", ")})`);
  if (limitN > 0) console.log(`FILTER: --limit (${limitN})`);
  if (isFixTransfers) console.log(`FEATURE: --fix-transfers enabled`);
  console.log("=".repeat(100));

  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  // 1. Fetch active inventory pools (quantity > 0)
  let candidatePools = await db.collection("inventories").find({ quantity: { $gt: 0 } }).toArray();

  // 2. Replay moving averages using full chronological timeline helper
  const { replayedPools, poolEvents, dispatchReplayedCosts, overrideSuspects, prodMap, locMap } = await computeReplayedPools(db);

  // Apply --only-sku filter if specified
  if (onlySkuList) {
    candidatePools = candidatePools.filter((inv) => {
      const p = prodMap.get(inv.product?.toString());
      const sku = (p?.sku || "").toLowerCase();
      const pId = (inv.product?.toString() || "").toLowerCase();
      return onlySkuList.some((filterStr) => sku.includes(filterStr) || pId.includes(filterStr));
    });
  }

  const reportRows = [];
  const updateCandidates = [];
  const statusCounts = {
    UPDATE_CANDIDATE: 0,
    OVERRIDE_SUSPECT: 0,
    MATCHED: 0,
    MANUAL_REVIEW: 0,
    NEEDS_MANUAL_COST: 0,
  };

  for (const inv of candidatePools) {
    const product = prodMap.get(inv.product?.toString());
    const location = locMap.get(inv.location?.toString());

    const pName = product?.name || inv.product?.toString() || "Unknown Product";
    const sku = product?.sku || "-";
    const locName = location?.name || inv.location?.toString() || "Unknown Location";
    const itemCondition = inv.condition || product?.condition || "New";
    const currentCost = inv.averageCost ?? 0;
    const qty = inv.quantity;

    const poolKey = `${inv.product?.toString()}:${inv.location?.toString()}:${itemCondition}`;
    const replayed = replayedPools[poolKey];

    let status = "MATCHED";
    let reason = "Current averageCost matches replayed averageCost.";
    let targetCost = currentCost;

    const isManualOverride = overrideSuspects.has(inv.product?.toString()) || !!product?.manuallyEditedAt;

    if (isManualOverride) {
      status = "OVERRIDE_SUSPECT";
      reason = "Manual cost adjustment or directory edit detected; skipped from auto-heal.";
    } else if (!replayed || !replayed.hasPurchaseHistory || replayed.avg <= 1) {
      status = "NEEDS_MANUAL_COST";
      reason = "No purchase receiving history with valid unit cost (> 1) found for this pool.";
    } else if (replayed.qty !== qty) {
      status = "MANUAL_REVIEW";
      reason = `Replayed final qty (${replayed.qty}) does not match current stock qty (${qty}).`;
    } else if (Math.abs(currentCost - replayed.avg) > 0.01) {
      status = "UPDATE_CANDIDATE";
      reason = `Current cost (${currentCost}) differs from replayed cost (${replayed.avg}).`;
      targetCost = replayed.avg;
    }

    statusCounts[status]++;

    if (status === "UPDATE_CANDIDATE") {
      updateCandidates.push({
        invId: inv._id,
        newCost: replayed.avg,
        qty,
      });
    }

    reportRows.push({
      invId: inv._id.toString(),
      product: pName,
      sku,
      location: locName,
      condition: itemCondition,
      qty,
      currentAvg: currentCost,
      replayedAvg: replayed?.avg ?? "N/A",
      status,
      reason,
      targetCost,
    });
  }

  // Apply --limit N if specified for update candidates
  let finalUpdateCandidates = updateCandidates;
  if (limitN > 0 && limitN < updateCandidates.length) {
    finalUpdateCandidates = updateCandidates.slice(0, limitN);
  }

  // 3. Print Output CSV
  console.log("\n--- [INVENTORY HEAL AUDIT CSV REPORT] ---");
  console.log("Product,SKU,Location,Condition,Qty,CurrentAvg,ReplayedAvg,Status,Reason");
  for (const r of reportRows) {
    console.log(`"${r.product}","${r.sku}","${r.location}","${r.condition}",${r.qty},${r.currentAvg},${r.replayedAvg},"${r.status}","${r.reason}"`);
  }

  // 4. Status Summary Counts
  console.log("\n--- [STATUS SUMMARY COUNTS] ---");
  console.log(`UPDATE_CANDIDATE  : ${statusCounts.UPDATE_CANDIDATE} (Limit active: ${finalUpdateCandidates.length})`);
  console.log(`OVERRIDE_SUSPECT  : ${statusCounts.OVERRIDE_SUSPECT}`);
  console.log(`MATCHED           : ${statusCounts.MATCHED}`);
  console.log(`MANUAL_REVIEW     : ${statusCounts.MANUAL_REVIEW}`);
  console.log(`NEEDS_MANUAL_COST : ${statusCounts.NEEDS_MANUAL_COST}`);
  console.log(`Total Active Pools: ${candidatePools.length}`);

  // 5. Transfer Snapshot Audit & Healing (--fix-transfers)
  const transferUpdateCandidates = [];
  if (isFixTransfers) {
    console.log("\n--- [TRANSFER SNAPSHOT HEAL CSV REPORT (--fix-transfers)] ---");
    console.log("TransferNumber,Product,Condition,OldUnitCost,ReplayedUnitCost,Status");

    const activeTransfers = await db.collection("stocktransfers").find({ status: { $in: ["Dispatched", "Received"] } }).toArray();

    for (const tr of activeTransfers) {
      for (let i = 0; i < (tr.items || []).length; i++) {
        const item = tr.items[i];
        const pObj = prodMap.get(item.product?.toString());
        const pName = pObj?.name || item.product?.toString();
        const cond = item.condition || "New";
        const dispatchKey = `${tr._id.toString()}:${item.product?.toString()}:${cond}`;

        const oldCost = item.unitCost ?? 0;
        const replayedCost = dispatchReplayedCosts[dispatchKey] ?? 0;

        let status = "MATCHED";
        if (replayedCost <= 1) {
          status = "MANUAL_REVIEW";
        } else if (Math.abs(oldCost - replayedCost) > 0.01) {
          status = "UPDATE_CANDIDATE";
          transferUpdateCandidates.push({
            transferId: tr._id,
            itemIndex: i,
            replayedCost,
          });
        }

        console.log(`"${tr.transferNumber}","${pName}","${cond}",${oldCost},${replayedCost},"${status}"`);
      }
    }

    console.log(`\nTransfer Snapshot Candidates to Update: ${transferUpdateCandidates.length}`);
  }

  // 6. Audit Section for Transfer TRF-20261006-001
  console.log("\n--- [TRANSFER TRF-20261006-001 REPLAY TRACE] ---");
  const trf = await db.collection("stocktransfers").findOne({ transferNumber: "TRF-20261006-001" });
  if (!trf) {
    console.log("Transfer TRF-20261006-001 not found.");
  } else {
    console.log(`Transfer: ${trf.transferNumber} | Status: ${trf.status}`);
    for (const item of trf.items || []) {
      const pObj = prodMap.get(item.product?.toString());
      const pName = pObj?.name || item.product?.toString();
      const cond = item.condition || "New";
      const srcLocId = trf.sourceLocation?.toString();
      const srcKey = `${item.product?.toString()}:${srcLocId}:${cond}`;

      console.log(`\nProduct: ${pName} (${cond}) | Transfer Qty: ${item.quantity}`);
      console.log(`  Transfer Snapshotted unitCost : ${item.unitCost ?? "None"}`);
      console.log(`  Source Pool Replayed Avg Cost : ${replayedPools[srcKey]?.avg ?? "N/A"}`);

      const events = poolEvents[srcKey] || [];
      console.log(`  Timeline Events (${events.length}):`);
      for (const ev of events) {
        console.log(`    - [${ev.type}] ${ev.refNumber} | Date: ${ev.date} | Qty: ${ev.qty} @ Rs.${ev.unitCost} -> NewAvg: ${ev.newAvg}`);
      }
    }
  }

  // 7. Handle --apply mode (Backup + Execution)
  if (isApply) {
    // Inventory Backup & BulkWrite
    if (finalUpdateCandidates.length > 0) {
      console.log(`\n🚨 APPLY MODE: Preparing to update ${finalUpdateCandidates.length} Inventory records...`);
      const backupsDir = path.join(process.cwd(), "backups");
      if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupPath = path.join(backupsDir, `inventories_${timestamp}.json`);

      const affectedIds = finalUpdateCandidates.map((c) => c.invId);
      const docsToBackup = await db.collection("inventories").find({ _id: { $in: affectedIds } }).toArray();

      try {
        fs.writeFileSync(backupPath, JSON.stringify(docsToBackup, null, 2), "utf8");
        console.log(`✅ INVENTORY BACKUP CREATED: ${backupPath} (${docsToBackup.length} records saved)`);
      } catch (backupErr) {
        console.error("❌ INVENTORY BACKUP FAILED! Aborting execution immediately.", backupErr);
        await mongoose.disconnect();
        process.exit(1);
      }

      const bulkOps = finalUpdateCandidates.map((c) => ({
        updateOne: {
          filter: { _id: c.invId },
          update: {
            $set: {
              averageCost: c.newCost,
              totalCostValue: Math.round(c.qty * c.newCost * 100) / 100,
              updatedAt: new Date(),
            },
          },
        },
      }));

      const bulkRes = await db.collection("inventories").bulkWrite(bulkOps);
      console.log(`✅ INVENTORY BULK WRITE COMPLETED: Modified ${bulkRes.modifiedCount} records.`);
    }

    // Transfer Snapshot Backup & BulkWrite (--fix-transfers)
    if (isFixTransfers && transferUpdateCandidates.length > 0) {
      console.log(`\n🚨 APPLY MODE: Preparing to update ${transferUpdateCandidates.length} Transfer items...`);
      const backupsDir = path.join(process.cwd(), "backups");
      if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupPath = path.join(backupsDir, `transfers_${timestamp}.json`);

      const trfIds = Array.from(new Set(transferUpdateCandidates.map((c) => c.transferId)));
      const docsToBackup = await db.collection("stocktransfers").find({ _id: { $in: trfIds } }).toArray();

      try {
        fs.writeFileSync(backupPath, JSON.stringify(docsToBackup, null, 2), "utf8");
        console.log(`✅ TRANSFERS BACKUP CREATED: ${backupPath} (${docsToBackup.length} records saved)`);
      } catch (backupErr) {
        console.error("❌ TRANSFERS BACKUP FAILED! Aborting execution immediately.", backupErr);
        await mongoose.disconnect();
        process.exit(1);
      }

      for (const cand of transferUpdateCandidates) {
        await db.collection("stocktransfers").updateOne(
          { _id: cand.transferId },
          {
            $set: {
              [`items.${cand.itemIndex}.unitCost`]: cand.replayedCost,
              updatedAt: new Date(),
            },
          }
        );
      }
      console.log(`✅ TRANSFERS SNAPSHOT WRITE COMPLETED: Modified ${transferUpdateCandidates.length} transfer items.`);
    }
  } else {
    console.log("\n" + "=".repeat(100));
    console.log(`🛡️ DRY-RUN COMPLETE: 0 DB writes performed.`);
    console.log(`To execute updates with JSON backup, run with: --apply`);
    console.log("=".repeat(100));
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Execution error:", err);
  process.exit(1);
});
