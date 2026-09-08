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

    // Filter by type or default to stock out types
    if (type) {
      query.type = type;
    } else {
      query.type = { $in: ["TRANSFER", "DAMAGE", "RETURN", "SALE"] };
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
        query.date.$lte = new Date(endDate);
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
      .populate("product", "name sku barcode condition serialTracking category brand modelNumber color")
      .populate("sourceLocation", "name code type")
      .populate("destinationLocation", "name code type")
      .populate("carrierUser", "name username role")
      .sort({ date: -1 })
      .lean();

    // Map movements with transfer links if applicable
    const refNumbers = movements.map((m) => m.referenceTransaction).filter((x): x is string => Boolean(x));
    const linkedTransfers = refNumbers.length > 0
      ? await StockTransfer.find({ transferNumber: { $in: refNumbers } })
          .select("transferNumber type status reason createdBy approvedBy dispatchedBy carrierName carrierUsername dispatchedAt receivedBy receivedAt linkedOriginalTransfer")
          .populate("linkedOriginalTransfer", "transferNumber")
          .lean()
      : [];

    const transferMap: Record<string, any> = {};
    for (const tr of linkedTransfers) {
      transferMap[tr.transferNumber] = tr;
    }

    const result = movements.map((m) => {
      const tr = m.referenceTransaction ? transferMap[m.referenceTransaction] : null;
      return {
        _id: m._id,
        date: m.date,
        reference: m.referenceTransaction || "N/A",
        type: m.type === "TRANSFER" && tr?.type === "Return" ? "Transfer Return" : m.type === "TRANSFER" ? "Stock Transfer" : m.type,
        sourceLocation: m.sourceLocation,
        sourceName: m.sourceName,
        destinationLocation: m.destinationLocation,
        destinationName: m.destinationName,
        product: m.product,
        quantity: m.quantity,
        condition: m.condition || (m.product as any)?.condition || "New",
        serialNumbers: m.serialNumbers || [],
        carrierUser: m.carrierUser,
        carrierName: m.carrierName || tr?.carrierName || "N/A",
        carrierUsername: m.carrierUsername || tr?.carrierUsername || "N/A",
        dispatchedBy: m.dispatchedBy || m.performedBy || tr?.dispatchedBy || "N/A",
        performedBy: m.performedBy,
        reason: tr?.reason || m.notes || "Stock Out Movement",
        transferDetails: tr || null,
      };
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch Stock Out Activity report." },
      { status: 500 }
    );
  }
}
