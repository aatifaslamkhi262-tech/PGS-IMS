import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { PurchaseReceiving } from "@/models/PurchaseReceiving";
import { PurchaseInvoice } from "@/models/PurchaseInvoice";
import { verifyRole } from "@/lib/auth/rbac";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const receiving = await PurchaseReceiving.findById(id);
    if (!receiving) {
      return NextResponse.json({ success: false, error: "Receiving record not found." }, { status: 404 });
    }

    if (receiving.status !== "Draft" && receiving.status !== "Rejected") {
      return NextResponse.json(
        { success: false, error: `Only Draft or Rejected receiving records can be submitted. Current status: ${receiving.status}` },
        { status: 400 }
      );
    }

    receiving.status = "Pending_Approval";
    receiving.rejectedBy = undefined;
    receiving.rejectedAt = undefined;
    receiving.rejectionReason = undefined;

    await receiving.save();

    // Transition parent invoice status
    const invoice = await PurchaseInvoice.findById(receiving.purchaseInvoice);
    if (invoice) {
      if (invoice.status === "Approved" || invoice.status === "Ready_For_Receiving") {
        invoice.status = "Receiving";
        await invoice.save();
      }
    }

    return NextResponse.json({ success: true, data: receiving });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to submit receiving for approval." },
      { status: 500 }
    );
  }
}
