import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/lib/db";
import { Customer } from "@/models/Customer";
import { Payment } from "@/models/Payment";
import { Location } from "@/models/Location";
import { recordCustomerLedgerEntry } from "@/lib/customerLedgerEngine";

export async function POST(request: Request) {
  try {
    await dbConnect();
    const body = await request.json();
    const { customerId, locationId, amount, paymentMethod, receivedBy, notes } = body;

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return NextResponse.json({ success: false, error: "Customer not found." }, { status: 404 });
    }

    const location = await Location.findById(locationId);
    if (!location) {
      return NextResponse.json({ success: false, error: "Location not found." }, { status: 400 });
    }

    const paymentAmount = Number(amount);
    if (!paymentAmount || paymentAmount <= 0) {
      return NextResponse.json({ success: false, error: "Payment amount must be greater than 0." }, { status: 400 });
    }

    const session = await mongoose.startSession();
    try {
      session.startTransaction();
    } catch {
      session.endSession();
    }
    const isTxActive = session.inTransaction();

    // Generate Payment Transaction document
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const count = await Payment.countDocuments();
    const paymentNumber = `PAY-${dateStr}-${String(count + 1).padStart(3, "0")}`;

    const payment = new Payment({
      paymentNumber,
      location: location._id,
      locationName: location.name,
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

    if (isTxActive) {
      await session.commitTransaction();
      session.endSession();
    }

    const updatedCustomer = await Customer.findById(customer._id);

    return NextResponse.json({
      success: true,
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
