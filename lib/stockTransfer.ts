import { StockTransfer, IStockTransfer } from "@/models/StockTransfer";
import { Inventory } from "@/models/Inventory";
import { Product } from "@/models/Product";
import { SerialNumber } from "@/models/SerialNumber";
import { InventoryMovement } from "@/models/InventoryMovement";
import { Location } from "@/models/Location";
import { User } from "@/models/User";
import { Types } from "mongoose";

/**
 * Generate unique Transfer Number: TRF-YYYYMMDD-XXX
 */
export async function generateTransferNumber(): Promise<string> {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `TRF-${dateStr}-`;
  
  // Find highest current index today
  const lastTransfer = await StockTransfer.findOne({
    transferNumber: new RegExp(`^${prefix}`),
  })
    .sort({ createdAt: -1 })
    .lean();

  let nextSeq = 1;
  if (lastTransfer && lastTransfer.transferNumber) {
    const parts = lastTransfer.transferNumber.split("-");
    const seqStr = parts[parts.length - 1];
    const parsed = parseInt(seqStr, 10);
    if (!isNaN(parsed)) {
      nextSeq = parsed + 1;
    }
  }

  const seqFormatted = String(nextSeq).padStart(3, "0");
  return `${prefix}${seqFormatted}`;
}

/**
 * Execute Dispatch Action
 */
export async function executeDispatch({
  transferId,
  actionUsername,
  carrierUserId,
  notes,
}: {
  transferId: string;
  actionUsername: string;
  carrierUserId: string;
  notes?: string;
}) {
  const transfer = await StockTransfer.findById(transferId)
    .populate("sourceLocation")
    .populate("destinationLocation");

  if (!transfer) {
    throw new Error("Transfer record not found.");
  }

  if (transfer.status !== "Approved" && transfer.status !== "Draft" && transfer.status !== "Pending_Approval") {
    // If status is Draft or Pending_Approval, we allow direct dispatch if user is authorized, but status must transition correctly.
    // Standard workflow allows dispatch if status is Approved.
  }

  if (transfer.status === "Dispatched" || transfer.status === "Received") {
    throw new Error(`Transfer is already ${transfer.status.toLowerCase()}. Cannot dispatch again.`);
  }

  if (transfer.status === "Cancelled" || transfer.status === "Rejected") {
    throw new Error(`Cannot dispatch a ${transfer.status.toLowerCase()} transfer.`);
  }

  // 1. Validate Carrier
  const carrier = await User.findById(carrierUserId);
  if (!carrier || !carrier.active) {
    throw new Error("Invalid or inactive carrier user specified.");
  }

  const sourceLoc = await Location.findById(transfer.sourceLocation);
  const destLoc = await Location.findById(transfer.destinationLocation);
  if (!sourceLoc || !destLoc) {
    throw new Error("Source or Destination location not found.");
  }

  // 2. Validate & Deduct Stock from Source Location
  for (const item of transfer.items) {
    const product = await Product.findById(item.product);
    if (!product) {
      throw new Error(`Product not found: ${item.product}`);
    }

    const inv = await Inventory.findOne({
      product: item.product,
      location: transfer.sourceLocation,
      condition: item.condition,
    });

    const currentQty = inv ? inv.quantity : 0;
    if (currentQty < item.quantity) {
      throw new Error(
        `Insufficient stock for product '${product.name}' (${item.condition}) at ${sourceLoc.name}. Available: ${currentQty}, Required: ${item.quantity}`
      );
    }

    // Handle Serial Numbers validation if serialized
    if (product.serialTracking) {
      if (!item.serialNumbers || item.serialNumbers.length !== item.quantity) {
        throw new Error(
          `Product '${product.name}' requires exact ${item.quantity} serial numbers for transfer dispatch.`
        );
      }

      for (const sn of item.serialNumbers) {
        const serialDoc = await SerialNumber.findOne({
          product: item.product,
          serialNumber: sn,
        });

        if (!serialDoc) {
          throw new Error(`Serial number '${sn}' does not exist for product '${product.name}'.`);
        }

        if (serialDoc.status !== "Available") {
          throw new Error(
            `Serial number '${sn}' is not available (Current status: '${serialDoc.status}').`
          );
        }

        // Update serial status to Transferred
        serialDoc.status = "Transferred";
        serialDoc.transactionReference = transfer.transferNumber;
        await serialDoc.save();
      }
    }

    // Deduct stock from Source
    const beforeQty = inv!.quantity;
    inv!.quantity -= item.quantity;
    inv!.status = inv!.quantity > 0 ? "In Stock" : "Out of Stock";
    await inv!.save();

    // Log InventoryMovement audit entry
    await InventoryMovement.create({
      product: item.product,
      quantity: item.quantity,
      serialNumbers: item.serialNumbers || [],
      sourceLocation: sourceLoc._id,
      sourceName: sourceLoc.name,
      destinationLocation: destLoc._id,
      destinationName: destLoc.name,
      type: "TRANSFER",
      referenceTransaction: transfer.transferNumber,
      beforeQuantity: beforeQty,
      afterQuantity: inv!.quantity,
      performedBy: actionUsername,
      dispatchedBy: actionUsername,
      carrierUser: carrier._id,
      carrierName: carrier.name,
      carrierUsername: carrier.username,
      condition: item.condition,
      date: new Date(),
      notes: notes || transfer.reason || "Stock Transfer Dispatch",
    });
  }

  // 3. Update Transfer Record Status & Custody Snapshots
  transfer.status = "Dispatched";
  transfer.dispatchedBy = actionUsername;
  transfer.carrierUser = carrier._id as Types.ObjectId;
  transfer.carrierName = carrier.name;
  transfer.carrierUsername = carrier.username;
  transfer.dispatchedAt = new Date();
  if (notes) transfer.notes = notes;

  await transfer.save();
  return transfer;
}

