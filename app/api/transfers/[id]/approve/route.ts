import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { StockTransfer } from "@/models/StockTransfer";
import { verifyRole } from "@/lib/auth/rbac";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const transfer = await StockTransfer.findById(id);
    if (!transfer) {
      return NextResponse.json({ success: false, error: "Transfer not found." }, { status: 404 });
    }

    if (transfer.status !== "Pending_Approval" && transfer.status !== "Draft") {
      return NextResponse.json(
        { success: false, error: `Transfer cannot be approved from status '${transfer.status}'.` },
        { status: 400 }
      );
    }

    transfer.status = "Approved";
    transfer.approvedBy = auth.user?.username || "admin";
    await transfer.save();

    return NextResponse.json({
      success: true,
      message: "Transfer approved successfully. Stock remains at source until dispatched.",
      data: transfer,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to approve transfer." },
      { status: 500 }
    );
  }
}
