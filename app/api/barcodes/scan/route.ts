import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Product } from "@/models/Product";
import { SerialNumber } from "@/models/SerialNumber";
import { Inventory } from "@/models/Inventory";
import { Location } from "@/models/Location";
import { verifyRole } from "@/lib/auth/rbac";

async function buildProductStockBreakdown(productId: any) {
  const [allLocations, invLines] = await Promise.all([
    Location.find({}).sort({ name: 1 }).select("_id name code type active").lean(),
    Inventory.find({ product: productId }).lean(),
  ]);
  const stockByLoc = new Map<string, number>();
  let totalStock = 0;

  for (const inv of invLines as any[]) {
    const locId = inv.location ? inv.location.toString() : "";
    const qty = Number(inv.quantity) || 0;
    if (locId) {
      stockByLoc.set(locId, (stockByLoc.get(locId) || 0) + qty);
    }
    totalStock += qty;
  }

  const stockBreakdown = (allLocations as any[])
    .filter((loc: any) => loc.active || (stockByLoc.get(loc._id.toString()) || 0) > 0)
    .map((loc: any) => {
      const locId = loc._id.toString();
      const qty = stockByLoc.get(locId) || 0;
      return {
        locationId: locId,
        locationName: loc.name + (loc.active ? "" : " (Inactive)"),
        locationCode: loc.code,
        locationType: loc.type,
        quantity: qty,
      };
    });

  return { totalStock, stockBreakdown };
}

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Branch", "Salesman"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const barcode = searchParams.get("barcode") || "";

    if (!barcode.trim()) {
      return NextResponse.json(
        { success: false, error: "Barcode parameter is required" },
        { status: 400 }
      );
    }

    const isAuthorizedForProvenance = ["Admin", "Warehouse", "Accountant"].includes(auth.user?.role || "");

    // 1. Try to find if scanned code is a Serial Number
    const serialRecord = await SerialNumber.findOne({
      serialNumber: barcode.trim()
    })
      .populate("product")
      .lean();

    if (serialRecord && serialRecord.product) {
      let provenance: any = null;
      let pricing: any = null;

      if (serialRecord.transactionReference) {
        const { PurchaseReceiving } = await import("@/models/PurchaseReceiving");
        const { PurchaseInvoice } = await import("@/models/PurchaseInvoice");

        const receiving = await PurchaseReceiving.findOne({
          receivingNumber: serialRecord.transactionReference,
          status: "Approved",
        })
          .populate({
            path: "purchaseInvoice",
            populate: { path: "supplier", select: "name contactPerson email phone" },
          })
          .lean();

        if (receiving) {
          const invoice = receiving.purchaseInvoice as any;
          if (invoice) {
            // Find the item matching product and condition
            const invoiceItem = invoice.items.find(
              (it: any) =>
                it.product.toString() === (serialRecord.product as any)._id.toString() &&
                it.condition === (serialRecord.product as any).condition
            );

            if (invoiceItem) {
              pricing = {
                sellingPrice: invoiceItem.sellingPrice || 0,
                minSellingPrice: invoiceItem.minSellingPrice || 0,
                ...(isAuthorizedForProvenance && { purchaseRate: invoiceItem.unitCost || 0 }),
              };
            }
          }

          if (isAuthorizedForProvenance) {
            provenance = {
              supplierName: (receiving.purchaseInvoice as any)?.supplier?.name || "Unknown Supplier",
              invoiceNumber: (receiving.purchaseInvoice as any)?.invoiceNumber || "N/A",
              receivingNumber: receiving.receivingNumber,
              receivedDate: receiving.approvedAt || receiving.createdAt,
            };
          }
        }
      }

      // ── Product-level weighted average (same logic as barcode/name lookup) ──
      const { calculateProductWeightedPricing, resolveProductEffectivePricing } = await import("@/lib/pricing");
      const productId = (serialRecord.product as any)._id.toString();
      const condition = (serialRecord.product as any).condition || (serialRecord as any).condition || "New";
      const [pricingResult, stockMeta] = await Promise.all([
        calculateProductWeightedPricing(productId, condition),
        buildProductStockBreakdown(productId),
      ]);
      const effective = resolveProductEffectivePricing(serialRecord.product as any, pricingResult);

      const safeWeightedPricing = {
        priceConfigured: pricingResult.priceConfigured,
        sellingPrice: effective.sellingPrice,
        minSellingPrice: effective.minSellingPrice,
        ...(isAuthorizedForProvenance && {
          costPrice: effective.costPrice,
        }),
      };

      // Safe product document projection
      const safeProduct = {
        _id: (serialRecord.product as any)._id,
        name: (serialRecord.product as any).name,
        sku: (serialRecord.product as any).sku,
        barcode: (serialRecord.product as any).barcode,
        condition: (serialRecord.product as any).condition,
        color: (serialRecord.product as any).color || "Unspecified",
        brand: (serialRecord.product as any).brand || "",
        modelNumber: (serialRecord.product as any).modelNumber || (serialRecord.product as any).model || "",
        model: (serialRecord.product as any).model || (serialRecord.product as any).modelNumber || "",
        serialTracking: (serialRecord.product as any).serialTracking,
        description: (serialRecord.product as any).description,
        sellingPrice: effective.sellingPrice,
        minSellingPrice: effective.minSellingPrice,
        totalStock: stockMeta.totalStock,
        stockBreakdown: stockMeta.stockBreakdown,
        ...(isAuthorizedForProvenance && { costPrice: effective.costPrice }),
      };

      return NextResponse.json({
        success: true,
        data: {
          product: safeProduct,
          serialDetails: {
            serialNumber: serialRecord.serialNumber,
            status: serialRecord.status,
            location: serialRecord.location,
            createdAt: serialRecord.createdAt,
            ...(isAuthorizedForProvenance && { provenance }),
          },
          serialTrackingEnabled: true,
          // Exact batch-level pricing for this specific serial
          exactPricing: pricing,
          // Product-level weighted averages across all approved batches
          weightedPricing: safeWeightedPricing,
          priceConfigured: pricingResult.priceConfigured,
        },
      });
    }

    // 2. Find product by barcode or exact SKU
    const cleanCode = barcode.trim();
    const escapedCode = cleanCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const product = await Product.findOne({
      $or: [
        { barcode: cleanCode },
        { barcode: new RegExp(`^${escapedCode}$`, "i") },
        { sku: new RegExp(`^${escapedCode}$`, "i") },
      ],
      isDeleted: false,
    })
      .populate("category", "name code")
      .populate("productGroup", "name description")
      .lean();

    if (!product) {
      return NextResponse.json(
        { success: false, error: "Product or Serial Number not found with this code." },
        { status: 404 }
      );
    }

    // If serial tracking is enabled, get available serial numbers
    let availableSerials: any[] = [];
    if (product.serialTracking) {
      availableSerials = await SerialNumber.find({
        product: product._id,
        status: "Available",
      })
        .sort({ createdAt: -1 })
        .lean();
    }

    let sourceHistory: any[] = [];
    if (isAuthorizedForProvenance) {
      const { PurchaseReceiving } = await import("@/models/PurchaseReceiving");
      const receivings = await PurchaseReceiving.find({
        status: "Approved",
        "items.product": product._id,
      })
        .populate({
          path: "purchaseInvoice",
          populate: { path: "supplier", select: "name contactPerson email phone" },
        })
        .populate("location", "name")
        .sort({ approvedAt: -1 })
        .lean();

      sourceHistory = receivings.map((r: any) => {
        const item = r.items.find((it: any) => it.product.toString() === product._id.toString());
        return {
          supplierName: r.purchaseInvoice?.supplier?.name || "Unknown Supplier",
          invoiceNumber: r.purchaseInvoice?.invoiceNumber || "N/A",
          receivingNumber: r.receivingNumber,
          quantityReceived: item ? item.quantityReceived : 0,
          receivedDate: r.approvedAt || r.createdAt,
          locationName: r.location?.name || "N/A",
        };
      });
    }

    // Dynamic quantity-weighted average calculation & effective precedence resolution
    const { calculateProductWeightedPricing, resolveProductEffectivePricing } = await import("@/lib/pricing");
    const [pricingResult, stockMeta] = await Promise.all([
      calculateProductWeightedPricing(product._id.toString(), product.condition),
      buildProductStockBreakdown(product._id),
    ]);
    const effective = resolveProductEffectivePricing(product as any, pricingResult);

    // Project safe product details for restricted roles
    const safeProduct = isAuthorizedForProvenance ? {
      ...product,
      costPrice: effective.costPrice,
      sellingPrice: effective.sellingPrice,
      minSellingPrice: effective.minSellingPrice,
      color: product.color || "Unspecified",
      brand: product.brand || "",
      modelNumber: product.modelNumber || product.model || "",
      model: product.model || product.modelNumber || "",
      totalStock: stockMeta.totalStock,
      stockBreakdown: stockMeta.stockBreakdown,
    } : {
      _id: product._id,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      condition: product.condition,
      costPrice: effective.costPrice,
      sellingPrice: effective.sellingPrice,
      minSellingPrice: effective.minSellingPrice,
      color: product.color || "Unspecified",
      brand: product.brand || "",
      modelNumber: product.modelNumber || product.model || "",
      model: product.model || product.modelNumber || "",
      serialTracking: product.serialTracking,
      description: product.description,
      totalStock: stockMeta.totalStock,
      stockBreakdown: stockMeta.stockBreakdown,
    };

    const safePricing = {
      priceConfigured: pricingResult.priceConfigured,
      sellingPrice: effective.sellingPrice,
      minSellingPrice: effective.minSellingPrice,
      ...(isAuthorizedForProvenance && { costPrice: effective.costPrice }),
    };

    return NextResponse.json({
      success: true,
      data: {
        product: safeProduct,
        availableSerials,
        serialTrackingEnabled: product.serialTracking,
        weightedPricing: safePricing,
        priceConfigured: pricingResult.priceConfigured,
        ...(isAuthorizedForProvenance && { sourceHistory }),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to scan barcode" },
      { status: 500 }
    );
  }
}
