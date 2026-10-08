/**
 * scripts/costing_replay_helper.js
 *
 * Full Chronological Timeline Replay Engine for PGS-IMS.
 * Replays ALL inventory movement events globally across all locations in exact chronological order:
 * 1. Approved Purchase Receivings (Qty IN, blend unitCost)
 * 2. Transfer Dispatch (Source Qty OUT, source replayed avg snapshotted)
 * 3. Transfer Receive (Destination Qty IN, blend using source replayed avg at dispatch time)
 * 4. Transfer Cancel (Source Qty back IN)
 * 5. Sales (Qty OUT, avg unchanged)
 * 6. Sales & Rental Returns (Qty IN, avg unchanged per Option A)
 * 7. Opening Stock & Adjustments (Qty IN/OUT, blend if valid cost > 1)
 * 8. Manual Cost Adjustments (Updates pool avg if costType === "MANUAL_OVERRIDE")
 */

const COST_PLACEHOLDER_MAX = 1;

function isValidCost(cost) {
  return typeof cost === "number" && !isNaN(cost) && cost > COST_PLACEHOLDER_MAX;
}

function blendAverageCost({ existingQty, existingAvg, incomingQty, incomingCost }) {
  const inQty = Math.max(1, Number(incomingQty || 1));
  const inCost = Number(incomingCost || 0);

  if (!isValidCost(inCost)) {
    throw new Error(`Invalid incoming cost: ${inCost}`);
  }

  const exQty = Math.max(0, Number(existingQty || 0));
  const exAvg = Number(existingAvg || 0);

  if (exQty <= 0 || !isValidCost(exAvg)) {
    return inCost;
  }

  const totalQty = exQty + inQty;
  const totalVal = exQty * exAvg + inQty * inCost;
  return Math.round((totalVal / totalQty) * 100) / 100;
}

