import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { executeReceive } from "@/lib/stockTransfer";
import { verifyRole } from "@/lib/auth/rbac";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Branch", "Accountant"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { notes, damagedItems } = body;

    const updatedTransfer = await executeReceive({
      transferId: id,
      receivingUsername: auth.user?.username || "receiver",
      damagedItems,
      notes,
    });

    return NextResponse.json({
      success: true,
      message: "Stock successfully received into destination inventory.",
      data: updatedTransfer,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to receive transfer." },
      { status: 400 }
    );
  }
}
