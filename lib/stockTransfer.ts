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
 * Validate serial numbers for transfer creation, editing, or dispatching.
 * Enforces all 6 business rules:
 * 1. SerialNumber exists.
 * 2. SerialNumber.status === "Available".
 * 3. SerialNumber.product matches selected transfer product.
 * 4. SerialNumber.location matches selected source location.
 * 5. SerialNumber is not already reserved by another active transfer.
 * 6. The same serial is not duplicated within current transfer.
 */
export async function validateTransferSerials({
  sourceLocationId,
  items,
  currentTransferId,
}: {
  sourceLocationId: string;
  items: Array<{
    product: string | Types.ObjectId;
    quantity: number;
    serialNumbers?: string[];
    condition?: string;
  }>;
  currentTransferId?: string;
}) {
  const sourceLoc = await Location.findById(sourceLocationId);
  if (!sourceLoc) {
    throw new Error("Source location not found.");
  }

  const seenSerialsInRequest = new Set<string>();

  for (const item of items) {
    const pId =
      typeof item.product === "object" && item.product && "_id" in item.product
        ? (item.product as any)._id.toString()
        : item.product.toString();

    const product = await Product.findById(pId);
    if (!product) {
      throw new Error(`Product not found: ${pId}`);
    }

    if (product.serialTracking) {
      if (!item.serialNumbers || item.serialNumbers.length !== item.quantity) {
        throw new Error(
          `Product '${product.name}' requires exact ${item.quantity} serial numbers for transfer.`
        );
      }

      for (const rawSn of item.serialNumbers) {
        const sn = rawSn.trim();
        if (!sn) continue;

        // Rule 6: Duplicate within current transfer request
        if (seenSerialsInRequest.has(sn)) {
          throw new Error(`Duplicate serial number '${sn}' in current transfer request.`);
        }
        seenSerialsInRequest.add(sn);

        // Rule 1: SerialNumber exists
        const serialDoc = await SerialNumber.findOne({ serialNumber: sn });
        if (!serialDoc) {
          throw new Error(`Serial number '${sn}' not found in system.`);
        }

        // Rule 3: Product matches
        if (serialDoc.product.toString() !== product._id.toString()) {
          throw new Error(
            `Serial number '${sn}' belongs to another product (ID: ${serialDoc.product}), not selected product '${product.name}'.`
          );
        }

        // Rule 2 & Transferred serial handling: Status check
        if (serialDoc.status !== "Available") {
          if (serialDoc.status === "Transferred") {
            const linkedQuery: any = {
              "items.serialNumbers": sn,
              status: { $in: ["Dispatched", "Approved", "Pending_Approval", "Draft"] },
            };
            if (currentTransferId) {
              linkedQuery._id = { $ne: currentTransferId };
            }
            const linkedTransfer = await StockTransfer.findOne(linkedQuery);
            if (linkedTransfer) {
              throw new Error(
                `Serial number '${sn}' is not Available (Current status: 'Transferred', linked to transfer ${linkedTransfer.transferNumber} [${linkedTransfer.status}]).`
              );
            }
            throw new Error(
              `Serial number '${sn}' is not Available (Current status: 'Transferred').`
            );
          }
          throw new Error(
            `Serial number '${sn}' is not Available (Current status: '${serialDoc.status}').`
          );
        }

        // Rule 4: Location matches source location (check _id string, name, code)
        if (serialDoc.location) {
          const locStr = serialDoc.location.trim().toLowerCase();
          const validLocs = [
            sourceLoc._id.toString().toLowerCase(),
            sourceLoc.name.trim().toLowerCase(),
            (sourceLoc.code || "").trim().toLowerCase(),
          ].filter(Boolean);

          if (!validLocs.includes(locStr)) {
            throw new Error(
              `Serial number '${sn}' belongs to another location ('${serialDoc.location}'), not selected source location '${sourceLoc.name}'.`
            );
          }
        }

        // Rule 5: Check if reserved by another active transfer
        const queryActiveTransfer: any = {
          "items.serialNumbers": sn,
          status: { $in: ["Draft", "Pending_Approval", "Approved", "Dispatched"] },
        };
        if (currentTransferId) {
          queryActiveTransfer._id = { $ne: currentTransferId };
        }
        const activeTransfer = await StockTransfer.findOne(queryActiveTransfer);
        if (activeTransfer) {
          throw new Error(
            `Serial number '${sn}' is already linked to active transfer ${activeTransfer.transferNumber} (${activeTransfer.status}).`
          );
        }
      }
    }
  }
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

  // 2. Validate all Serial Numbers and Active Transfer Reservations
  await validateTransferSerials({
    sourceLocationId: sourceLoc._id.toString(),
    items: transfer.items,
    currentTransferId: transfer._id.toString(),
  });

  // 3. Validate & Deduct Stock from Source Location
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

    // Update serial statuses to Transferred
    if (product.serialTracking && item.serialNumbers) {
      for (const sn of item.serialNumbers) {
        const serialDoc = await SerialNumber.findOne({
          product: item.product,
          serialNumber: sn,
        });

        if (serialDoc) {
          serialDoc.status = "Transferred";
          serialDoc.transactionReference = transfer.transferNumber;
          await serialDoc.save();
        }
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

  // 4. Update Transfer Record Status & Custody Snapshots
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

export interface DamagedReportInput {
  productId: string;
  serialNumber?: string;
  condition?: string;
  damageType: "Damaged" | "Claim";
  reason: string;
}

/**
 * Execute Receive Action (Supports optional damage/claim report on receipt)
 */
export async function executeReceive({
  transferId,
  receivingUsername,
  damagedItems = [],
  notes,
}: {
  transferId: string;
  receivingUsername: string;
  damagedItems?: DamagedReportInput[];
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

  const damagedReceiveLogs: any[] = [];

  // Add stock to Destination Location (excluding damaged units)
  for (const item of transfer.items) {
    const product = await Product.findById(item.product);
    const pStr = item.product.toString();

    // Determine damaged serials for this product line
    const itemDamagedReports = damagedItems.filter(
      (d) => d.productId === pStr || d.productId === product?._id.toString()
    );

    const damagedSerialsMap = new Map<string, DamagedReportInput>();
    for (const d of itemDamagedReports) {
      if (d.serialNumber) {
        damagedSerialsMap.set(d.serialNumber.trim(), d);
      }
    }

    const totalDamagedUnits = product?.serialTracking
      ? damagedSerialsMap.size
      : itemDamagedReports.length;

    const goodQty = Math.max(0, item.quantity - totalDamagedUnits);

    // 1. Update Destination Inventory only for GOOD / UNDAMAGED quantity
    if (goodQty > 0) {
      let inv = await Inventory.findOne({
        product: item.product,
        location: transfer.destinationLocation,
        condition: item.condition,
      });

      if (!inv) {
        inv = new Inventory({
          product: item.product,
          location: transfer.destinationLocation,
          condition: item.condition,
          quantity: goodQty,
          serialTracking: product?.serialTracking || false,
          status: "In Stock",
        });
      } else {
        inv.quantity += goodQty;
        inv.status = inv.quantity > 0 ? "In Stock" : "Out of Stock";
      }
      await inv.save();
    }

    // 2. Handle Serial Numbers status & audit update
    if (product?.serialTracking && item.serialNumbers && item.serialNumbers.length > 0) {
      for (const sn of item.serialNumbers) {
        const serialDoc = await SerialNumber.findOne({
          product: item.product,
          serialNumber: sn,
        });

        if (serialDoc) {
          const damageReport = damagedSerialsMap.get(sn.trim());

          if (damageReport) {
            // Mark as Damaged / Claim with full custody metadata
            serialDoc.status = damageReport.damageType;
            serialDoc.location = destLoc.name;
            serialDoc.damageDate = new Date();
            serialDoc.transactionReference = transfer.transferNumber;
            serialDoc.notes = `[${damageReport.damageType} on Receipt] Receiver: ${receivingUsername} | Carrier: ${transfer.carrierName || "N/A"} | Reason: ${damageReport.reason.trim()}`;
            await serialDoc.save();

            damagedReceiveLogs.push({
              product: item.product,
              productName: product.name,
              serialNumber: sn,
              condition: item.condition,
              damageType: damageReport.damageType,
              reason: damageReport.reason.trim(),
              reportedBy: receivingUsername,
              reportedAt: new Date(),
            });
          } else {
            // Good condition unit
            serialDoc.status = "Available";
            serialDoc.location = destLoc.name;
            serialDoc.transactionReference = transfer.transferNumber;
            await serialDoc.save();
          }
        }
      }
    } else if (!product?.serialTracking && totalDamagedUnits > 0) {
      // Non-serialized damaged logging
      for (const report of itemDamagedReports) {
        damagedReceiveLogs.push({
          product: item.product,
          productName: product?.name || "Product",
          condition: item.condition,
          damageType: report.damageType,
          reason: report.reason.trim(),
          reportedBy: receivingUsername,
          reportedAt: new Date(),
        });
      }
    }
  }

  // Update Transfer Record
  transfer.status = "Received";
  transfer.receivedBy = receivingUsername;
  transfer.receivedAt = new Date();
  if (damagedReceiveLogs.length > 0) {
    transfer.damagedReceiveLogs = damagedReceiveLogs;
  }
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

/**
 * Execute Cancel / Revert Transfer
 * Restores source inventory and releases serial numbers if the transfer was Dispatched or had stock deducted.
 */
export async function executeCancelTransfer({
  transferId,
  actionUsername,
  reason,
}: {
  transferId: string;
  actionUsername: string;
  reason?: string;
}) {
  const transfer = await StockTransfer.findById(transferId)
    .populate("sourceLocation")
    .populate("destinationLocation");

  if (!transfer) {
    throw new Error("Transfer record not found.");
  }

  if (transfer.status === "Received") {
    throw new Error("Completed ('Received') transfers cannot be cancelled. Use 'Return to Source' instead.");
  }

  const sourceLoc = await Location.findById(transfer.sourceLocation);

  // Check if stock was deducted for this transfer
  const isDispatched = transfer.status === "Dispatched" || !!transfer.dispatchedAt;
  const dispatchMovements = await InventoryMovement.find({
    referenceTransaction: transfer.transferNumber,
    type: "TRANSFER",
    notes: { $not: new RegExp("Transfer Cancelled", "i") },
  });

  const existingCancelMovement = await InventoryMovement.findOne({
    referenceTransaction: transfer.transferNumber,
    notes: new RegExp("Transfer Cancelled", "i"),
  });

  const needsStockRestoration = (isDispatched || dispatchMovements.length > 0) && !existingCancelMovement && sourceLoc;

  if (needsStockRestoration && sourceLoc) {
    for (const item of transfer.items) {
      const product = await Product.findById(item.product);

      // 1. Revert Inventory quantity at Source location
      let inv = await Inventory.findOne({
        product: item.product,
        location: sourceLoc._id,
        condition: item.condition,
      });

      const beforeQty = inv ? inv.quantity : 0;
      if (!inv) {
        inv = new Inventory({
          product: item.product,
          location: sourceLoc._id,
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

      // 2. Revert Serial Numbers status back to Available at Source location
      if (product?.serialTracking && item.serialNumbers && item.serialNumbers.length > 0) {
        for (const sn of item.serialNumbers) {
          const serialDoc = await SerialNumber.findOne({
            product: item.product,
            serialNumber: sn,
          });

          if (serialDoc) {
            serialDoc.status = "Available";
            serialDoc.location = sourceLoc.name;
            serialDoc.transactionReference = transfer.transferNumber;
            await serialDoc.save();
          }
        }
      }

      // 3. Log InventoryMovement entry
      const destLoc = transfer.destinationLocation ? await Location.findById(transfer.destinationLocation) : null;
      await InventoryMovement.create({
        product: item.product,
        quantity: item.quantity,
        serialNumbers: item.serialNumbers || [],
        sourceLocation: destLoc?._id || sourceLoc._id,
        sourceName: destLoc?.name || "Cancelled Transfer",
        destinationLocation: sourceLoc._id,
        destinationName: sourceLoc.name,
        type: "TRANSFER",
        referenceTransaction: transfer.transferNumber,
        beforeQuantity: beforeQty,
        afterQuantity: inv.quantity,
        performedBy: actionUsername,
        condition: item.condition,
        date: new Date(),
        notes: `Transfer Cancelled: ${reason || "Stock & Serials restored to source location"}`,
      });
    }
  }

  transfer.status = "Cancelled";
  transfer.rejectedBy = actionUsername;
  transfer.rejectionReason = reason || "Cancelled by user";
  await transfer.save();

  return transfer;
}

/**
 * Automatically sync and restore any unrestored dispatched stock for cancelled or rejected transfers.
 */
export async function syncUnrestoredCancelledTransfers() {
  const candidateTransfers = await StockTransfer.find({
    $or: [
      { status: { $in: ["Cancelled", "Rejected"] } },
      { dispatchedAt: { $ne: null } },
    ],
  });

  let restoredCount = 0;

  for (const transfer of candidateTransfers) {
    if (transfer.status === "Received") continue;

    const dispatchMovements = await InventoryMovement.find({
      referenceTransaction: transfer.transferNumber,
      type: "TRANSFER",
      notes: { $not: new RegExp("Transfer Cancelled", "i") },
    });

    if (dispatchMovements.length === 0 && !transfer.dispatchedAt && transfer.status !== "Dispatched") {
      continue;
    }

    const existingCancelMovement = await InventoryMovement.findOne({
      referenceTransaction: transfer.transferNumber,
      notes: new RegExp("Transfer Cancelled", "i"),
    });

    if ((transfer.status === "Cancelled" || transfer.status === "Rejected") && !existingCancelMovement) {
      const sourceLoc = await Location.findById(transfer.sourceLocation);
      if (!sourceLoc) continue;

      for (const item of transfer.items) {
        const product = await Product.findById(item.product);

        let inv = await Inventory.findOne({
          product: item.product,
          location: sourceLoc._id,
          condition: item.condition,
        });

        const beforeQty = inv ? inv.quantity : 0;
        if (!inv) {
          inv = new Inventory({
            product: item.product,
            location: sourceLoc._id,
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

        if (product?.serialTracking && item.serialNumbers && item.serialNumbers.length > 0) {
          for (const sn of item.serialNumbers) {
            const serialDoc = await SerialNumber.findOne({
              product: item.product,
              serialNumber: sn,
            });

            if (serialDoc) {
              serialDoc.status = "Available";
              serialDoc.location = sourceLoc.name;
              serialDoc.transactionReference = transfer.transferNumber;
              await serialDoc.save();
            }
          }
        }

        const destLoc = transfer.destinationLocation ? await Location.findById(transfer.destinationLocation) : null;
        await InventoryMovement.create({
          product: item.product,
          quantity: item.quantity,
          serialNumbers: item.serialNumbers || [],
          sourceLocation: destLoc?._id || sourceLoc._id,
          sourceName: destLoc?.name || "Cancelled Transfer",
          destinationLocation: sourceLoc._id,
          destinationName: sourceLoc.name,
          type: "TRANSFER",
          referenceTransaction: transfer.transferNumber,
          beforeQuantity: beforeQty,
          afterQuantity: inv.quantity,
          performedBy: transfer.rejectedBy || transfer.createdBy || "system_sync",
          condition: item.condition,
          date: new Date(),
          notes: `Transfer Cancelled: Auto-restored stock to source location (${transfer.transferNumber})`,
        });

        restoredCount++;
      }
    }
  }

  return restoredCount;
}

