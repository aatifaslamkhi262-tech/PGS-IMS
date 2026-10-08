import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { completeSale } from "@/lib/salesEngine";
import { verifyRole } from "@/lib/auth/rbac";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant"]);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const body = await req.json();
    const { paymentAllocations, notes } = body;

    if (!paymentAllocations || !Array.isArray(paymentAllocations) || paymentAllocations.length === 0) {
      return NextResponse.json({ success: false, error: "Payment allocations are required." }, { status: 400 });
    }

    const result = await completeSale({
      saleId: id,
      completedBy: auth.user.username,
      paymentAllocations,
      notes,
    });

    const completedSaleDoc = result.sale;
    const invoiceDoc = result.invoice;

    const PaymentModule = (await import("@/models/Payment")).Payment;
    const allPayments = await PaymentModule.find({ sale: completedSaleDoc._id, status: "PAID" }).lean();
    const totalPaidSum = allPayments.reduce((sum: number, p: any) => sum + Number(p.amount), 0);

    const receiptData = {
      invoiceNumber: invoiceDoc?.invoiceNumber || completedSaleDoc.saleNumber,
      saleNumber: completedSaleDoc.saleNumber,
      date: invoiceDoc?.createdAt || new Date(),
      locationName: completedSaleDoc.locationName || "Warehouse",
      cashierName: auth.user.username,
      salesmanName: completedSaleDoc.salesmanName || "Direct Counter",
      customerName: completedSaleDoc.customerName || "Walk-in Customer",
      customerPhone: completedSaleDoc.customerPhone || "N/A",
      items: (completedSaleDoc.items || []).map((it: any) => ({
        productName: it.productName || "Product Item",
        condition: it.condition || "New",
        quantity: it.quantity || 1,
        unitPrice: it.unitPrice || 0,
        lineTotal: it.lineTotal || (it.quantity * (it.unitPrice || 0)),
        serialNumbers: it.serialNumbers || [],
      })),
      subtotal: completedSaleDoc.subtotal,
      discountAmount: completedSaleDoc.discountAmount || 0,
      deliveryCharges: completedSaleDoc.deliveryCharges || 0,
      totalAmount: completedSaleDoc.totalAmount,
      paidAmount: totalPaidSum,
      changeDue: 0,
      balanceDue: 0,
      status: "COMPLETED",
      payments: allPayments.map((p: any) => ({
        method: p.paymentMethod,
        amount: p.amount,
        notes: p.notes,
      })),
    };

    return NextResponse.json({
      success: true,
      message: result.alreadyCompleted
        ? "Sale was already completed."
        : "Sale completed and invoice finalized successfully.",
      data: result.sale,
      invoice: result.invoice,
      receiptData,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to complete sale checkout." },
      { status: 500 }
    );
  }
}
