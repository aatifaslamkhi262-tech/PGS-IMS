import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { InventoryMovement } from "@/models/InventoryMovement";
import { Location } from "@/models/Location";
import { Product } from "@/models/Product";
import { StockTransfer } from "@/models/StockTransfer";
import { verifyRole } from "@/lib/auth/rbac";

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Branch", "Salesman"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const location = searchParams.get("location") || "";
    const destinationLocation = searchParams.get("destinationLocation") || "";
    const startDate = searchParams.get("startDate") || "";
    const endDate = searchParams.get("endDate") || "";
    const product = searchParams.get("product") || "";
    const type = searchParams.get("type") || ""; // "TRANSFER", "DAMAGE", "RETURN", etc.
    const carrier = searchParams.get("carrier") || "";
    const user = searchParams.get("user") || "";
    const search = searchParams.get("search") || "";

    const query: any = {};

    // Stock Out movements must have a source location specified
    if (location) {
      query.sourceLocation = location;
    } else {
      query.sourceLocation = { $exists: true, $ne: null };
    }

    if (destinationLocation) {
      query.destinationLocation = destinationLocation;
    }

    // Filter by type or default to stock out types
    if (type) {
      query.type = type;
    } else {
      query.type = { $in: ["TRANSFER", "DAMAGE", "RETURN", "ADJUSTMENT"] };
    }

    if (product) {
      query.product = product;
    }

    if (carrier.trim()) {
      const carrierRegex = new RegExp(carrier.trim(), "i");
      query.$or = [{ carrierName: carrierRegex }, { carrierUsername: carrierRegex }];
    }

    if (user.trim()) {
      const userRegex = new RegExp(user.trim(), "i");
      query.$or = [{ performedBy: userRegex }, { dispatchedBy: userRegex }];
    }

    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        query.date.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    }

    if (search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [
        { referenceTransaction: searchRegex },
        { sourceName: searchRegex },
        { destinationName: searchRegex },
        { carrierName: searchRegex },
        { dispatchedBy: searchRegex },
        { performedBy: searchRegex },
        { notes: searchRegex },
      ];
    }

    const movements = await InventoryMovement.find(query)
      .populate("product", "name sku barcode condition serialTracking category brand modelNumber color costPrice sellingPrice minSellingPrice manuallyEditedAt")
      .populate("sourceLocation", "name code type")
      .populate("destinationLocation", "name code type")
      .populate("carrierUser", "name username role")
      .sort({ date: -1 })
      .lean();

    // Map movements with transfer links if applicable
    const refNumbers = movements.map((m) => m.referenceTransaction).filter((x): x is string => Boolean(x));
    const linkedTransfers = refNumbers.length > 0
      ? await StockTransfer.find({ transferNumber: { $in: refNumbers } })
          .select("transferNumber type status reason createdBy approvedBy dispatchedBy carrierName carrierUsername dispatchedAt receivedBy receivedAt linkedOriginalTransfer items")
          .populate("linkedOriginalTransfer", "transferNumber")
          .lean()
      : [];

    const transferMap: Record<string, any> = {};
    for (const tr of linkedTransfers) {
      transferMap[tr.transferNumber] = tr;
    }

    // Batch resolve effective product pricing (cost and selling prices)
    const { batchCalculateProductWeightedPricing, resolveProductEffectivePricing } = await import("@/lib/pricing");
    const productIds = Array.from(
      new Set(
        movements
          .map((m) => ((m.product as any)?._id ? (m.product as any)._id.toString() : (m.product ? m.product.toString() : null)))
          .filter(Boolean)
      )
    ) as string[];

    const batchPricing = await batchCalculateProductWeightedPricing(productIds);

    const result = movements.map((m) => {
      const tr = m.referenceTransaction ? transferMap[m.referenceTransaction] : null;
      const isSale =
        (m.type as string) === "SALE" ||
        Boolean(
          m.referenceTransaction &&
            (m.referenceTransaction.startsWith("INV-") ||
              m.referenceTransaction.startsWith("SALE-"))
        );

      const displayType = isSale
        ? "Customer Sale"
        : m.type === "TRANSFER" && tr?.type === "Return"
        ? "Transfer Return"
        : m.type === "TRANSFER"
        ? "Stock Transfer"
        : m.type === "DAMAGE"
        ? "Damage / Loss"
        : m.type === "RETURN"
        ? "Sales Return"
        : m.type;

      const pId = (m.product as any)?._id ? (m.product as any)._id.toString() : (m.product ? m.product.toString() : null);
      const pricing = pId ? batchPricing[pId] : null;
      const effective = m.product && typeof m.product === "object" ? resolveProductEffectivePricing(m.product as any, pricing) : null;

      // Check if transfer record had snapshotted unitCost
      const trItem = tr?.items?.find((ti: any) => ti.product?.toString() === pId && ti.condition === (m.condition || "New"));
      const snapshottedCost = (trItem && trItem.unitCost && trItem.unitCost > 0) ? trItem.unitCost : null;

      const unitCost = (m.unitCost !== undefined && m.unitCost !== null && m.unitCost > 0)
        ? m.unitCost
        : (snapshottedCost || effective?.costPrice || (m.product as any)?.costPrice || 0);

      const totalCost = (m.totalCost !== undefined && m.totalCost !== null && m.totalCost > 0)
        ? m.totalCost
        : Math.round((m.quantity || 1) * unitCost * 100) / 100;

      const sellingPrice = effective?.sellingPrice || (m.product as any)?.sellingPrice || 0;
      const totalSellingValue = Math.round((m.quantity || 1) * sellingPrice * 100) / 100;

      return {
        _id: m._id,
        date: m.date,
        reference: m.referenceTransaction || "N/A",
        type: displayType,
        sourceLocation: m.sourceLocation,
        sourceName: m.sourceName,
        destinationLocation: m.destinationLocation,
        destinationName: m.destinationName || (isSale ? "Walk-in Customer" : "N/A"),
        product: m.product,
        quantity: m.quantity,
        unitCost,
        totalCost,
        sellingPrice,
        totalSellingValue,
        condition: m.condition || (m.product as any)?.condition || "New",
        serialNumbers: m.serialNumbers || [],
        carrierUser: isSale ? null : m.carrierUser,
        carrierName: isSale ? "—" : m.carrierName || tr?.carrierName || "N/A",
        carrierUsername: isSale ? "—" : m.carrierUsername || tr?.carrierUsername || "N/A",
        dispatchedBy: m.dispatchedBy || m.performedBy || tr?.dispatchedBy || "N/A",
        performedBy: m.performedBy,
        reason: isSale ? "POS Counter Sale" : tr?.reason || m.notes || "Stock Out Movement",
        transferDetails: tr || null,
      };
    });

    const summary = {
      totalMovements: result.length,
      totalQuantity: result.reduce((sum, item) => sum + (item.quantity || 0), 0),
      totalCostValuation: Math.round(result.reduce((sum, item) => sum + (item.totalCost || 0), 0) * 100) / 100,
      totalSellingValuation: Math.round(result.reduce((sum, item) => sum + (item.totalSellingValue || 0), 0) * 100) / 100,
    };

    return NextResponse.json({ success: true, data: result, summary });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch Stock Out Activity report." },
      { status: 500 }
    );
  }
}
