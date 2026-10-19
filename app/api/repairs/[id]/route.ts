import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { verifyRole } from "@/lib/auth/rbac";
import { Repair } from "@/models/Repair";
import { Payment } from "@/models/Payment";
import { recordCustomerLedgerEntry } from "@/lib/customerLedgerEngine";
import { generatePaymentNumber } from "@/lib/salesEngine";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Salesman", "Branch"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const repair = await Repair.findById(id).populate("customer").populate("location").lean();

    if (!repair) {
      return NextResponse.json({ success: false, error: "Repair record not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: repair });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch repair details." },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Salesman", "Branch"]);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error || "Unauthorized" }, { status: auth.status || 401 });
    }

    const { id } = await params;
    const repair = await Repair.findById(id);

    if (!repair) {
      return NextResponse.json({ success: false, error: "Repair record not found." }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const { action, collectAmount, paymentMethod = "CASH", status } = body;

    // Action 1: Collect Remaining Balance
    if (action === "COLLECT_BALANCE") {
      const amountToCollect = Math.max(0, Number(collectAmount || repair.balanceDue));
      if (amountToCollect <= 0) {
        return NextResponse.json({ success: false, error: "Collect amount must be greater than 0." }, { status: 400 });
      }

      if (amountToCollect > repair.balanceDue) {
        return NextResponse.json(
          { success: false, error: `Collect amount (Rs. ${amountToCollect}) exceeds balance due (Rs. ${repair.balanceDue}).` },
          { status: 400 }
        );
      }

      repair.paidAmount += amountToCollect;
      repair.balanceDue = Math.max(0, repair.totalAmount - repair.paidAmount);
      if (repair.balanceDue === 0) {
        repair.status = "DELIVERED";
      }
      await repair.save();

      // Record in Customer Ledger
      if (repair.customer) {
        await recordCustomerLedgerEntry({
          customerId: repair.customer,
          type: "PAYMENT",
          amount: amountToCollect,
          referenceType: "Repair",
          referenceId: repair.repairNumber,
          notes: `Remaining balance collection for Repair ${repair.repairNumber} via ${paymentMethod}`,
          createdBy: auth.user.username,
        });
      }

      // Record in Payment for Cash Register / Daily Closing
      const paymentNumber = await generatePaymentNumber();
      const payment = new Payment({
        paymentNumber,
        customer: repair.customer,
        location: repair.location,
        paymentMethod,
        amount: amountToCollect,
        notes: `Repair Balance Collection ${repair.repairNumber} - ${repair.productName}`,
        receivedBy: auth.user.username,
        status: "PAID",
      });
      await payment.save();

      return NextResponse.json({
        success: true,
        message: `Successfully collected Rs. ${amountToCollect.toLocaleString()} for Repair ${repair.repairNumber}.`,
        data: repair,
      });
    }

    // Action 2: Status update
    if (status) {
      repair.status = status;
      await repair.save();
      return NextResponse.json({
        success: true,
        message: `Repair status updated to ${status}.`,
        data: repair,
      });
    }

    return NextResponse.json({ success: false, error: "No valid action specified." }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update repair." },
      { status: 500 }
    );
  }
}
