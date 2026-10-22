import mongoose, { Types, ClientSession } from "mongoose";
import { StockAudit, IStockAudit } from "@/models/StockAudit";
import { Inventory } from "@/models/Inventory";
import { SerialNumber } from "@/models/SerialNumber";
import { Product } from "@/models/Product";
import { Location } from "@/models/Location";
import { InventoryMovement } from "@/models/InventoryMovement";

export async function generateStockAuditNumber(session?: ClientSession): Promise<string> {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `AUD-${dateStr}-`;

  const countQuery: any = StockAudit.countDocuments({
    auditNumber: new RegExp(`^${prefix}`),
  });
  if (session && countQuery && typeof countQuery.session === "function") {
    countQuery.session(session);
  }
  const count = typeof countQuery?.exec === "function" ? await countQuery.exec() : await countQuery;
  const nextSeq = (count || 0) + 1;
  return `${prefix}${String(nextSeq).padStart(3, "0")}`;
}

export interface AnalyzeStockAuditInput {
  locationId: string;
  scannedSerials: string[];
  physicalCounts: Array<{
    productId: string;
    condition?: string;
    physicalQuantity: number;
  }>;
  unregisteredSerialMappings?: Array<{
    serialNumber: string;
    productId: string;
    condition?: string;
  }>;
  crossBranchResolutions?: Record<string, "TRANSFER_TO_DESTINATION" | "RETURN_TO_ORIGIN">;
  auditScope?: "ALL" | "SERIALIZED_ONLY" | "NON_SERIALIZED_ONLY";
}

