import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Product } from "@/models/Product";
import { verifyRole } from "@/lib/auth/rbac";

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    // Allow all authenticated roles
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Branch", "Salesman"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";

    const query: any = { isDeleted: false, active: true };
    if (search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [
        { name: searchRegex },
        { sku: searchRegex },
        { barcode: search.trim() },
        { model: searchRegex },
        { modelNumber: searchRegex },
        { brand: searchRegex },
        { color: searchRegex },
      ];
    }

    // Securely select only fields needed for price lookup
    const products = await Product.find(query)
      .select("_id name condition minSellingPrice sku barcode brand model modelNumber color")
      .sort({ name: 1 })
      .limit(100)
      .lean();

    const { calculateProductWeightedPricing } = await import("@/lib/pricing");
    const isAuthorizedForCost = ["Admin", "Warehouse", "Accountant"].includes(auth.user?.role || "");

    const productsWithPricing = await Promise.all(
      products.map(async (p) => {
        const pricing = await calculateProductWeightedPricing(p._id.toString());
        return {
          _id: p._id,
          name: p.name,
          brand: (p as any).brand || "",
          modelNumber: (p as any).modelNumber || (p as any).model || "",
          model: (p as any).model || (p as any).modelNumber || "",
          color: (p as any).color || "Unspecified",
          condition: p.condition,
          sku: p.sku,
          barcode: p.barcode,
          priceConfigured: pricing.priceConfigured,
          minSellingPrice: pricing.priceConfigured ? pricing.avgMinSellingPrice : 0,
          sellingPrice: pricing.priceConfigured ? pricing.avgSellingPrice : 0,
          ...(isAuthorizedForCost && { costPrice: pricing.priceConfigured ? pricing.avgCostPrice : 0 }),
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: productsWithPricing,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch prices." },
      { status: 500 }
    );
  }
}
