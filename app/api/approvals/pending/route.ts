import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { PurchaseInvoice } from "@/models/PurchaseInvoice";
import { PurchaseReceiving } from "@/models/PurchaseReceiving";
import "@/models/Supplier"; // Ensure Supplier model is registered
import { verifyRole } from "@/lib/auth/rbac";

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    // Only Admin and Accountant can view pending approvals list
    const auth = await verifyRole(["Admin", "Accountant"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    // 1. Fetch pending Purchase Invoices
    const pendingInvoices = await PurchaseInvoice.find({ status: "Pending_Approval" })
      .populate("supplier", "name code")
      .sort({ createdAt: -1 })
      .lean();

    // 2. Fetch pending Purchase Receivings
    const pendingReceivings = await PurchaseReceiving.find({ status: "Pending_Approval" })
      .populate({
        path: "purchaseInvoice",
        select: "invoiceNumber supplier",
        populate: {
          path: "supplier",
          select: "name code",
        },
      })
      .populate("location", "name code")
      .sort({ createdAt: -1 })
      .lean();

    // 3. Format unified items list
    const formattedInvoices = pendingInvoices.map((inv: any) => {
      const productCount = inv.items.length;
      const totalQty = inv.items.reduce((sum: number, item: any) => sum + item.quantity, 0);

      return {
        id: inv._id,
        type: "Purchase Invoice",
        reference: inv.invoiceNumber,
        supplierName: inv.supplier?.name || "Unknown Supplier",
        supplierCode: inv.supplier?.code || "",
        date: inv.invoiceDate,
        amount: inv.total,
        productCount,
        quantity: totalQty,
        createdBy: inv.createdBy,
        status: inv.status,
        pendingSince: inv.createdAt,
      };
    });

    const formattedReceivings = pendingReceivings.map((rec: any) => {
      const productCount = rec.items.length;
      const totalQty = rec.items.reduce((sum: number, item: any) => sum + item.quantityReceived, 0);
      const supplier = rec.purchaseInvoice?.supplier;

      return {
        id: rec._id,
        type: "Purchase Receiving",
        reference: rec.receivingNumber,
        parentReference: rec.purchaseInvoice?.invoiceNumber || "Unknown Invoice",
        supplierName: supplier?.name || "Unknown Supplier",
        supplierCode: supplier?.code || "",
        date: rec.createdAt,
        amount: null, // No amount for physical receiving document
        locationName: rec.location?.name || "Unknown Location",
        productCount,
        quantity: totalQty,
        createdBy: rec.createdBy,
        status: rec.status,
        pendingSince: rec.createdAt,
      };
    });

    // Merge and sort by pendingSince (oldest first, so older approvals get resolved first)
    const combinedApprovals = [...formattedInvoices, ...formattedReceivings].sort(
      (a: any, b: any) => new Date(a.pendingSince).getTime() - new Date(b.pendingSince).getTime()
    );

    return NextResponse.json({ success: true, data: combinedApprovals });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch pending approvals." },
      { status: 500 }
    );
  }
}
