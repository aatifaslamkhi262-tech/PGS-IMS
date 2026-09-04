import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { PurchaseReceiving } from "@/models/PurchaseReceiving";
import { verifyRole } from "@/lib/auth/rbac";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    // Only Admin and Accountant can reject receiving
    const auth = await verifyRole(["Admin", "Accountant"]);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { reason } = body;

    if (!reason || !reason.trim()) {
      return NextResponse.json(
        { success: false, error: "A rejection reason is required." },
        { status: 400 }
      );
    }

    const receiving = await PurchaseReceiving.findById(id);
    if (!receiving) {
      return NextResponse.json({ success: false, error: "Receiving record not found." }, { status: 404 });
    }

    if (receiving.status !== "Pending_Approval") {
      return NextResponse.json(
        { success: false, error: `Only Pending Approval receiving records can be rejected. Current status: ${receiving.status}` },
        { status: 400 }
      );
    }

    receiving.status = "Rejected";
    receiving.rejectedBy = auth.user.username;
    receiving.rejectedAt = new Date();
    receiving.rejectionReason = reason.trim();

    await receiving.save();

    return NextResponse.json({ success: true, data: receiving });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to reject receiving record." },
      { status: 500 }
    );
  }
}
