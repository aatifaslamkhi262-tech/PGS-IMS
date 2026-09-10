import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { StockTransfer } from "@/models/StockTransfer";
import { generateTransferNumber } from "@/lib/stockTransfer";
import { verifyRole } from "@/lib/auth/rbac";

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Branch", "Salesman"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const sourceLocation = searchParams.get("sourceLocation") || "";
    const destinationLocation = searchParams.get("destinationLocation") || "";
    const type = searchParams.get("type") || "";

    const query: any = {};
    if (search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [
        { transferNumber: searchRegex },
        { reason: searchRegex },
        { createdBy: searchRegex },
        { dispatchedBy: searchRegex },
        { carrierName: searchRegex },
        { receivedBy: searchRegex },
        { "items.serialNumbers": searchRegex },
      ];
    }
    if (status) {
      query.status = status;
    }
    if (sourceLocation) {
      query.sourceLocation = sourceLocation;
    }
    if (destinationLocation) {
      query.destinationLocation = destinationLocation;
    }
    if (type) {
      query.type = type;
    }

    const transfers = await StockTransfer.find(query)
      .populate("sourceLocation", "name code type")
      .populate("destinationLocation", "name code type")
      .populate("items.product", "name sku barcode serialTracking condition costPrice sellingPrice minSellingPrice manuallyEditedAt")
      .populate("carrierUser", "name username role")
      .populate("linkedOriginalTransfer", "transferNumber status")
      .sort({ createdAt: -1 })
      .lean();

    const { batchCalculateProductWeightedPricing, resolveProductEffectivePricing } = await import("@/lib/pricing");
    const allProductIds = Array.from(
      new Set(
        transfers.flatMap((t: any) =>
          (t.items || []).map((it: any) =>
            it.product?._id ? it.product._id.toString() : (it.product ? it.product.toString() : null)
          )
        ).filter(Boolean)
      )
    ) as string[];

    const batchPricing = await batchCalculateProductWeightedPricing(allProductIds);

    const transfersWithPricing = transfers.map((tr: any) => ({
      ...tr,
      items: (tr.items || []).map((it: any) => {
        if (!it.product) return it;
        const pId = it.product._id ? it.product._id.toString() : it.product.toString();
        const pricing = batchPricing[pId];
        const effective = resolveProductEffectivePricing(it.product, pricing);

        return {
          ...it,
          product: {
            ...it.product,
            costPrice: effective.costPrice,
            sellingPrice: effective.sellingPrice,
            minSellingPrice: effective.minSellingPrice,
            pricingSource: effective.source,
            weightedPricing: pricing,
          },
        };
      }),
    }));

    return NextResponse.json({ success: true, data: transfersWithPricing });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch stock transfers." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Branch"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const { sourceLocation, destinationLocation, items, reason, notes, status: requestedStatus } = body;

    if (!sourceLocation || !destinationLocation) {
      return NextResponse.json(
        { success: false, error: "Source location and Destination location are required." },
        { status: 400 }
      );
    }

    if (sourceLocation === destinationLocation) {
      return NextResponse.json(
        { success: false, error: "Source location and Destination location cannot be the same." },
        { status: 400 }
      );
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: "At least one item is required for stock transfer." },
        { status: 400 }
      );
    }

    // Validate item quantities and conditions
    for (const item of items) {
      if (!item.product || !item.quantity || item.quantity <= 0) {
        return NextResponse.json(
          { success: false, error: "Each item must have a valid product and positive quantity." },
          { status: 400 }
        );
      }
      if (!item.condition) {
        item.condition = "New";
      }
    }

    const transferNumber = await generateTransferNumber();
    const initialStatus = requestedStatus === "Approved" && ["Admin", "Warehouse"].includes(auth.user?.role || "")
      ? "Approved"
      : requestedStatus === "Pending_Approval"
      ? "Pending_Approval"
      : "Draft";

    const transfer = new StockTransfer({
      transferNumber,
      type: "Normal",
      sourceLocation,
      destinationLocation,
      status: initialStatus,
      items,
      reason: reason || "Stock Request",
      notes: notes || "",
      createdBy: auth.user?.username || "system",
      approvedBy: initialStatus === "Approved" ? auth.user?.username : undefined,
    });

    await transfer.save();

    const populatedTransfer = await StockTransfer.findById(transfer._id)
      .populate("sourceLocation", "name code type")
      .populate("destinationLocation", "name code type")
      .populate("items.product", "name sku barcode serialTracking condition");

    return NextResponse.json({ success: true, data: populatedTransfer }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create stock transfer." },
      { status: 500 }
    );
  }
}
