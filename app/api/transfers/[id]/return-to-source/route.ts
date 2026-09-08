import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { executeReturnToSource } from "@/lib/stockTransfer";
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
    const { reason } = body;

    const returnTransfer = await executeReturnToSource({
      originalTransferId: id,
      requestingUsername: auth.user?.username || "user",
      reason,
    });

    return NextResponse.json({
      success: true,
      message: "Return to Source transfer created successfully.",
      data: returnTransfer,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create return transfer." },
      { status: 400 }
    );
  }
}