async function computeReplayedPools(db) {
  const products = await db.collection("products").find({}).toArray();
  const locations = await db.collection("locations").find({}).toArray();
  const invoices = await db.collection("purchaseinvoices").find({}).toArray();
  const receivings = await db.collection("purchasereceivings").find({ status: "Approved" }).toArray();
  const transfers = await db.collection("stocktransfers").find({}).toArray();
  const sales = await db.collection("sales").find({ status: "COMPLETED" }).toArray();
  const movements = await db.collection("inventorymovements").find({}).toArray();
  const costAdjustments = await db.collection("costadjustments").find({}).toArray();

  const prodMap = new Map(products.map((p) => [p._id.toString(), p]));
  const locMap = new Map(locations.map((l) => [l._id.toString(), l]));
  const invMap = new Map(invoices.map((inv) => [inv._id.toString(), inv]));

  // Build unified global chronological timeline array
  const timeline = [];

  // 1. Approved Purchase Receivings
  for (const r of receivings) {
    const date = r.approvedAt ? new Date(r.approvedAt) : (r.createdAt ? new Date(r.createdAt) : new Date());
    const parentInv = r.purchaseInvoice ? invMap.get(r.purchaseInvoice.toString()) : null;

    for (const item of r.items || []) {
      const pId = item.product?.toString();
      const cond = item.condition || "New";
      let unitCost = 0;

      if (parentInv && Array.isArray(parentInv.items)) {
        const invLine = parentInv.items.find((l) => l.product?.toString() === pId && l.condition === cond);
        if (invLine && invLine.unitCost > 1) {
          unitCost = invLine.unitCost;
        }
      }

      if (unitCost <= 1) {
        const prodObj = prodMap.get(pId);
        if (prodObj && prodObj.costPrice > 1) {
          unitCost = prodObj.costPrice;
        }
      }

      timeline.push({
        eventType: "PURCHASE_RECEIVING",
        date,
        refNumber: r.receivingNumber,
        productId: pId,
        locationId: r.location?.toString(),
        condition: cond,
        qty: Number(item.quantityReceived || 0),
        unitCost,
      });
    }
  }

  // 2. Stock Transfers (Dispatch, Receive, Cancel)
  for (const tr of transfers) {
    const dispatchDate = tr.dispatchedAt ? new Date(tr.dispatchedAt) : (tr.createdAt ? new Date(tr.createdAt) : new Date());
    const receiveDate = tr.receivedAt ? new Date(tr.receivedAt) : (tr.updatedAt ? new Date(tr.updatedAt) : dispatchDate);
    const cancelDate = tr.cancelledAt ? new Date(tr.cancelledAt) : (tr.updatedAt ? new Date(tr.updatedAt) : dispatchDate);

    if (tr.status === "Dispatched" || tr.status === "Received" || tr.dispatchedAt) {
      for (const item of tr.items || []) {
        timeline.push({
          eventType: "TRANSFER_DISPATCH",
          date: dispatchDate,
          refNumber: tr.transferNumber,
          transferId: tr._id.toString(),
          productId: item.product?.toString(),
          locationId: tr.sourceLocation?.toString(),
          condition: item.condition || "New",
          qty: Number(item.quantity || 0),
          unitCost: item.unitCost || 0,
        });
      }
    }

    if (tr.status === "Received") {
      for (const item of tr.items || []) {
        timeline.push({
          eventType: "TRANSFER_RECEIVE",
          date: receiveDate,
          refNumber: tr.transferNumber,
          transferId: tr._id.toString(),
          productId: item.product?.toString(),
          locationId: tr.destinationLocation?.toString(),
          sourceLocationId: tr.sourceLocation?.toString(),
          condition: item.condition || "New",
          qty: Number(item.quantity || 0),
          unitCost: item.unitCost || 0,
        });
      }
    }

    if (tr.status === "Cancelled" && (tr.dispatchedAt || tr.status === "Dispatched")) {
      for (const item of tr.items || []) {
        timeline.push({
          eventType: "TRANSFER_CANCEL",
          date: cancelDate,
          refNumber: tr.transferNumber,
          transferId: tr._id.toString(),
          productId: item.product?.toString(),
          locationId: tr.sourceLocation?.toString(),
          condition: item.condition || "New",
          qty: Number(item.quantity || 0),
          unitCost: item.unitCost || 0,
        });
      }
    }
  }

  // 3. Completed Sales
  for (const s of sales) {
    const date = s.completedAt ? new Date(s.completedAt) : (s.createdAt ? new Date(s.createdAt) : new Date());
    for (const item of s.items || []) {
      timeline.push({
        eventType: "SALE_OUT",
        date,
        refNumber: s.saleNumber,
        productId: item.product?.toString(),
        locationId: s.location?.toString(),
        condition: item.condition || "New",
        qty: Number(item.quantity || 0),
        unitCost: 0,
      });
    }
  }

  // 4. InventoryMovements (Opening Stock, Returns, Adjustments)
  for (const m of movements) {
    const date = m.date ? new Date(m.date) : (m.createdAt ? new Date(m.createdAt) : new Date());
    const type = m.type || "";

    if (type === "RETURN_IN" || type === "RENTAL_SWAP" || type === "RETURN_EXCHANGE") {
      timeline.push({
        eventType: "RETURN_IN",
        date,
        refNumber: m.referenceTransaction || m.referenceId || "RETURN",
        productId: m.product?.toString(),
        locationId: m.destinationLocation?.toString(),
        condition: m.condition || "New",
        qty: Number(m.quantity || 0),
        unitCost: Number(m.unitCost || 0),
      });
    } else if (type === "OPENING_STOCK" || type === "ADJUSTMENT_IN") {
      timeline.push({
        eventType: "OPENING_STOCK",
        date,
        refNumber: m.referenceTransaction || "OPENING",
        productId: m.product?.toString(),
        locationId: m.destinationLocation?.toString(),
        condition: m.condition || "New",
        qty: Number(m.quantity || 0),
        unitCost: Number(m.unitCost || 0),
      });
    } else if (type === "ADJUSTMENT_OUT" || type === "DAMAGE_OUT") {
      timeline.push({
        eventType: "ADJUSTMENT_OUT",
        date,
        refNumber: m.referenceTransaction || "ADJUSTMENT",
        productId: m.product?.toString(),
        locationId: m.sourceLocation?.toString(),
        condition: m.condition || "New",
        qty: Number(m.quantity || 0),
        unitCost: 0,
      });
    }
  }

  // 5. Manual Cost Adjustments
  for (const ca of costAdjustments) {
    const date = ca.createdAt ? new Date(ca.createdAt) : new Date();
    timeline.push({
      eventType: "MANUAL_COST_OVERRIDE",
      date,
      refNumber: ca.reference || "MANUAL_OVERRIDE",
      productId: ca.product?.toString(),
      condition: "ALL",
      newCost: Number(ca.newCost || 0),
    });
  }

  // Sort global timeline strictly in ascending date order
  timeline.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Execute Chronological Replay State Tracking
  const replayedPools = {};
  const poolEvents = {};
  const dispatchReplayedCosts = {};
  const overrideSuspects = new Set();

  for (const ev of timeline) {
    if (ev.eventType === "MANUAL_COST_OVERRIDE") {
      if (ev.productId) {
        overrideSuspects.add(ev.productId);
      }
      continue;
    }

    if (!ev.productId || !ev.locationId) continue;
    const key = `${ev.productId}:${ev.locationId}:${ev.condition}`;

    if (!replayedPools[key]) {
      replayedPools[key] = { qty: 0, avg: 0, hasPurchaseHistory: false };
      poolEvents[key] = [];
    }

    const current = replayedPools[key];
    const prevQty = current.qty;
    const prevAvg = current.avg;

    switch (ev.eventType) {
      case "PURCHASE_RECEIVING":
        if (ev.unitCost > 1 && ev.qty > 0) {
          current.hasPurchaseHistory = true;
          if (current.qty <= 0 || current.avg <= 1) {
            current.avg = ev.unitCost;
          } else {
            current.avg = blendAverageCost({
              existingQty: current.qty,
              existingAvg: current.avg,
              incomingQty: ev.qty,
              incomingCost: ev.unitCost,
            });
          }
          current.qty += ev.qty;
        }
        break;

      case "TRANSFER_DISPATCH":
        dispatchReplayedCosts[`${ev.transferId}:${ev.productId}:${ev.condition}`] = current.avg > 1 ? current.avg : ev.unitCost;
        current.qty = Math.max(0, current.qty - ev.qty);
        break;

      case "TRANSFER_RECEIVE": {
        const srcDispatchCost = dispatchReplayedCosts[`${ev.transferId}:${ev.productId}:${ev.condition}`] || ev.unitCost;
        if (srcDispatchCost > 1 && ev.qty > 0) {
          if (current.qty <= 0 || current.avg <= 1) {
            current.avg = srcDispatchCost;
          } else {
            current.avg = blendAverageCost({
              existingQty: current.qty,
              existingAvg: current.avg,
              incomingQty: ev.qty,
              incomingCost: srcDispatchCost,
            });
          }
          current.qty += ev.qty;
        }
        break;
      }

      case "TRANSFER_CANCEL":
      case "RETURN_IN":
        current.qty += ev.qty;
        break;

      case "SALE_OUT":
      case "ADJUSTMENT_OUT":
        current.qty = Math.max(0, current.qty - ev.qty);
        break;

      case "OPENING_STOCK":
        if (ev.unitCost > 1 && ev.qty > 0) {
          if (current.qty <= 0 || current.avg <= 1) {
            current.avg = ev.unitCost;
          } else {
            current.avg = blendAverageCost({
              existingQty: current.qty,
              existingAvg: current.avg,
              incomingQty: ev.qty,
              incomingCost: ev.unitCost,
            });
          }
        }
        current.qty += ev.qty;
        break;
    }

    poolEvents[key].push({
      type: ev.eventType,
      date: ev.date,
      refNumber: ev.refNumber,
      qty: ev.qty,
      unitCost: ev.unitCost || current.avg,
      prevQty,
      prevAvg,
      newQty: current.qty,
      newAvg: current.avg,
    });
  }

  return {
    replayedPools,
    poolEvents,
    dispatchReplayedCosts,
    overrideSuspects,
    prodMap,
    locMap,
  };
}

module.exports = {
  computeReplayedPools,
};
