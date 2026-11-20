import { ClientSession } from "mongoose";
import { dbConnect } from "@/lib/db";
import { Payment, PaymentMethod, PaymentStatus } from "@/models/Payment";
import { Invoice } from "@/models/Invoice";
import { Sale } from "@/models/Sale";
import { Customer } from "@/models/Customer";
import { generatePaymentNumber } from "@/lib/salesEngine";
import { recordCustomerLedgerEntry } from "@/lib/customerLedgerEngine";

export interface RecordPaymentInput {
  saleId?: string;
  invoiceId?: string;
  customerId?: string;
  locationId: string;
  paymentMethod: PaymentMethod;
  amount: number;
  paymentNumber?: string;
  referenceNumber?: string;
  notes?: string;
  receivedBy: string;
}

export async function recordPayment(input: RecordPaymentInput, session?: ClientSession) {
  await dbConnect();

  if (input.amount <= 0) {
    throw new Error("Payment amount must be greater than 0.");
  }

  const paymentNumber = input.paymentNumber || (await generatePaymentNumber(session));

  const payment = new Payment({
    paymentNumber,
    sale: input.saleId || undefined,
    invoice: input.invoiceId || undefined,
    customer: input.customerId || undefined,
    location: input.locationId,
    paymentMethod: input.paymentMethod,
    amount: input.amount,
    referenceNumber: input.referenceNumber?.trim(),
    notes: input.notes?.trim(),
    receivedBy: input.receivedBy,
    status: "PAID",
  });

  if (session) {
    await payment.save({ session });
  } else {
    await payment.save();
  }

  // Single source of truth for Customer Ledger entry & advance balance updates
  if (input.paymentMethod === "CUSTOMER_ADVANCE" && input.customerId) {
    await recordCustomerLedgerEntry(
      {
        customerId: input.customerId,
        type: "ADVANCE_DEPOSIT",
        amount: input.amount,
        referenceType: "Payment",
        referenceId: payment.paymentNumber,
        notes: input.notes?.trim() || `Customer Advance Payment (${payment.paymentNumber})`,
        createdBy: input.receivedBy,
      },
      session
    );
  }

  return payment;
}
