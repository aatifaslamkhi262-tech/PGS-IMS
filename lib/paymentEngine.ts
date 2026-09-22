import { dbConnect } from "@/lib/db";
import { Payment, PaymentMethod, PaymentStatus } from "@/models/Payment";
import { Invoice } from "@/models/Invoice";
import { Sale } from "@/models/Sale";
import { Customer } from "@/models/Customer";
import { generatePaymentNumber } from "@/lib/salesEngine";

export interface RecordPaymentInput {
  saleId?: string;
  invoiceId?: string;
  customerId?: string;
  locationId: string;
  paymentMethod: PaymentMethod;
  amount: number;
  referenceNumber?: string;
  notes?: string;
  receivedBy: string;
}

export async function recordPayment(input: RecordPaymentInput) {
  await dbConnect();

  if (input.amount <= 0) {
    throw new Error("Payment amount must be greater than 0.");
  }

  const paymentNumber = await generatePaymentNumber();

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

  await payment.save();

  // If customer advance payment, increase customer advance balance
  if (input.paymentMethod === "CUSTOMER_ADVANCE" && input.customerId) {
    const customer = await Customer.findById(input.customerId);
    if (customer) {
      customer.advanceBalance += input.amount;
      await customer.save();
    }
  }

  return payment;
}