export async function analyzeStockAudit(input: AnalyzeStockAuditInput) {
  const isConsolidated = input.locationId === "ALL";
  let targetLocation: any = null;
  let inventoryDocs: any[] = [];
  let localAvailableSerials: any[] = [];

  if (isConsolidated) {
    targetLocation = {
      _id: "ALL",
      name: "All Branches (Consolidated Mall Audit)",
    };

    // Fetch all Inventory across all locations and consolidate by product + condition
    const rawInvDocs = await Inventory.find({})
      .populate("product", "name sku barcode serialTracking costPrice")
      .lean();

    const groupedInvMap = new Map<string, any>();
    for (const inv of rawInvDocs) {
      if (!inv.product) continue;
      const key = `${(inv.product as any)._id.toString()}_${inv.condition || "New"}`;
      if (!groupedInvMap.has(key)) {
        groupedInvMap.set(key, {
          ...inv,
          quantity: inv.quantity || 0,
          totalCostValue: inv.totalCostValue || 0,
        });
      } else {
        const existing = groupedInvMap.get(key);
        existing.quantity += (inv.quantity || 0);
        existing.totalCostValue += (inv.totalCostValue || 0);
        existing.averageCost = existing.quantity > 0 ? existing.totalCostValue / existing.quantity : existing.averageCost;
      }
    }
    inventoryDocs = Array.from(groupedInvMap.values());

    // In consolidated mode, every Available serial across all locations is part of this audit
    localAvailableSerials = await SerialNumber.find({ status: "Available" })
      .populate("product", "name sku barcode serialTracking costPrice")
      .lean();
  } else {
    targetLocation = await Location.findById(input.locationId).lean();
    if (!targetLocation) {
      throw new Error("Target location not found.");
    }

    // 1. Fetch all Inventory records at this location
    inventoryDocs = await Inventory.find({ location: targetLocation._id })
      .populate("product", "name sku barcode serialTracking costPrice")
      .lean();

    // 2. Fetch all Serial Numbers with status "Available" currently recorded at this location
    const targetLocationNameRegex = new RegExp(`^${targetLocation.name.trim()}$`, "i");
    localAvailableSerials = await SerialNumber.find({
      status: "Available",
      $or: [
        { location: targetLocation._id.toString() },
        { location: targetLocationNameRegex },
      ],
    })
      .populate("product", "name sku barcode serialTracking costPrice")
      .lean();
  }

  // Also fetch all serial numbers matching the scanned serials across the whole database
  const cleanScannedSerials = Array.from(
    new Set((input.scannedSerials || []).map((s) => s.trim().toUpperCase()).filter(Boolean))
  );

  const scannedSerialsRegex = cleanScannedSerials.map((s) => new RegExp(`^${s}$`, "i"));
  const allMatchedSerialDocs = cleanScannedSerials.length > 0
    ? await SerialNumber.find({
        serialNumber: { $in: scannedSerialsRegex },
      })
        .populate("product", "name sku barcode serialTracking costPrice")
        .lean()
    : [];

  const matchedSerialDocsMap = new Map<string, any>();
  for (const doc of allMatchedSerialDocs) {
    matchedSerialDocsMap.set(doc.serialNumber.trim().toUpperCase(), doc);
  }

  // Maps & sets for categorization
  const localAvailableSerialsSet = new Set(
    localAvailableSerials.map((s) => s.serialNumber.trim().toUpperCase())
  );
  const scannedSerialsSet = new Set(cleanScannedSerials);

  const missingSerials: any[] = [];
  const crossBranchSerials: any[] = [];
  const reactivatedSerials: any[] = [];
  const unregisteredSerials: any[] = [];

  const isNonSerializedOnly = input.auditScope === "NON_SERIALIZED_ONLY";
  const isSerializedOnly = input.auditScope === "SERIALIZED_ONLY";

  // A. Detect Missing Serials (Only if auditing serialized consoles)
  if (!isNonSerializedOnly) {
    for (const localSn of localAvailableSerials) {
      const snUpper = localSn.serialNumber.trim().toUpperCase();
      if (!scannedSerialsSet.has(snUpper)) {
        const prod = localSn.product as any;
        const invMatch = inventoryDocs.find((i: any) => i.product?._id?.toString() === prod?._id?.toString());
        const unitCost = invMatch?.averageCost || prod?.costPrice || 0;

        missingSerials.push({
          product: prod?._id,
          productName: prod?.name || "Unknown Product",
          serialNumber: localSn.serialNumber,
          condition: (localSn as any).condition || prod?.condition || "New",
          unitCost,
        });
      }
    }
  }

  // B. Categorize Scanned Serials (Only if auditing serialized consoles)
  if (!isNonSerializedOnly) {
    const allLocations = await Location.find({}).lean();
    const locMap = new Map<string, any>();
    for (const l of allLocations) {
      locMap.set(l._id.toString(), l);
      locMap.set(l.name.toLowerCase().trim(), l);
    }

    for (const scannedSn of cleanScannedSerials) {
      const doc = matchedSerialDocsMap.get(scannedSn);
      if (!doc) {
        // Completely unregistered serial
        const mapping = (input.unregisteredSerialMappings || []).find(
          (m) => m.serialNumber.trim().toUpperCase() === scannedSn
        );
        let pDoc: any = null;
        if (mapping?.productId) {
          pDoc = await Product.findById(mapping.productId).lean();
        }

        unregisteredSerials.push({
          serialNumber: scannedSn,
          product: pDoc?._id || undefined,
          productName: pDoc?.name || undefined,
          condition: mapping?.condition || "New",
          unitCost: pDoc?.costPrice || 0,
        });
        continue;
      }

      const docProd = doc.product as any;
      const docLocStr = (doc.location || "").trim();
      const isLocalLoc =
        docLocStr === targetLocation._id.toString() ||
        docLocStr.toLowerCase() === targetLocation.name.toLowerCase().trim();

      if (doc.status === "Available") {
        if (!isLocalLoc && !isConsolidated) {
          // Cross-Branch item: registered at another branch, but scanned at target location!
          const fromLocObj = locMap.get(docLocStr) || locMap.get(docLocStr.toLowerCase());
          const resAction =
            (input.crossBranchResolutions && input.crossBranchResolutions[doc.serialNumber]) ||
            "TRANSFER_TO_DESTINATION";
          crossBranchSerials.push({
            product: docProd?._id,
            productName: docProd?.name || "Product",
            serialNumber: doc.serialNumber,
            condition: (doc as any).condition || docProd?.condition || "New",
            fromLocation: fromLocObj?._id || new Types.ObjectId(),
            fromLocationName: fromLocObj?.name || docLocStr || "Other Branch",
            toLocation: targetLocation._id,
            toLocationName: targetLocation.name,
            unitCost: docProd?.costPrice || 0,
            resolutionAction: resAction,
          });
        }
      } else if (doc.status === "Sold" || doc.status === "Returned") {
        // Previously sold / returned piece found on shelf -> reactivation candidate
        reactivatedSerials.push({
          serialNumber: doc.serialNumber,
          product: docProd?._id,
          productName: docProd?.name || "Product",
          previousStatus: doc.status,
          condition: (doc as any).condition || docProd?.condition || "New",
          unitCost: docProd?.costPrice || 0,
        });
      }
    }
  }

  // C. Analyze Non-Serialized Items Variances (Only if auditing non-serialized stock)
  const itemVariances: any[] = [];
  let totalMissingNonSerialized = 0;
  let totalSurplusNonSerialized = 0;
  let netCostDelta = 0;

  if (!isSerializedOnly) {
    for (const countInput of input.physicalCounts || []) {
      if (!countInput?.productId) continue;
      const pIdStr = countInput.productId.toString();
      const cond = countInput.condition || "New";
      const invMatch: any = inventoryDocs.find(
        (i: any) => i.product?._id?.toString() === pIdStr && (i.condition || "New") === cond
      );

      const systemQty = invMatch ? invMatch.quantity : 0;
      const physicalQty = Number(countInput.physicalQuantity || 0);
      const variance = physicalQty - systemQty;
      let unitCost = invMatch?.averageCost || invMatch?.product?.costPrice || 0;
      let prodName = invMatch?.product?.name;

      if (!prodName || !unitCost) {
        if (mongoose.isValidObjectId(pIdStr)) {
          const pDoc = await Product.findById(pIdStr).lean();
          if (pDoc) {
            prodName = prodName || pDoc.name;
            unitCost = unitCost || pDoc.costPrice || 0;
          }
        }
      }

      const costDelta = variance * unitCost;

      itemVariances.push({
        product: invMatch?.product?._id || (mongoose.isValidObjectId(pIdStr) ? new Types.ObjectId(pIdStr) : pIdStr),
        productName: prodName || "Product",
        condition: cond,
        systemQuantity: systemQty,
        physicalQuantity: physicalQty,
        variance,
        unitCost,
        totalCostDelta: costDelta,
      });

      if (variance < 0) {
        totalMissingNonSerialized += Math.abs(variance);
      } else if (variance > 0) {
        totalSurplusNonSerialized += variance;
      }
      netCostDelta += costDelta;
    }
  }

  // Calculate missing serialized cost
  const missingSerialCost = missingSerials.reduce((sum, item) => sum + (item.unitCost || 0), 0);
  netCostDelta -= missingSerialCost;

  return {
    location: targetLocation,
    scannedSerialsCount: cleanScannedSerials.length,
    missingSerials,
    crossBranchSerials,
    reactivatedSerials,
    unregisteredSerials,
    itemVariances,
    summary: {
      totalMissingUnits: missingSerials.length + totalMissingNonSerialized,
      totalSurplusUnits: unregisteredSerials.length + reactivatedSerials.length + totalSurplusNonSerialized,
      totalCrossBranchUnits: crossBranchSerials.length,
      netCostDelta,
    },
  };
}

