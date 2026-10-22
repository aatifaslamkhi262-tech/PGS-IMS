import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/lib/db";
import { verifyRole } from "@/lib/auth/rbac";
import { Location } from "@/models/Location";
import { Inventory } from "@/models/Inventory";
import { SerialNumber } from "@/models/SerialNumber";
import { Product } from "@/models/Product";
import { StockAudit } from "@/models/StockAudit";
import {
  generateStockAuditNumber,
  analyzeStockAudit,
  executeStockAuditReconciliation,
} from "@/lib/stockAuditEngine";

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Owner"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const locationId = searchParams.get("locationId");

    if (!locationId) {
      // Return list of past audits if no locationId specified
      const audits = await StockAudit.find({})
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();
      return NextResponse.json({ success: true, data: audits });
    }

    const allLocations = await Location.find({ active: true }).sort({ name: 1 }).lean();

    if (locationId === "ALL") {
      // Mall-wide Consolidated Inventory
      const allInventories = await Inventory.find({})
        .populate("product", "name sku barcode serialTracking costPrice sellingPrice")
        .lean();

      const consolidatedMap = new Map<string, any>();
      for (const inv of allInventories) {
        if (!inv.product) continue;
        const pId = (inv.product as any)._id?.toString() || inv.product.toString();
        const cond = inv.condition || "New";
        const key = `${pId}_${cond}`;
        if (consolidatedMap.has(key)) {
          const existing = consolidatedMap.get(key);
          existing.quantity += (inv.quantity || 0);
          existing.totalCostValue = (existing.totalCostValue || 0) + (inv.totalCostValue || 0);
          existing.averageCost = existing.quantity > 0 ? existing.totalCostValue / existing.quantity : existing.averageCost;
        } else {
          consolidatedMap.set(key, {
            _id: `all_${key}`,
            product: inv.product,
            condition: cond,
            quantity: inv.quantity || 0,
            averageCost: inv.averageCost || 0,
            totalCostValue: inv.totalCostValue || 0,
            location: "ALL",
          });
        }
      }

      const inventory = Array.from(consolidatedMap.values());
      const localAvailableSerials = await SerialNumber.find({ status: "Available" })
        .populate("product", "name sku barcode serialTracking costPrice")
        .lean();

      const activeDraft = await StockAudit.findOne({
        isConsolidated: true,
        status: "DRAFT",
      })
        .sort({ updatedAt: -1 })
        .lean();

      const location = { _id: "ALL", name: "All Branches (Mall Consolidated)" };

      return NextResponse.json({
        success: true,
        data: {
          location,
          inventory,
          localAvailableSerials,
          allLocations,
          activeDraft,
        },
      });
    }

    const location = await Location.findById(locationId).lean();
    if (!location) {
      return NextResponse.json({ success: false, error: "Location not found" }, { status: 404 });
    }

    // Fetch Inventory at this location
    const inventory = await Inventory.find({ location: location._id })
      .populate("product", "name sku barcode serialTracking costPrice sellingPrice")
      .lean();

    // Fetch local available serials
    const targetLocationNameRegex = new RegExp(`^${location.name.trim()}$`, "i");
    const localAvailableSerials = await SerialNumber.find({
      status: "Available",
      $or: [
        { location: location._id.toString() },
        { location: targetLocationNameRegex },
      ],
    })
      .populate("product", "name sku barcode serialTracking costPrice")
      .lean();

    // Check for any active draft for this location
    const activeDraft = await StockAudit.findOne({
      location: location._id,
      status: "DRAFT",
    })
      .sort({ updatedAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      data: {
        location,
        inventory,
        localAvailableSerials,
        allLocations,
        activeDraft,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch audit data" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Owner"]);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const {
      locationId,
      auditId,
      scannedSerials,
      physicalCounts,
      unregisteredSerialMappings,
      crossBranchResolutions,
      action, // "DIRECT_APPROVE" | "SUBMIT_APPROVAL" | "SAVE_DRAFT"
      notes,
      auditScope, // "ALL" | "SERIALIZED_ONLY" | "NON_SERIALIZED_ONLY"
    } = body;

    if (!locationId) {
      return NextResponse.json({ success: false, error: "Location ID is required" }, { status: 400 });
    }

    const isConsolidated = locationId === "ALL";
    let targetLocation: any = null;
    if (isConsolidated) {
      targetLocation = { _id: null, name: "All Branches (Mall Consolidated)" };
    } else {
      targetLocation = await Location.findById(locationId).lean();
      if (!targetLocation) {
        return NextResponse.json({ success: false, error: "Target location not found" }, { status: 404 });
      }
    }

    // Run audit analysis
    const analysis = await analyzeStockAudit({
      locationId,
      scannedSerials: scannedSerials || [],
      physicalCounts: physicalCounts || [],
      unregisteredSerialMappings: unregisteredSerialMappings || [],
      crossBranchResolutions: crossBranchResolutions || {},
      auditScope: auditScope || "ALL",
    });

    const isAdmin = auth.user.role === "Admin" || auth.user.role === "Owner";
    const shouldDirectApprove = action === "DIRECT_APPROVE" && isAdmin;
    const isDraft = action === "SAVE_DRAFT";

    // Find existing draft if auditId is provided or if saving draft and one exists
    let auditDoc: any = null;
    if (auditId && mongoose.isValidObjectId(auditId)) {
      auditDoc = await StockAudit.findById(auditId);
      if (auditDoc) {
        if (isConsolidated && !auditDoc.isConsolidated) {
          auditDoc = null;
        } else if (!isConsolidated && auditDoc.location?.toString() !== targetLocation._id?.toString()) {
          auditDoc = null; // Do NOT reuse draft from another location!
        }
      }
    } else if (isDraft) {
      if (isConsolidated) {
        auditDoc = await StockAudit.findOne({
          isConsolidated: true,
          status: "DRAFT",
        }).sort({ updatedAt: -1 });
      } else {
        auditDoc = await StockAudit.findOne({
          location: targetLocation._id,
          status: "DRAFT",
        }).sort({ updatedAt: -1 });
      }
    }

    if (!auditDoc) {
      const auditNumber = await generateStockAuditNumber();
      auditDoc = new StockAudit({
        auditNumber,
        isConsolidated,
        location: isConsolidated ? undefined : targetLocation._id,
        locationName: targetLocation.name,
        performedBy: auth.user.username,
      });
    }

    auditDoc.isConsolidated = isConsolidated;
    auditDoc.auditScope = auditScope || "ALL";
    auditDoc.notes = notes || (isDraft ? "Shelf Stock Audit Draft" : "Shelf Stock Audit Reconciliation");
    auditDoc.scannedSerials = Array.from(new Set((scannedSerials || []).map((s: string) => s.trim())));
    auditDoc.missingSerials = analysis.missingSerials;
    auditDoc.crossBranchSerials = analysis.crossBranchSerials;
    auditDoc.unregisteredSerials = analysis.unregisteredSerials;
    auditDoc.reactivatedSerials = analysis.reactivatedSerials;
    auditDoc.itemVariances = analysis.itemVariances;
    auditDoc.summary = analysis.summary;

    if (isDraft) {
      auditDoc.status = "DRAFT";
      auditDoc.markModified("isConsolidated");
      auditDoc.markModified("scannedSerials");
      auditDoc.markModified("missingSerials");
      auditDoc.markModified("crossBranchSerials");
      auditDoc.markModified("unregisteredSerials");
      auditDoc.markModified("reactivatedSerials");
      auditDoc.markModified("itemVariances");
      auditDoc.markModified("summary");
      await auditDoc.save();

      return NextResponse.json({
        success: true,
        message: `Draft audit #${auditDoc.auditNumber} saved! You can resume anytime without losing progress.`,
        data: auditDoc,
      });
    }

    auditDoc.status = shouldDirectApprove ? "APPROVED" : "PENDING_APPROVAL";
    if (shouldDirectApprove) {
      auditDoc.approvedBy = auth.user.username;
      auditDoc.approvedAt = new Date();
    }

    if (shouldDirectApprove) {
      const session = await mongoose.startSession();
      try {
        session.startTransaction();
        await auditDoc.save({ session });
        await executeStockAuditReconciliation(auditDoc._id.toString(), auth.user.username, session);
        await session.commitTransaction();
      } catch (err) {
        await session.abortTransaction();
        throw err;
      } finally {
        session.endSession();
      }

      return NextResponse.json({
        success: true,
        message: `Stock Audit #${auditDoc.auditNumber} reconciled and approved directly!`,
        data: auditDoc,
      });
    } else {
      // Save for Admin approval
      await auditDoc.save();

      return NextResponse.json({
        success: true,
        message: `Stock Audit #${auditDoc.auditNumber} submitted for Admin approval!`,
        data: auditDoc,
      });
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process stock audit" },
      { status: 500 }
    );
  }
}
