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
    // Admin and Warehouse can submit invoices for approval
    const auth = await verifyRole(["Admin", "Warehouse"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const invoice = await PurchaseInvoice.findById(id);

    if (!invoice) {
      return NextResponse.json({ success: false, error: "Purchase Invoice not found." }, { status: 404 });
    }

    if (invoice.status !== "Draft" && invoice.status !== "Rejected") {
      return NextResponse.json(
        { success: false, error: `Only Draft or Rejected invoices can be submitted. Current status: ${invoice.status}` },
        { status: 400 }
      );
    }

    invoice.status = "Pending_Approval";
    await invoice.save();

    return NextResponse.json({ success: true, data: invoice });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to submit invoice." },
      { status: 500 }
    );
  }
}
