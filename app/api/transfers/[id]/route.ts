import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { StockTransfer } from "@/models/StockTransfer";
import { verifyRole } from "@/lib/auth/rbac";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Branch", "Salesman"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const transfer = await StockTransfer.findById(id)
      .populate("sourceLocation", "name code type active")
      .populate("destinationLocation", "name code type active")
      .populate("items.product", "name sku barcode serialTracking condition costPrice sellingPrice")
      .populate("carrierUser", "name username role")
      .populate("linkedOriginalTransfer", "transferNumber status sourceLocation destinationLocation");

    if (!transfer) {
      return NextResponse.json({ success: false, error: "Stock transfer not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: transfer });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch stock transfer details." },
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
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Branch"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const transfer = await StockTransfer.findById(id);
    if (!transfer) {
      return NextResponse.json({ success: false, error: "Stock transfer not found." }, { status: 404 });
    }

    if (transfer.status !== "Draft" && transfer.status !== "Rejected" && transfer.status !== "Pending_Approval") {
      return NextResponse.json(
        { success: false, error: `Cannot edit transfer in '${transfer.status}' status.` },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { sourceLocation, destinationLocation, items, reason, notes, status: requestedStatus } = body;

    if (sourceLocation) transfer.sourceLocation = sourceLocation;
    if (destinationLocation) transfer.destinationLocation = destinationLocation;
    if (items) transfer.items = items;
    if (reason) transfer.reason = reason;
    if (notes) transfer.notes = notes;

    if (requestedStatus) {
      transfer.status = requestedStatus;
    }

    await transfer.save();

    const updated = await StockTransfer.findById(transfer._id)
      .populate("sourceLocation", "name code type")
      .populate("destinationLocation", "name code type")
      .populate("items.product", "name sku barcode serialTracking condition");

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update stock transfer." },
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
    const transfer = await StockTransfer.findById(id);
    if (!transfer) {
      return NextResponse.json({ success: false, error: "Stock transfer not found." }, { status: 404 });
    }

    if (transfer.status !== "Draft" && transfer.status !== "Rejected") {
      return NextResponse.json(
        { success: false, error: `Cannot delete transfer in '${transfer.status}' status. Only Draft or Rejected transfers can be deleted.` },
        { status: 400 }
      );
    }

    await StockTransfer.findByIdAndDelete(id);
    return NextResponse.json({ success: true, message: "Transfer record deleted successfully." });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete transfer." },
      { status: 500 }
    );
  }
}