export async function executeStockAuditReconciliation(
  auditId: string,
  approvedBy: string,
  session: ClientSession
) {
  const audit = await StockAudit.findById(auditId).session(session);
  if (!audit) {
    throw new Error("Stock audit record not found.");
  }

  if (audit.status === "APPROVED") {
    throw new Error("This stock audit has already been reconciled and approved.");
  }

  let targetLocation: any = null;
  if (!audit.isConsolidated && audit.location) {
    targetLocation = await Location.findById(audit.location).session(session);
    if (!targetLocation) {
      throw new Error("Target location not found.");
    }
  } else {
    targetLocation = { _id: "ALL", name: "All Branches" };
  }

  // 1. Reconcile Missing Serials -> Mark as "Sold" (Historical unrecorded sales)
  for (const missing of audit.missingSerials) {
    const serialDoc = await SerialNumber.findOne({
      serialNumber: missing.serialNumber,
    }).session(session);

    if (serialDoc) {
      serialDoc.status = "Sold";
      serialDoc.location = "Customer (Unrecorded Sale)";
      serialDoc.transactionReference = audit.auditNumber;
      serialDoc.notes = `Reconciled via Stock Audit ${audit.auditNumber}`;
      serialDoc.saleDate = new Date();
      await serialDoc.save({ session });
    }

    // Deduct quantity from local inventory (or registered location)
    const invLocation = audit.isConsolidated
      ? (serialDoc && mongoose.isValidObjectId(serialDoc.location) ? serialDoc.location : null)
      : audit.location;

    if (invLocation) {
      const inv = await Inventory.findOne({
        product: missing.product,
        location: invLocation,
        condition: missing.condition || "New",
      }).session(session);

      if (inv) {
        const beforeQty = inv.quantity;
        inv.quantity = Math.max(0, inv.quantity - 1);
        inv.totalCostValue = inv.quantity * (inv.averageCost || 0);
        await inv.save({ session });

        await new InventoryMovement({
          product: missing.product,
          productName: missing.productName,
          quantity: 1,
          unitCost: missing.unitCost,
          totalCost: missing.unitCost,
          serialNumbers: [missing.serialNumber],
          sourceLocation: invLocation,
          sourceName: audit.locationName,
          destinationName: "Customer (Unrecorded Sale)",
          type: "ADJUSTMENT",
          referenceTransaction: audit.auditNumber,
          referenceType: "StockAudit",
          reason: `Shelf Stock Audit Missing Item: ${missing.serialNumber}`,
          beforeQuantity: beforeQty,
          afterQuantity: inv.quantity,
          performedBy: audit.performedBy,
          approvedBy,
          condition: missing.condition || "New",
          date: new Date(),
        }).save({ session });
      }
    }
  }

  // 2. Reconcile Cross-Branch Serials -> Move to Target Location OR Return to Origin
  for (const cross of audit.crossBranchSerials) {
    if (cross.resolutionAction === "RETURN_TO_ORIGIN") {
      // User chose to keep serial assigned to origin branch and physically relocate it back
      const serialDoc = await SerialNumber.findOne({
        serialNumber: cross.serialNumber,
      }).session(session);

      if (serialDoc) {
        serialDoc.notes = `Physically verified on shelf during Stock Audit ${audit.auditNumber} (Flagged to physically return to ${cross.fromLocationName})`;
        await serialDoc.save({ session });
      }
      continue;
    }

    const serialDoc = await SerialNumber.findOne({
      serialNumber: cross.serialNumber,
    }).session(session);

    if (serialDoc) {
      serialDoc.location = targetLocation._id.toString();
      serialDoc.notes = `Auto-transferred from ${cross.fromLocationName} via Stock Audit ${audit.auditNumber}`;
      await serialDoc.save({ session });
    }

    // Deduct 1 from source location inventory
    const srcInv = await Inventory.findOne({
      product: cross.product,
      location: cross.fromLocation,
      condition: cross.condition || "New",
    }).session(session);

    if (srcInv) {
      const beforeQty = srcInv.quantity;
      srcInv.quantity = Math.max(0, srcInv.quantity - 1);
      srcInv.totalCostValue = srcInv.quantity * (srcInv.averageCost || 0);
      await srcInv.save({ session });

      await new InventoryMovement({
        product: cross.product,
        productName: cross.productName,
        quantity: 1,
        unitCost: cross.unitCost,
        totalCost: cross.unitCost,
        serialNumbers: [cross.serialNumber],
        sourceLocation: cross.fromLocation,
        sourceName: cross.fromLocationName,
        destinationLocation: audit.location,
        destinationName: audit.locationName,
        type: "TRANSFER",
        referenceTransaction: audit.auditNumber,
        referenceType: "StockAuditCrossBranch",
        reason: `Cross-Branch Relocation to ${audit.locationName}`,
        beforeQuantity: beforeQty,
        afterQuantity: srcInv.quantity,
        performedBy: audit.performedBy,
        approvedBy,
        condition: cross.condition || "New",
        date: new Date(),
      }).save({ session });
    }

    // Add 1 to target location inventory
    let destInv = await Inventory.findOne({
      product: cross.product,
      location: audit.location,
      condition: cross.condition || "New",
    }).session(session);

    if (!destInv) {
      destInv = new Inventory({
        product: cross.product,
        location: audit.location,
        condition: cross.condition || "New",
        quantity: 0,
        averageCost: cross.unitCost,
        totalCostValue: 0,
      });
    }

    const beforeDestQty = destInv.quantity;
    destInv.quantity += 1;
    destInv.totalCostValue = destInv.quantity * (destInv.averageCost || cross.unitCost);
    await destInv.save({ session });
  }

  // 3. Reconcile Reactivated Serials -> Mark as "Available" at this location
  for (const reactivated of audit.reactivatedSerials) {
    const serialDoc = await SerialNumber.findOne({
      serialNumber: reactivated.serialNumber,
    }).session(session);

    if (serialDoc) {
      serialDoc.status = "Available";
      serialDoc.location = targetLocation._id.toString();
      serialDoc.notes = `Reactivated from '${reactivated.previousStatus}' via Stock Audit ${audit.auditNumber}`;
      await serialDoc.save({ session });
    }

    let inv = await Inventory.findOne({
      product: reactivated.product,
      location: audit.location,
      condition: reactivated.condition || "New",
    }).session(session);

    if (!inv) {
      inv = new Inventory({
        product: reactivated.product,
        location: audit.location,
        condition: reactivated.condition || "New",
        quantity: 0,
        averageCost: reactivated.unitCost,
        totalCostValue: 0,
      });
    }

    const beforeQty = inv.quantity;
    inv.quantity += 1;
    inv.totalCostValue = inv.quantity * (inv.averageCost || reactivated.unitCost);
    await inv.save({ session });

    await new InventoryMovement({
      product: reactivated.product,
      productName: reactivated.productName,
      quantity: 1,
      unitCost: reactivated.unitCost,
      totalCost: reactivated.unitCost,
      serialNumbers: [reactivated.serialNumber],
      destinationLocation: audit.location,
      destinationName: audit.locationName,
      sourceName: "Found Physical Stock (Reactivated)",
      type: "ADJUSTMENT",
      referenceTransaction: audit.auditNumber,
      referenceType: "StockAuditReactivation",
      reason: `Found Stock Reactivation (Was ${reactivated.previousStatus})`,
      beforeQuantity: beforeQty,
      afterQuantity: inv.quantity,
      performedBy: audit.performedBy,
      approvedBy,
      condition: reactivated.condition || "New",
      date: new Date(),
    }).save({ session });
  }

  // 4. Reconcile Unregistered Serials (with selected product)
  for (const unreg of audit.unregisteredSerials) {
    if (unreg.product) {
      const existingSn = await SerialNumber.findOne({
        serialNumber: unreg.serialNumber,
      }).session(session);

      if (!existingSn) {
        await new SerialNumber({
          product: unreg.product,
          serialNumber: unreg.serialNumber,
          status: "Available",
          location: targetLocation._id.toString(),
          notes: `Created via Stock Audit ${audit.auditNumber}`,
        }).save({ session });

        let inv = await Inventory.findOne({
          product: unreg.product,
          location: audit.location,
          condition: unreg.condition || "New",
        }).session(session);

        if (!inv) {
          inv = new Inventory({
            product: unreg.product,
            location: audit.location,
            condition: unreg.condition || "New",
            quantity: 0,
            averageCost: unreg.unitCost || 0,
            totalCostValue: 0,
          });
        }

        const beforeQty = inv.quantity;
        inv.quantity += 1;
        inv.totalCostValue = inv.quantity * (inv.averageCost || unreg.unitCost || 0);
        await inv.save({ session });

        await new InventoryMovement({
          product: unreg.product,
          productName: unreg.productName || "Product",
          quantity: 1,
          unitCost: unreg.unitCost || 0,
          totalCost: unreg.unitCost || 0,
          serialNumbers: [unreg.serialNumber],
          destinationLocation: audit.location,
          destinationName: audit.locationName,
          sourceName: "Physical Stock Found (Unregistered)",
          type: "ADJUSTMENT",
          referenceTransaction: audit.auditNumber,
          referenceType: "StockAuditUnregistered",
          reason: "Found Stock Intake via Stock Audit",
          beforeQuantity: beforeQty,
          afterQuantity: inv.quantity,
          performedBy: audit.performedBy,
          approvedBy,
          condition: unreg.condition || "New",
          date: new Date(),
        }).save({ session });
      }
    }
  }

  // 5. Reconcile Non-Serialized Items Variances
  for (const itemVar of audit.itemVariances) {
    if (itemVar.variance === 0) continue;

    let inv = await Inventory.findOne({
      product: itemVar.product,
      location: audit.location,
      condition: itemVar.condition || "New",
    }).session(session);

    if (!inv) {
      inv = new Inventory({
        product: itemVar.product,
        location: audit.location,
        condition: itemVar.condition || "New",
        quantity: 0,
        averageCost: itemVar.unitCost || 0,
        totalCostValue: 0,
      });
    }

    const beforeQty = inv.quantity;
    inv.quantity = Math.max(0, itemVar.physicalQuantity);
    inv.totalCostValue = inv.quantity * (inv.averageCost || itemVar.unitCost || 0);
    await inv.save({ session });

    await new InventoryMovement({
      product: itemVar.product,
      productName: itemVar.productName,
      quantity: Math.abs(itemVar.variance),
      unitCost: itemVar.unitCost,
      totalCost: Math.abs(itemVar.totalCostDelta),
      sourceLocation: itemVar.variance < 0 ? audit.location : undefined,
      sourceName: itemVar.variance < 0 ? audit.locationName : "Physical Stock Count Surplus",
      destinationLocation: itemVar.variance > 0 ? audit.location : undefined,
      destinationName: itemVar.variance > 0 ? audit.locationName : "Physical Stock Audit Shrinkage",
      type: "ADJUSTMENT",
      referenceTransaction: audit.auditNumber,
      referenceType: "StockAuditVariance",
      reason: itemVar.variance < 0
        ? `Physical Audit Variance Shortage: -${Math.abs(itemVar.variance)} units`
        : `Physical Audit Variance Surplus: +${itemVar.variance} units`,
      beforeQuantity: beforeQty,
      afterQuantity: inv.quantity,
      performedBy: audit.performedBy,
      approvedBy,
      condition: itemVar.condition || "New",
      date: new Date(),
    }).save({ session });
  }

  // Mark audit APPROVED
  audit.status = "APPROVED";
  audit.approvedBy = approvedBy;
  audit.approvedAt = new Date();
  await audit.save({ session });

  return audit;
}
