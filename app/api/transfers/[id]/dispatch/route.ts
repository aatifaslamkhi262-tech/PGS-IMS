import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { executeDispatch } from "@/lib/stockTransfer";
import { verifyRole } from "@/lib/auth/rbac";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Branch"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const body = await req.json();
    const { carrierUserId, notes } = body;

    if (!carrierUserId) {
      return NextResponse.json(
        { success: false, error: "Physical Carrier user ID is required to dispatch stock." },
        { status: 400 }
      );
    }

    const updatedTransfer = await executeDispatch({
      transferId: id,
      actionUsername: auth.user?.username || "operator",
      carrierUserId,
      notes,
    });

    return NextResponse.json({
      success: true,
      message: "Stock successfully dispatched and placed In-Transit.",
      data: updatedTransfer,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to dispatch transfer." },
      { status: 400 }
    );
  }
}
