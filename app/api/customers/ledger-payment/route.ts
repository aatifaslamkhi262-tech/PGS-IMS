import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/lib/db";
import { Customer } from "@/models/Customer";
import { Payment } from "@/models/Payment";
import { Location } from "@/models/Location";
import { CustomerLedger } from "@/models/CustomerLedger";
import { findOrAutoOpenCashSession, recordCashMovement } from "@/lib/cashSessionEngine";
import { recordCustomerLedgerEntry } from "@/lib/customerLedgerEngine";
import { nextSequentialPaymentNumber } from "@/lib/salesEngine";

export async function POST(request: Request) {
  try {
    await dbConnect();
    const body = await request.json();
    const {
      customerId,
      locationId,
      amount,
      paymentMethod,
      paymentAllocations,
      receivedBy,
      notes,
      actionType,
    } = body;

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return NextResponse.json({ success: false, error: "Customer not found." }, { status: 404 });
    }

    const sanitizedAllocations =
      actionType !== "ADD_DEBT" && Array.isArray(paymentAllocations) && paymentAllocations.length > 0
        ? paymentAllocations
            .filter((a: any) => Number(a?.amount || 0) > 0)
            .map((a: any) => ({
              method: String(a.method || "CASH"),
              amount: Number(a.amount || 0),
              referenceNumber: a.referenceNumber ? String(a.referenceNumber) : undefined,
            }))
        : [];

    const paymentAmount =
      sanitizedAllocations.length > 0
        ? sanitizedAllocations.reduce((s, a) => s + a.amount, 0)
        : Number(amount);

    if (!paymentAmount || paymentAmount <= 0) {
      return NextResponse.json({ success: false, error: "Amount must be greater than 0." }, { status: 400 });
    }

    const session = await mongoose.startSession();
    try {
      session.startTransaction();
    } catch {
      session.endSession();
    }
    const isTxActive = session.inTransaction();

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");

    // 🔴 Action: ADD_DEBT (+) [Customer took more on credit / manual debt addition]
    if (actionType === "ADD_DEBT") {
      const adjPrefix = `ADJ-${dateStr}-`;
      const lastAdj: any = await CustomerLedger.findOne({
        referenceId: new RegExp(`^${adjPrefix}`),
      })
        .select("referenceId")
        .sort({ referenceId: -1 })
        .lean();
      let nextAdjSeq = 1;
      if (lastAdj?.referenceId) {
        const parts = String(lastAdj.referenceId).split("-");
        const parsed = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(parsed)) nextAdjSeq = parsed + 1;
      }
      const adjustmentNumber = `${adjPrefix}${String(nextAdjSeq).padStart(3, "0")}`;

      const ledgerEntry = await recordCustomerLedgerEntry(
        {
          customerId: customer._id.toString(),
          type: "DEBT_ADJUSTMENT",
          amount: paymentAmount,
          referenceType: "DebtAdjustment",
          referenceId: adjustmentNumber,
          notes: notes || `Udhar / Balance adjustment added for ${customer.name}`,
          createdBy: receivedBy || "system",
        },
        isTxActive ? session : undefined
      );

      if (isTxActive) {
        await session.commitTransaction();
        session.endSession();
      }

      const updatedCustomer = await Customer.findById(customer._id);

      return NextResponse.json({
        success: true,
        message: `Udhar of Rs. ${paymentAmount.toLocaleString()} added for ${customer.name}.`,
        data: {
          customer: updatedCustomer || customer,
          ledgerEntry,
        },
      });
    }

    // 🟢 Action: PAYMENT (-) [Customer made a payment / khata collection]
    let location = locationId ? await Location.findById(locationId) : null;
    if (!location) {
      const { getSession } = await import("@/lib/auth/session");
      const sessionUser = await getSession();
      if (sessionUser?.userId) {
        const { User } = await import("@/models/User");
        const u = await User.findById(sessionUser.userId).select("assignedLocation").lean();
        if (u?.assignedLocation) {
          location = await Location.findById(u.assignedLocation);
        }
      }
    }
    if (!location) {
      return NextResponse.json({ success: false, error: "Valid branch location is required for ledger payment." }, { status: 400 });
    }

    const effectiveAllocations =
      sanitizedAllocations.length > 0
        ? sanitizedAllocations
        : [{ method: paymentMethod || "CASH", amount: paymentAmount, referenceNumber: undefined }];

    const usedPaymentNums = new Set<string>();
    const createdPayments: any[] = [];
    for (const alloc of effectiveAllocations) {
      const paymentNumber = await nextSequentialPaymentNumber(
        usedPaymentNums,
        isTxActive ? session : undefined
      );
      const payment = new Payment({
        paymentNumber,
        location: location?._id,
        locationName: location?.name || "Counter",
        customer: customer._id,
        customerName: customer.name,
        paymentMethod: alloc.method,
        amount: alloc.amount,
        referenceNumber: alloc.referenceNumber,
        receivedBy: receivedBy || "system",
        notes: notes || `Customer Khata Settlement for ${customer.name}`,
        status: "PAID",
      });

      if (isTxActive) {
        await payment.save({ session });
      } else {
        await payment.save();
      }
      createdPayments.push(payment);
    }

    // Single source of truth for Customer Ledger entry & balance updates
    const ledgerEntry = await recordCustomerLedgerEntry(
      {
        customerId: customer._id.toString(),
        type: "PAYMENT",
        amount: paymentAmount,
        referenceType: "Payment",
        referenceId: createdPayments[0].paymentNumber,
        notes: notes || `Customer Khata Settlement for ${customer.name}`,
        createdBy: receivedBy || "system",
      },
      isTxActive ? session : undefined
    );

    // Record CASH portion in active or auto-opened cash drawer
    const cashPortion = effectiveAllocations
      .filter((a) => !a.method || a.method === "CASH")
      .reduce((s, a) => s + a.amount, 0);

    if (cashPortion > 0 && location) {
      const activeCashSession = await findOrAutoOpenCashSession(
        location._id.toString(),
        receivedBy || "system"
      );
      if (activeCashSession) {
        await recordCashMovement(
          {
            sessionId: activeCashSession._id.toString(),
            locationId: location._id.toString(),
            cashier: receivedBy || "system",
            type: "CASH_SALE",
            amount: cashPortion,
            direction: "IN",
            paymentMethod: "CASH",
            referenceType: "Payment",
            referenceId: createdPayments[0].paymentNumber,
            notes: `Khata payment recovery from ${customer.name}`,
          },
          isTxActive ? session : undefined
        );
      }
    }

    if (isTxActive) {
      await session.commitTransaction();
      session.endSession();
    }

    const updatedCustomer = await Customer.findById(customer._id);

    return NextResponse.json({
      success: true,
      message: `Payment of Rs. ${paymentAmount.toLocaleString()} recorded for ${customer.name}.`,
      data: {
        payment: createdPayments[0],
        payments: createdPayments,
        customer: updatedCustomer || customer,
        ledgerEntry,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process customer ledger payment." },
      { status: 500 }
    );
  }
}
