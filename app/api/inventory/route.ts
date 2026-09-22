import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Inventory } from "@/models/Inventory";
import { Product } from "@/models/Product";
import { Location } from "@/models/Location";
import { SerialNumber } from "@/models/SerialNumber";
import { verifyRole } from "@/lib/auth/rbac";

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    // Allow Admin, Warehouse, Accountant, Branch, Salesman to view inventory
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Branch", "Salesman"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const location = searchParams.get("location") || "";
    const condition = searchParams.get("condition") || "";
    const category = searchParams.get("category") || "";
    const serialized = searchParams.get("serialized") || ""; // "true" or "false"
    const status = searchParams.get("status") || ""; // "In Stock" or "Out of Stock"
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "25", 10);

    const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // 1. Resolve product IDs by serial number search if applicable
    let serialProductIds: string[] = [];
    if (search.trim()) {
      const cleanSearch = search.trim();
      const escapedSearch = escapeRegex(cleanSearch);
      const matchingSerials = await SerialNumber.find({
        serialNumber: new RegExp(escapedSearch, "i"),
      })
        .select("product")
        .limit(100)
        .lean();
      serialProductIds = matchingSerials.map((s) => s.product.toString());
    }

    // 2. Resolve Status Filter at DB level using distinct Inventory product IDs
    let statusProductQuery: any = null;
    if (status) {
      const invFilter: any = { quantity: { $gt: 0 } };
      if (location) invFilter.location = location;
      if (condition) invFilter.condition = condition;

      const inStockProductIdsRaw = await Inventory.distinct("product", invFilter);
      const inStockProductIds = inStockProductIdsRaw.map((id: any) => id.toString());

      if (status === "In Stock") {
        statusProductQuery = { $in: inStockProductIds };
      } else if (status === "Out of Stock") {
        statusProductQuery = { $nin: inStockProductIds };
      }
    }

    // 3. Query products first to apply filters
    const prodQuery: any = { isDeleted: false };
    if (search.trim()) {
      const cleanSearch = search.trim();
      const escapedSearch = escapeRegex(cleanSearch);
      const searchRegex = new RegExp(escapedSearch, "i");
      prodQuery.$or = [
        { name: searchRegex },
        { sku: searchRegex },
        { barcode: searchRegex },
        { modelNumber: searchRegex },
        { model: searchRegex },
      ];
      if (serialProductIds.length > 0) {
        prodQuery.$or.push({ _id: { $in: serialProductIds } });
      }
    }
    if (category) {
      prodQuery.category = category;
    }
    if (serialized === "true") {
      prodQuery.serialTracking = true;
    } else if (serialized === "false") {
      prodQuery.serialTracking = false;
    }
    if (statusProductQuery) {
      prodQuery._id = statusProductQuery;
    }

    // DB-level pagination always active
    const total = await Product.countDocuments(prodQuery);
    const totalPages = Math.ceil(total / limit) || 1;
    const validPage = Math.max(1, Math.min(page, totalPages));
    const skip = (validPage - 1) * limit;

    const pageProducts = await Product.find(prodQuery)
      .select("name sku barcode category condition serialTracking active brand model modelNumber color")
      .skip(skip)
      .limit(limit)
      .lean();

    const productIds = pageProducts.map((p) => p._id.toString());

    // If no products match, return empty
    if (productIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        pagination: {
          total: 0,
          page: 1,
          limit,
          totalPages: 0,
        },
      });
    }

    // 4. Query inventory items for these products on the current page
    const invQuery: any = { product: { $in: productIds } };
    if (location) {
      invQuery.location = location;
    }
    if (condition) {
      invQuery.condition = condition;
    }

    const inventoryItems = await Inventory.find(invQuery)
      .populate("location", "name code type active")
      .lean();

    // Map inventory items by product ID
    const inventoryMap: Record<string, any[]> = {};
    for (const item of inventoryItems) {
      const pStr = item.product.toString();
      if (!inventoryMap[pStr]) {
        inventoryMap[pStr] = [];
      }
      inventoryMap[pStr].push(item);
    }

    // 5. Load all locations to build full breakdown
    const allLocations = await Location.find({ active: true }).select("name code type").lean();

    // 6. Build output data
    const result = [];
    for (const prod of pageProducts) {
      const pStr = prod._id.toString();
      const stockLines = inventoryMap[pStr] || [];

      // Calculate total quantity
      const totalQty = stockLines.reduce((sum, line) => sum + line.quantity, 0);

      // Build location breakdown using O(1) Map lookup
      const stockByLocationMap = new Map<string, any>();
      for (const line of stockLines) {
        if (line.location && line.location._id) {
          stockByLocationMap.set(line.location._id.toString(), line);
        }
      }

      const breakdown = allLocations.map((loc) => {
        const line = stockByLocationMap.get(loc._id.toString());
        return {
          locationId: loc._id,
          locationName: loc.name,
          locationCode: loc.code,
          locationType: loc.type,
          quantity: line ? line.quantity : 0,
        };
      });

      result.push({
        product: {
          _id: prod._id,
          name: prod.name,
          sku: prod.sku,
          barcode: prod.barcode,
          condition: prod.condition,
          brand: (prod as any).brand || "",
          modelNumber: (prod as any).modelNumber || (prod as any).model || "",
          model: (prod as any).model || (prod as any).modelNumber || "",
          color: (prod as any).color || "Unspecified",
          serialTracking: prod.serialTracking,
        },
        locations: breakdown,
        totalQuantity: totalQty,
        status: totalQty > 0 ? "In Stock" : "Out of Stock",
      });
    }

    return NextResponse.json({
      success: true,
      data: result,
      pagination: {
        total,
        page: validPage,
        limit,
        totalPages,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch inventory." },
      { status: 500 }
    );
  }
}
