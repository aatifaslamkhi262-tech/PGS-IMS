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
    const body = await req.json().catch(() => ({}));
    const reason = body.reason || "Rejected by reviewer";

    const transfer = await StockTransfer.findById(id);
    if (!transfer) {
      return NextResponse.json({ success: false, error: "Transfer not found." }, { status: 404 });
    }

    if (transfer.status !== "Pending_Approval" && transfer.status !== "Draft") {
      return NextResponse.json(
        { success: false, error: `Transfer cannot be rejected from status '${transfer.status}'.` },
        { status: 400 }
      );
    }

    transfer.status = "Rejected";
    transfer.rejectedBy = auth.user?.username || "admin";
    transfer.rejectionReason = reason;
    await transfer.save();

    return NextResponse.json({
      success: true,
      message: "Transfer rejected successfully.",
      data: transfer,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to reject transfer." },
      { status: 500 }
    );
  }
}
