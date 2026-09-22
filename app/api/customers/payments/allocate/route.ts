import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Customer } from "@/models/Customer";
import { Invoice } from "@/models/Invoice";
import { Payment, PaymentMethod } from "@/models/Payment";
import { generatePaymentNumber } from "@/lib/salesEngine";
import { recordCustomerLedgerEntry } from "@/lib/customerLedgerEngine";
import { recordCashMovement } from "@/lib/cashSessionEngine";
import { CashSession } from "@/models/CashSession";
import { verifyRole } from "@/lib/auth/rbac";

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Salesman", "Branch"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const {
      customerId,
      locationId,
      paymentMethod,
      totalAmount,
      allocations, // Array of { invoiceId: string, amount: number }
      referenceNumber,
      notes,
      receivedBy,
    } = body;

    if (!customerId) {
      return NextResponse.json({ success: false, error: "Customer ID is required." }, { status: 400 });
    }

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return NextResponse.json({ success: false, error: "Customer not found." }, { status: 400 });
    }

    const totalAlloc = Array.isArray(allocations)
      ? allocations.reduce((sum: number, a: any) => sum + Number(a.amount || 0), 0)
      : Number(totalAmount || 0);

    if (totalAlloc <= 0) {
      return NextResponse.json({ success: false, error: "Payment allocation total must be > 0." }, { status: 400 });
    }

    const processedAllocations: any[] = [];
    for (const alloc of allocations || []) {
      const inv = await Invoice.findById(alloc.invoiceId);
      if (!inv) continue;

      const allocAmt = Number(alloc.amount || 0);
      if (allocAmt <= 0) continue;

      inv.paidAmount = (inv.paidAmount || 0) + allocAmt;
      inv.balanceDue = Math.max(0, inv.totalAmount - inv.paidAmount);
      await inv.save();

      processedAllocations.push({
        invoice: inv._id,
        invoiceNumber: inv.invoiceNumber,
        amount: allocAmt,
      });
    }

    const paymentNumber = await generatePaymentNumber();
    const payment = new Payment({
      paymentNumber,
      customer: customer._id,
      location: locationId || customer._id,
      paymentMethod: paymentMethod || "CASH",
      amount: totalAlloc,
      allocations: processedAllocations,
      referenceNumber: referenceNumber?.trim(),
      notes: notes?.trim() || `Multi-invoice payment allocation for ${customer.name}`,
      receivedBy: receivedBy || auth.user?.username || "system",
      status: "PAID",
    });

    await payment.save();

    // Customer Ledger entry
    await recordCustomerLedgerEntry({
      customerId: customer._id.toString(),
      type: "PAYMENT",
      amount: totalAlloc,
      referenceType: "Payment",
      referenceId: paymentNumber,
      notes: `Allocated payment across ${processedAllocations.length} invoice(s)`,
      createdBy: receivedBy || auth.user?.username || "system",
    });

    // Cash movement if Cash
    if (paymentMethod === "CASH" && locationId) {
      const activeCashSession = await CashSession.findOne({
        location: locationId,
        cashier: receivedBy || auth.user?.username || "system",
        status: "OPEN",
      });

      if (activeCashSession) {
        await recordCashMovement({
          sessionId: activeCashSession._id.toString(),
          locationId,
          cashier: receivedBy || auth.user?.username || "system",
          type: "DEBT_COLLECTION",
          amount: totalAlloc,
          direction: "IN",
          referenceType: "Payment",
          referenceId: paymentNumber,
          notes: `Multi-invoice payment collection (${customer.name})`,
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        paymentNumber,
        totalAllocated: totalAlloc,
        allocationsCount: processedAllocations.length,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process payment allocation." },
      { status: 500 }
    );
  }
}
