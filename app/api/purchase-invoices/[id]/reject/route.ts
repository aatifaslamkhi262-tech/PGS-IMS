import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { PurchaseInvoice } from "@/models/PurchaseInvoice";
import { verifyRole } from "@/lib/auth/rbac";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    // Only Admin and Accountant can reject purchase invoices
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

    const invoice = await PurchaseInvoice.findById(id);
    if (!invoice) {
      return NextResponse.json({ success: false, error: "Purchase Invoice not found." }, { status: 404 });
    }

    if (invoice.status !== "Pending_Approval") {
      return NextResponse.json(
        { success: false, error: `Only Pending Approval invoices can be rejected. Current status: ${invoice.status}` },
        { status: 400 }
      );
    }

    invoice.status = "Rejected";
    invoice.rejectedBy = auth.user.username;
    invoice.rejectedAt = new Date();
    invoice.rejectionReason = reason.trim();

    // Clean any approved states
    invoice.approvedBy = undefined;
    invoice.approvedAt = undefined;

    await invoice.save();

    return NextResponse.json({ success: true, data: invoice });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to reject invoice." },
      { status: 500 }
    );
  }
}
