import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Product } from "@/models/Product";
import { Location } from "@/models/Location";
import { Inventory } from "@/models/Inventory";
import "@/models/Category"; // Ensure Category model is registered for populate

export async function GET(req: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const category = searchParams.get("category") || "";
    const brand = searchParams.get("brand") || "";
    const condition = searchParams.get("condition") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "24", 10)));
    const skip = (page - 1) * limit;

    // 1. Identify Central Warehouse Location
    let warehouseLocation = await Location.findOne({ type: "Warehouse", active: true }).lean();
    if (!warehouseLocation) {
      warehouseLocation = await Location.findOne({ active: true }).lean();
    }

    // 2. Build Query
    const query: any = {
      active: true,
      isDeleted: { $ne: true },
    };

    if (search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [
        { name: searchRegex },
        { sku: searchRegex },
        { barcode: searchRegex },
        { brand: searchRegex },
        { model: searchRegex },
      ];
    }

    if (category) {
      query.category = category;
    }

    if (brand) {
      query.brand = new RegExp(brand.trim(), "i");
    }

    if (condition) {
      query.condition = condition;
    }

    // 3. Count Total Matching Products for Pagination
    const total = await Product.countDocuments(query);

    // 4. Fetch Paginated Products
    const products = await Product.find(query)
      .populate("category", "name slug")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // 5. Fetch Inventory Stocks for these products at Central Warehouse
    const productIds = products.map((p) => p._id);
    let inventoryMap: Record<string, number> = {};

    if (warehouseLocation && productIds.length > 0) {
      const inventories = await Inventory.find({
        product: { $in: productIds },
        location: warehouseLocation._id,
      }).lean();

      inventoryMap = inventories.reduce((acc: Record<string, number>, inv: any) => {
        const availableQty = Math.max(0, (inv.quantity || 0) - (inv.reservedQuantity || 0));
        acc[inv.product.toString()] = availableQty;
        return acc;
      }, {});
    }

    // 6. Map Output with Warehouse Stock Status
    const formattedProducts = products.map((p: any) => {
      const warehouseStock = inventoryMap[p._id.toString()] || 0;
      return {
        _id: p._id,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        category: p.category,
        brand: p.brand || "",
        model: p.model || "",
        color: p.color || "Unspecified",
        condition: p.condition || "New",
        sellingPrice: p.sellingPrice || 0,
        minSellingPrice: p.minSellingPrice || 0,
        images: p.images || [],
        description: p.description || "",
        serialTracking: Boolean(p.serialTracking),
        warehouseStock,
        inStock: warehouseStock > 0,
      };
    });

    return NextResponse.json({
      success: true,
      data: formattedProducts,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch public products." },
      { status: 500 }
    );
  }
}
