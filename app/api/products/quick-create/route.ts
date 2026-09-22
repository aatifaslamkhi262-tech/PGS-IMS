import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Product } from "@/models/Product";
import { Category } from "@/models/Category";
import { verifyRole } from "@/lib/auth/rbac";

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Salesman", "Branch"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const { name, costPrice, sellingPrice, categoryName, condition, serialTracking } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ success: false, error: "Product Name is required." }, { status: 400 });
    }
    if (costPrice === undefined || costPrice === null || Number(costPrice) < 0) {
      return NextResponse.json({ success: false, error: "Valid Cost Price is required." }, { status: 400 });
    }

    // Find or create category
    const catName = categoryName?.trim() || "Game";
    let categoryObj = await Category.findOne({ name: new RegExp(`^${catName}$`, "i") });
    if (!categoryObj) {
      const catCode = catName.slice(0, 3).toUpperCase();
      categoryObj = new Category({ name: catName, code: catCode });
      await categoryObj.save();
    }

    // Generate unique SKU & Barcode
    const timestamp = Date.now().toString().slice(-6);
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    const sku = `QUICK-${timestamp}-${randomSuffix}`;
    const barcode = `888${timestamp}${randomSuffix}`;

    const cost = Number(costPrice);
    const selling = sellingPrice && Number(sellingPrice) > 0 ? Number(sellingPrice) : Math.round(cost * 1.25);
    const minSelling = Math.round(cost * 1.1);

    const product = new Product({
      name: name.trim(),
      category: categoryObj._id,
      sku,
      barcode,
      condition: condition || "Used",
      serialTracking: Boolean(serialTracking),
      costPrice: cost,
      sellingPrice: selling,
      minSellingPrice: minSelling,
      active: true,
      description: "Quick-created during Trade-In / Intake. Master details pending completion.",
    });

    await product.save();

    return NextResponse.json({
      success: true,
      message: "Quick product created successfully!",
      data: product,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to quick-create product." },
      { status: 500 }
    );
  }
}
