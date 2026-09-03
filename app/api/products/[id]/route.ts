import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Product } from "@/models/Product";
import "@/models/Category"; // Ensure Category model is registered
import "@/models/ProductGroup"; // Ensure ProductGroup model is registered
import { validateProductCondition, buildSkuDraft } from "@/lib/productCondition";
import { verifyRole } from "@/lib/auth/rbac";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;

    const product = await Product.findOne({ _id: id, isDeleted: false })
      .populate("category", "name code")
      .populate("productGroup", "name description")
      .lean();

    if (!product) {
      return NextResponse.json(
        { success: false, error: "Product not found" },
        { status: 404 }
      );
    }

    const { calculateProductWeightedPricing } = await import("@/lib/pricing");
    const pricing = await calculateProductWeightedPricing(product._id.toString());

    const productWithPricing = {
      ...product,
      color: product.color || "Unspecified",
      brand: product.brand || "",
      modelNumber: product.modelNumber || product.model || "",
      priceConfigured: pricing.priceConfigured,
      costPrice: product.costPrice ?? (pricing.priceConfigured ? pricing.avgCostPrice : 0),
      sellingPrice: product.sellingPrice ?? (pricing.priceConfigured ? pricing.avgSellingPrice : 0),
      minSellingPrice: product.minSellingPrice ?? (pricing.priceConfigured ? pricing.avgMinSellingPrice : 0),
      weightedPricing: pricing,
    };

    return NextResponse.json({ success: true, data: productWithPricing });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch product" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const body = await req.json();

    const product = await Product.findOne({ _id: id, isDeleted: false });
    if (!product) {
      return NextResponse.json(
        { success: false, error: "Product not found" },
        { status: 404 }
      );
    }

    // Validations
    if (body.name !== undefined && (!body.name || !body.name.trim())) {
      return NextResponse.json(
        { success: false, error: "Product Name cannot be empty." },
        { status: 400 }
      );
    }

    // Auto-generate SKU if name or condition changes
    let nextCondition = product.condition;
    if (body.condition !== undefined) {
      const conditionResult = validateProductCondition(body.condition);
      if (!conditionResult.valid || !conditionResult.condition) {
        return NextResponse.json(
          { success: false, error: conditionResult.error },
          { status: 400 }
        );
      }
      nextCondition = conditionResult.condition;
    }

    const nameVal = (body.name !== undefined ? body.name : product.name).trim();
    const brandVal = body.brand !== undefined ? body.brand.trim() : (product.brand || "");
    const modelVal = body.modelNumber !== undefined
      ? body.modelNumber.trim()
      : (body.model !== undefined ? body.model.trim() : (product.modelNumber || product.model || "").trim());
    const colorVal = body.color !== undefined
      ? (body.color.trim() || "Unspecified")
      : (product.color || "Unspecified");

    // Check duplicate variant (excluding current product ID)
    // Case 1 (Model Number provided): Name + Model Number + Color + Condition
    // Case 2 (Model Number blank): Name + Color + Condition
    const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const duplicateQuery: any = {
      _id: { $ne: id },
      isDeleted: false,
      name: new RegExp(`^${escapeRegex(nameVal)}$`, "i"),
      color: new RegExp(`^${escapeRegex(colorVal)}$`, "i"),
      condition: nextCondition,
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

    // Use explicitly passed SKU or keep existing SKU (do not force buildSkuDraft on every edit)
    const cleanSku = body.sku && body.sku.trim() 
      ? body.sku.trim().toUpperCase() 
      : product.sku;

    // Barcode cannot be changed - always use existing barcode
    const cleanBarcode = product.barcode;

    // Check SKU duplicate (excluding current product)
    if (cleanSku !== product.sku) {
      const existingSku = await Product.findOne({
        sku: cleanSku,
        _id: { $ne: id },
        isDeleted: false,
      });
      if (existingSku) {
        return NextResponse.json(
          { success: false, error: `A product with SKU "${cleanSku}" already exists. Please modify the product name or condition.` },
          { status: 400 }
        );
      }
    }

    // Price numeric validations
    const costPrice =
      body.costPrice !== undefined ? Number(body.costPrice) : product.costPrice;
    const sellingPrice =
      body.sellingPrice !== undefined ? Number(body.sellingPrice) : product.sellingPrice;
    const minSellingPrice =
      body.minSellingPrice !== undefined
        ? Number(body.minSellingPrice)
        : product.minSellingPrice;

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

    // Apply updates on SAME record ID
    if (body.name !== undefined) product.name = body.name.trim();
    product.sku = cleanSku;
    product.barcode = cleanBarcode;
    if (body.serialTracking !== undefined) product.serialTracking = Boolean(body.serialTracking);
    if (body.category !== undefined) product.category = body.category || null;
    if (body.productGroup !== undefined) product.productGroup = body.productGroup || null;
    product.brand = brandVal;
    product.modelNumber = modelVal;
    product.model = modelVal;
    product.color = colorVal;
    product.condition = nextCondition;
    product.costPrice = costPrice;
    product.sellingPrice = sellingPrice;
    product.minSellingPrice = minSellingPrice;
    if (body.images !== undefined) {
      // Ensure images have proper structure
      product.images = Array.isArray(body.images) ? body.images : [];
    }
    if (body.description !== undefined) product.description = body.description ? body.description.trim() : null;
    if (body.active !== undefined) product.active = Boolean(body.active);

    await product.save();

    const updatedProduct = await Product.findById(product._id)
      .populate("category", "name code")
      .populate("productGroup", "name description");

    return NextResponse.json({ success: true, data: updatedProduct });
  } catch (error: any) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0] || "Field";
      return NextResponse.json(
        { success: false, error: `Duplicate value error on field: ${field}.` },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: error.message || "Failed to update product" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const product = await Product.findById(id);
    if (!product || product.isDeleted) {
      return NextResponse.json(
        { success: false, error: "Product not found" },
        { status: 404 }
      );
    }

    // Perform Soft Delete
    product.isDeleted = true;
    product.deletedAt = new Date();
    await product.save({ validateBeforeSave: false });

    return NextResponse.json({
      success: true,
      message: "Product soft deleted successfully",
      id,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete product" },
      { status: 500 }
    );
  }
}