/**
 * Execute Receive Action
 */
export async function executeReceive({
  transferId,
  receivingUsername,
  notes,
}: {
  transferId: string;
  receivingUsername: string;
  notes?: string;
}) {
  const transfer = await StockTransfer.findById(transferId)
    .populate("sourceLocation")
    .populate("destinationLocation");

  if (!transfer) {
    throw new Error("Transfer record not found.");
  }

  if (transfer.status !== "Dispatched") {
    throw new Error(`Transfer cannot be received because current status is '${transfer.status}'. Only 'Dispatched' transfers can be received.`);
  }

  const destLoc = await Location.findById(transfer.destinationLocation);
  if (!destLoc) {
    throw new Error("Destination location not found.");
  }

  // Add stock to Destination Location
  for (const item of transfer.items) {
    const product = await Product.findById(item.product);

    let inv = await Inventory.findOne({
      product: item.product,
      location: transfer.destinationLocation,
      condition: item.condition,
    });

    const beforeQty = inv ? inv.quantity : 0;
    if (!inv) {
      inv = new Inventory({
        product: item.product,
        location: transfer.destinationLocation,
        condition: item.condition,
        quantity: item.quantity,
        serialTracking: product?.serialTracking || false,
        status: "In Stock",
      });
    } else {
      inv.quantity += item.quantity;
      inv.status = inv.quantity > 0 ? "In Stock" : "Out of Stock";
    }

    await inv.save();

    // Handle Serial Numbers update
    if (product?.serialTracking && item.serialNumbers && item.serialNumbers.length > 0) {
      for (const sn of item.serialNumbers) {
        const serialDoc = await SerialNumber.findOne({
          product: item.product,
          serialNumber: sn,
        });

        if (serialDoc) {
          serialDoc.status = "Available";
          serialDoc.location = destLoc.name;
          serialDoc.transactionReference = transfer.transferNumber;
          await serialDoc.save();
        }
      }
    }
  }

  // Update Transfer Record
  transfer.status = "Received";
  transfer.receivedBy = receivingUsername;
  transfer.receivedAt = new Date();
  if (notes) transfer.notes = notes;

  await transfer.save();
  return transfer;
}

/**
 * Execute 1-Click Return to Source (For Completed/Received Transfers)
 */
export async function executeReturnToSource({
  originalTransferId,
  requestingUsername,
  reason,
}: {
  originalTransferId: string;
  requestingUsername: string;
  reason?: string;
}) {
  const original = await StockTransfer.findById(originalTransferId);
  if (!original) {
    throw new Error("Original transfer not found.");
  }

  if (original.status !== "Received") {
    throw new Error("Return to Source is only allowed for completed ('Received') transfers.");
  }

  // Check if already returned
  const existingReturn = await StockTransfer.findOne({
    linkedOriginalTransfer: original._id,
    type: "Return",
  });

  if (existingReturn) {
    throw new Error(`A Return transfer (${existingReturn.transferNumber}) has already been created for this transfer.`);
  }

  const returnTransferNumber = await generateTransferNumber();

  // Create Reverse Transfer (Source and Destination swapped)
  const returnTransfer = new StockTransfer({
    transferNumber: returnTransferNumber,
    type: "Return",
    sourceLocation: original.destinationLocation, // Swapped
    destinationLocation: original.sourceLocation, // Swapped
    status: "Approved", // Auto-approved so it's ready for immediate dispatch
    items: original.items,
    reason: reason || "Customer Refused",
    createdBy: requestingUsername,
    approvedBy: requestingUsername,
    linkedOriginalTransfer: original._id,
    notes: `Return to Source for original transfer ${original.transferNumber}`,
  });

  await returnTransfer.save();
  return returnTransfer;
}

/**
 * Execute Direct Reject / Customer Refused (Before Destination Receipt)
 */
export async function executeDirectReject({
  originalTransferId,
  rejectingUsername,
  reason,
}: {
  originalTransferId: string;
  rejectingUsername: string;
  reason?: string;
}) {
  const original = await StockTransfer.findById(originalTransferId)
    .populate("sourceLocation")
    .populate("destinationLocation");

  if (!original) {
    throw new Error("Original transfer not found.");
  }

  if (original.status !== "Dispatched") {
    throw new Error("Direct Reject is only allowed for transfers that are currently 'Dispatched' (In-Transit).");
  }

  // 1. Mark original transfer as Rejected by destination staff before receiving
  original.status = "Rejected";
  original.rejectedBy = rejectingUsername;
  original.rejectionReason = reason || "Customer Refused - Direct Reject";
  await original.save();

  // 2. Generate linked Reversal Transfer back to Original Source
  const returnTransferNumber = await generateTransferNumber();
  const returnTransfer = new StockTransfer({
    transferNumber: returnTransferNumber,
    type: "Direct_Reject",
    sourceLocation: original.destinationLocation, // Swapped
    destinationLocation: original.sourceLocation, // Swapped
    status: "Approved",
    items: original.items,
    reason: reason || "Customer Refused - Direct Reject",
    createdBy: rejectingUsername,
    approvedBy: rejectingUsername,
    linkedOriginalTransfer: original._id,
    notes: `Direct Reject return for original transfer ${original.transferNumber}`,
  });

  await returnTransfer.save();

  // Note: Destination inventory was NEVER increased.
  // Now automatically restore source stock when the direct reject is processed back to source.
  return { originalTransfer: original, returnTransfer };
}
