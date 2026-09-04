import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Product } from "@/models/Product";
import {
  DEFAULT_PRODUCT_CONDITION,
  validateProductCondition,
  buildSkuDraft,
} from "@/lib/productCondition";
import { verifyRole } from "@/lib/auth/rbac";

// Helper function to generate unique system barcode
async function generateSystemBarcode(): Promise<string> {
  let uniqueBarcode = "";
  let attempts = 0;
  const maxAttempts = 10;
  const prefix = "PGS";

  while (attempts < maxAttempts) {
    // Generate a 9-digit random number string
    const randomNum = Math.floor(100000000 + Math.random() * 900000000).toString();
    uniqueBarcode = `${prefix}-${randomNum}`;

    const existing = await Product.findOne({
      barcode: uniqueBarcode,
      isDeleted: false,
    });

    if (!existing) {
      break;
    }
    attempts++;
  }

  if (attempts >= maxAttempts) {
    throw new Error("Failed to generate unique barcode. Please try again.");
  }

  return uniqueBarcode;
}

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);

    const search = searchParams.get("search") || "";
    const category = searchParams.get("category") || "";
    const productGroup = searchParams.get("productGroup") || "";
    const condition = searchParams.get("condition") || "";
    const status = searchParams.get("status") || "all";
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder: 1 | -1 = searchParams.get("sortOrder") === "asc" ? 1 : -1;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const query: any = { isDeleted: false };

    // Search filter (Name, SKU, Barcode, Model, ModelNumber, Brand, Color)
    if (search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      const trimmedSearch = search.trim();
      query.$or = [
        { name: searchRegex },
        { sku: searchRegex },
        { barcode: trimmedSearch }, // Exact match for barcode only
        { model: searchRegex },
        { modelNumber: searchRegex },
        { brand: searchRegex },
        { color: searchRegex },
      ];
    }

    // Filters
    if (category) query.category = category;
    if (productGroup) query.productGroup = productGroup;
    if (condition) {
      const conditionResult = validateProductCondition(condition);
      if (conditionResult.valid && conditionResult.condition) {
        query.condition = conditionResult.condition;
      }
    }
    if (status === "active") query.active = true;
    if (status === "inactive") query.active = false;

    // Sorting map
    const sortMap: any = {};
    if (sortBy === "name") sortMap.name = sortOrder;
    else if (sortBy === "sellingPrice" || sortBy === "price") sortMap.sellingPrice = sortOrder;
    else if (sortBy === "sku") sortMap.sku = sortOrder;
    else sortMap.createdAt = sortOrder;

    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      Product.find(query)
        .populate("category", "name code")
        .populate("productGroup", "name")
        .sort(sortMap)
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(query),
    ]);

    const { calculateProductWeightedPricing } = await import("@/lib/pricing");
    const productsWithPricing = [];
    for (const p of products) {
      const pricing = await calculateProductWeightedPricing(p._id.toString());
      productsWithPricing.push({
        ...p,
        color: (p as any).color || "Unspecified",
        brand: (p as any).brand || "",
        modelNumber: (p as any).modelNumber || (p as any).model || "",
        priceConfigured: pricing.priceConfigured,
        costPrice: pricing.priceConfigured ? pricing.avgCostPrice : p.costPrice,
        sellingPrice: pricing.priceConfigured ? pricing.avgSellingPrice : p.sellingPrice,
        minSellingPrice: pricing.priceConfigured ? pricing.avgMinSellingPrice : p.minSellingPrice,
      });
    }

    return NextResponse.json({
      success: true,
      data: productsWithPricing,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch products" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();

    // Field Validations
    if (!body.name || !body.name.trim()) {
      return NextResponse.json(
        { success: false, error: "Product Name cannot be empty." },
        { status: 400 }
      );
    }

    const conditionResult = validateProductCondition(
      body.condition ?? DEFAULT_PRODUCT_CONDITION
    );
    if (!conditionResult.valid || !conditionResult.condition) {
      return NextResponse.json(
        { success: false, error: conditionResult.error },
        { status: 400 }
      );
    }

    const nameVal = body.name.trim();
    const brandVal = (body.brand || "").trim();
    const modelVal = (body.modelNumber || body.model || "").trim();
    const colorVal = (body.color || "").trim() || "Unspecified";

    // Duplicate Prevention Check:
    // Case 1 (Model Number provided): Name + Model Number + Color + Condition
    // Case 2 (Model Number blank): Name + Color + Condition
    const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const duplicateQuery: any = {
      isDeleted: false,
      name: new RegExp(`^${escapeRegex(nameVal)}$`, "i"),
      color: new RegExp(`^${escapeRegex(colorVal)}$`, "i"),
      condition: conditionResult.condition,
    };

    if (modelVal) {
      duplicateQuery.$or = [
        { modelNumber: new RegExp(`^${escapeRegex(modelVal)}$`, "i") },
        { model: new RegExp(`^${escapeRegex(modelVal)}$`, "i") },
      ];
    } else {
      duplicateQuery.$or = [
        { modelNumber: "" },
        { modelNumber: null },
        { modelNumber: { $exists: false } },
        { model: "" },
        { model: null },
        { model: { $exists: false } },
      ];
    }

    const existingVariant = await Product.findOne(duplicateQuery);
    if (existingVariant) {
      return NextResponse.json(
        { success: false, error: "This product variant already exists." },
        { status: 400 }
      );
    }

    // Auto-generate SKU from name and condition
    const cleanSku = buildSkuDraft(body.name.trim(), conditionResult.condition);

    // Validate SKU uniqueness
    const existingSku = await Product.findOne({ sku: cleanSku, isDeleted: false });
    if (existingSku) {
      return NextResponse.json(
        { success: false, error: `A product with SKU "${cleanSku}" already exists. Please modify the product name or condition.` },
        { status: 400 }
      );
    }

    // Always generate system barcode (no manual input allowed)
    const cleanBarcode = await generateSystemBarcode();

    // Validate Barcode uniqueness
    const existingBarcode = await Product.findOne({ barcode: cleanBarcode, isDeleted: false });
    if (existingBarcode) {
      return NextResponse.json(
        { success: false, error: `A product with Barcode "${cleanBarcode}" already exists.` },
        { status: 400 }
      );
    }

    // Price Validations
    const costPrice = Number(body.costPrice);
    const sellingPrice = Number(body.sellingPrice);
    const minSellingPrice = Number(body.minSellingPrice);

    if (isNaN(costPrice) || costPrice < 0) {
      return NextResponse.json(
        { success: false, error: "Cost Price must be a valid number >= 0." },
        { status: 400 }
      );
    }

    if (isNaN(sellingPrice) || sellingPrice < 0) {
      return NextResponse.json(
        { success: false, error: "Selling Price must be a valid number >= 0." },
        { status: 400 }
      );
    }

    if (isNaN(minSellingPrice) || minSellingPrice < 0) {
      return NextResponse.json(
        { success: false, error: "Minimum Selling Price must be a valid number >= 0." },
        { status: 400 }
      );
    }

    if (minSellingPrice > sellingPrice) {
      return NextResponse.json(
        {
          success: false,
          error: "Minimum Selling Price cannot be greater than Selling Price.",
        },
        { status: 400 }
      );
    }

    // Resolve Relationships (Category, ProductGroup)
    let categoryId = body.category || null;
    let productGroupId = body.productGroup || null;

    const product = await Product.create({
      name: body.name.trim(),
      category: categoryId || null,
      productGroup: productGroupId || null,
      brand: brandVal,
      modelNumber: modelVal,
      model: modelVal,
      color: colorVal,
      condition: conditionResult.condition,
      sku: cleanSku,
      barcode: cleanBarcode,
      serialTracking: body.serialTracking !== undefined ? Boolean(body.serialTracking) : false,
      costPrice,
      sellingPrice,
      minSellingPrice,
      images: Array.isArray(body.images) ? body.images : [],
      description: body.description ? body.description.trim() : null,
      active: body.active !== undefined ? Boolean(body.active) : true,
    });

    const populatedProduct = await Product.findById(product._id)
      .populate("category", "name code")
      .populate("productGroup", "name");

    return NextResponse.json({ success: true, data: populatedProduct }, { status: 201 });
  } catch (error: any) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0] || "Field";
      return NextResponse.json(
        { success: false, error: `Duplicate value error on field: ${field}.` },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: error.message || "Failed to create product" },
      { status: 500 }
    );
  }
}
