import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Inventory } from "@/models/Inventory";
import { Product } from "@/models/Product";
import { Location } from "@/models/Location";
import { SerialNumber } from "@/models/SerialNumber";
import { InventoryMovement } from "@/models/InventoryMovement";
import { verifyRole } from "@/lib/auth/rbac";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Branch", "Salesman"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { productId } = await params;

    // 1. Fetch product details
    const product = await Product.findById(productId)
      .populate("category", "name code")
      .populate("productGroup", "name")
      .lean();

    if (!product) {
      return NextResponse.json({ success: false, error: "Product not found." }, { status: 404 });
    }

    const { calculateProductWeightedPricing } = await import("@/lib/pricing");
    const pricing = await calculateProductWeightedPricing(product._id.toString());
    const isAuthorizedForCost = ["Admin", "Warehouse", "Accountant"].includes(auth.user?.role || "");

    const safeProduct = {
      ...product,
      priceConfigured: pricing.priceConfigured,
      costPrice: pricing.priceConfigured ? pricing.avgCostPrice : product.costPrice,
      sellingPrice: pricing.priceConfigured ? pricing.avgSellingPrice : product.sellingPrice,
      minSellingPrice: pricing.priceConfigured ? pricing.avgMinSellingPrice : product.minSellingPrice,
    };

    if (!isAuthorizedForCost) {
      delete (safeProduct as any).costPrice;
    }

    // 2. Fetch inventory breakdown
    const inventoryLines = await Inventory.find({ product: productId })
      .populate("location", "name code type active")
      .lean();

    // 3. Load all locations to build a complete breakdown
    const allLocations = await Location.find({ active: true }).select("name code type").lean();
    const breakdown = allLocations.map((loc) => {
      const line = inventoryLines.find((il) => il.location._id.toString() === loc._id.toString());
      return {
        locationId: loc._id,
        locationName: loc.name,
        locationCode: loc.code,
        locationType: loc.type,
        quantity: line ? line.quantity : 0,
      };
    });

    const totalQuantity = breakdown.reduce((sum, loc) => sum + loc.quantity, 0);

    // 4. Fetch serial numbers if serialized
    let serials: any[] = [];
    if (product.serialTracking) {
      serials = await SerialNumber.find({ product: productId, status: "Available" })
        .select("serialNumber status location transactionReference createdAt")
        .sort({ createdAt: -1 })
        .lean();
    }

    // 5. Fetch recent movement history
    const movements = await InventoryMovement.find({ product: productId })
      .populate("sourceLocation", "name code type")
      .populate("destinationLocation", "name code type")
      .sort({ date: -1 })
      .limit(50)
      .lean();

    const isAuthorizedForProvenance = ["Admin", "Warehouse", "Accountant"].includes(auth.user?.role || "");
    let sourceHistory: any[] = [];
    if (isAuthorizedForProvenance) {
      const { PurchaseReceiving } = await import("@/models/PurchaseReceiving");
      const receivings = await PurchaseReceiving.find({
        status: "Approved",
        "items.product": productId,
      })
        .populate({
          path: "purchaseInvoice",
          populate: { path: "supplier", select: "name contactPerson email phone" },
        })
        .populate("location", "name")
        .sort({ approvedAt: -1 })
        .lean();

      sourceHistory = receivings.map((r: any) => {
        const item = r.items.find((it: any) => it.product.toString() === productId.toString());
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

    return NextResponse.json({
      success: true,
      data: {
        product: safeProduct,
        locations: breakdown,
        totalQuantity,
        serials,
        movements,
        ...(isAuthorizedForProvenance && { sourceHistory }),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch product inventory details." },
      { status: 500 }
    );
  }
}
