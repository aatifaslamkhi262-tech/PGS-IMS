import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/lib/db";
import { Customer } from "@/models/Customer";
import { Payment } from "@/models/Payment";
import { Location } from "@/models/Location";
import { CustomerLedger } from "@/models/CustomerLedger";
import { CashSession } from "@/models/CashSession";
import { recordCashMovement } from "@/lib/cashSessionEngine";
import { recordCustomerLedgerEntry } from "@/lib/customerLedgerEngine";

export async function POST(request: Request) {
  try {
    await dbConnect();
    const body = await request.json();
    const { customerId, locationId, amount, paymentMethod, receivedBy, notes, actionType } = body;

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return NextResponse.json({ success: false, error: "Customer not found." }, { status: 404 });
    }

    const paymentAmount = Number(amount);
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
      const count = await CustomerLedger.countDocuments();
      const adjustmentNumber = `ADJ-${dateStr}-${String(count + 1).padStart(3, "0")}`;

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
    const location = locationId ? await Location.findById(locationId) : await Location.findOne();

    const count = await Payment.countDocuments();
    const paymentNumber = `PAY-${dateStr}-${String(count + 1).padStart(3, "0")}`;

    const payment = new Payment({
      paymentNumber,
      location: location?._id,
      locationName: location?.name || "Counter",
      customer: customer._id,
      customerName: customer.name,
      paymentMethod: paymentMethod || "CASH",
      amount: paymentAmount,
      receivedBy: receivedBy || "system",
      notes: notes || `Customer Khata Settlement for ${customer.name}`,
      status: "PAID",
    });

    if (isTxActive) {
      await payment.save({ session });
    } else {
      await payment.save();
    }

    // Single source of truth for Customer Ledger entry & balance updates
    const ledgerEntry = await recordCustomerLedgerEntry(
      {
        customerId: customer._id.toString(),
        type: "PAYMENT",
        amount: paymentAmount,
        referenceType: "Payment",
        referenceId: payment.paymentNumber,
        notes: notes || `Customer Khata Settlement for ${customer.name}`,
        createdBy: receivedBy || "system",
      },
      isTxActive ? session : undefined
    );

    // If CASH payment, record cash movement in active cash drawer
    if ((!paymentMethod || paymentMethod === "CASH") && location) {
      const activeCashSession = await CashSession.findOne({
        location: location._id,
        status: "OPEN",
      });
      if (activeCashSession) {
        await recordCashMovement(
          {
            sessionId: activeCashSession._id.toString(),
            locationId: location._id.toString(),
            cashier: receivedBy || "system",
            type: "CASH_SALE",
            amount: paymentAmount,
            direction: "IN",
            referenceType: "Payment",
            referenceId: payment.paymentNumber,
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
        payment,
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
