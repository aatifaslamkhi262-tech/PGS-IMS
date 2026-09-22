import { Types, ClientSession } from "mongoose";
import { Customer } from "@/models/Customer";
import {
  CustomerLedger,
  CustomerLedgerType,
  CustomerLedgerReferenceType,
  ICustomerLedger,
} from "@/models/CustomerLedger";

export interface RecordCustomerLedgerInput {
  customerId: string | Types.ObjectId;
  type: CustomerLedgerType;
  amount: number;
  referenceType: CustomerLedgerReferenceType;
  referenceId: string;
  notes?: string;
  createdBy: string;
}

export async function generateLedgerEntryNumber(): Promise<string> {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const count = await CustomerLedger.countDocuments({
    entryNumber: new RegExp(`^CLG-${dateStr}`),
  });
  return `CLG-${dateStr}-${String(count + 1).padStart(4, "0")}`;
}

/**
 * Single source of truth for recording customer financial ledger entries.
 * Updates Customer numeric balance projections atomically.
 */
export async function recordCustomerLedgerEntry(
  input: RecordCustomerLedgerInput,
  session?: ClientSession
): Promise<ICustomerLedger> {
  const amount = Math.abs(Number(input.amount || 0));
  if (amount <= 0) {
    throw new Error("Ledger entry amount must be greater than 0.");
  }

  // Read current Customer document
  const custQuery = Customer.findById(input.customerId);
  if (session) custQuery.session(session);
  const customer = await custQuery.exec();

  if (!customer) {
    throw new Error("Customer record not found for ledger entry.");
  }

  let debit = 0;
  let credit = 0;
  let newOutstanding = customer.outstandingBalance || 0;
  let newAdvance = customer.advanceBalance || 0;

  switch (input.type) {
    case "INVOICE":
      debit = amount;
      newOutstanding += amount;
      break;

    case "PAYMENT":
      credit = amount;
      newOutstanding = Math.max(0, newOutstanding - amount);
      break;

    case "RETURN_CREDIT":
      credit = amount;
      newOutstanding = Math.max(0, newOutstanding - amount);
      break;

    case "ADVANCE_DEPOSIT":
      credit = amount;
      newAdvance += amount;
      break;

    case "DEBT_ADJUSTMENT":
      debit = amount;
      newOutstanding = Math.max(0, newOutstanding + amount);
      break;
  }

  const entryNumber = await generateLedgerEntryNumber();

  const ledgerEntry = new CustomerLedger({
    entryNumber,
    customer: customer._id,
    type: input.type,
    debit,
    credit,
    amount,
    runningOutstanding: newOutstanding,
    runningAdvance: newAdvance,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    notes: input.notes?.trim(),
    createdBy: input.createdBy,
  });

  if (session) {
    await ledgerEntry.save({ session });
  } else {
    await ledgerEntry.save();
  }

  // Update Customer projection fields
  customer.outstandingBalance = newOutstanding;
  customer.advanceBalance = newAdvance;

  if (session) {
    await customer.save({ session });
  } else {
    await customer.save();
  }

  return ledgerEntry;
}
