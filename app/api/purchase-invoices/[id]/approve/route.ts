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
    // Only Admin and Accountant can approve purchase invoices
    const auth = await verifyRole(["Admin", "Accountant"]);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const invoice = await PurchaseInvoice.findById(id);

    if (!invoice) {
      return NextResponse.json({ success: false, error: "Purchase Invoice not found." }, { status: 404 });
    }

    // Idempotency: if already approved, return success without repeating logic
    if (invoice.status === "Approved") {
      return NextResponse.json({
        success: true,
        message: "Purchase Invoice is already approved.",
        data: invoice,
      });
    }

    if (invoice.status !== "Pending_Approval") {
      return NextResponse.json(
        { success: false, error: `Only Pending Approval invoices can be approved. Current status: ${invoice.status}` },
        { status: 400 }
      );
    }

    invoice.status = "Approved";
    invoice.approvedBy = auth.user.username;
    invoice.approvedAt = new Date();

    // Clean any legacy rejection marks
    invoice.rejectedBy = undefined;
    invoice.rejectedAt = undefined;
    invoice.rejectionReason = undefined;

    await invoice.save();

    // NOTE: INVENTORY IS NOT UPDATED IN THIS PHASE (AS PER CLIENT CONFIRMATION RULE 21)
    // Physical inventory changes only occur on the future receiving finalization step.

    return NextResponse.json({ success: true, data: invoice });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to approve invoice." },
      { status: 500 }
    );
  }
}
