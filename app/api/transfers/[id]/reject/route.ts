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

    const { executeCancelTransfer } = await import("@/lib/stockTransfer");
    const updatedTransfer = await executeCancelTransfer({
      transferId: id,
      actionUsername: auth.user?.username || "admin",
      reason,
    });

    return NextResponse.json({
      success: true,
      message: "Transfer cancelled/rejected successfully.",
      data: updatedTransfer,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to reject transfer." },
      { status: 500 }
    );
  }
}
