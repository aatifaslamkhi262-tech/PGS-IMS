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
  return NextResponse.json(
    {
      success: false,
      retired: true,
      error: "The legacy 4-step stock audit endpoint has been retired. Please use All-Branch Live Stock Sync (/api/inventory/live-sync) for real-time stock sync.",
    },
    { status: 410 }
  );
}
