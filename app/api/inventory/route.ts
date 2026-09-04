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

    // 1. Resolve product IDs by serial number search if applicable
    let serialProductIds: string[] = [];
    if (search.trim()) {
      const matchingSerials = await SerialNumber.find({
        serialNumber: new RegExp(search.trim(), "i"),
      })
        .select("product")
        .lean();
      serialProductIds = matchingSerials.map((s) => s.product.toString());
    }

    // 2. Query products first to apply filters
    const prodQuery: any = { isDeleted: false };
    if (search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      prodQuery.$or = [
        { name: searchRegex },
        { sku: searchRegex },
        { barcode: searchRegex },
        { model: searchRegex },
        { modelNumber: searchRegex },
        { brand: searchRegex },
        { color: searchRegex },
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

    const products = await Product.find(prodQuery).select("name sku barcode category condition serialTracking active brand model modelNumber color").lean();
    const productIds = products.map((p) => p._id.toString());

    // If no products match, return empty
    if (productIds.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // 3. Query inventory items for these products
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

    // 4. Load all locations to build full breakdown
    const allLocations = await Location.find({ active: true }).select("name code type").lean();

    // 5. Build output data
    const result = [];
    for (const prod of products) {
      const pStr = prod._id.toString();
      const stockLines = inventoryMap[pStr] || [];

      // Calculate totals
      const totalQty = stockLines.reduce((sum, line) => sum + line.quantity, 0);

      // Status filter
      if (status === "In Stock" && totalQty === 0) continue;
      if (status === "Out of Stock" && totalQty > 0) continue;

      // Build location breakdown
      const breakdown = allLocations.map((loc) => {
        const line = stockLines.find((sl) => sl.location._id.toString() === loc._id.toString());
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

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch inventory." },
      { status: 500 }
    );
  }
}
