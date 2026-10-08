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

export async function generateLedgerEntryNumber(
  session?: ClientSession
): Promise<string> {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `CLG-${dateStr}-`;

  const countQuery: any = CustomerLedger.countDocuments({
    entryNumber: new RegExp(`^${prefix}`),
  });
  if (session && countQuery && typeof countQuery.session === "function") {
    countQuery.session(session);
  }
  const count = typeof countQuery?.exec === "function" ? await countQuery.exec() : await countQuery;
  let nextSeq = (count || 0) + 1;

  if (count > 0) {
    let lastDoc: any = null;
    const rawQuery: any = CustomerLedger.findOne({
      entryNumber: new RegExp(`^${prefix}`),
    });
    if (rawQuery && typeof rawQuery.sort === "function") {
      const sortedQuery = rawQuery.sort({ entryNumber: -1 });
      if (session && typeof sortedQuery.session === "function") {
        sortedQuery.session(session);
      }
      lastDoc = typeof sortedQuery.exec === "function" ? await sortedQuery.exec() : await sortedQuery;
    } else if (rawQuery) {
      lastDoc = await rawQuery;
    }

    if (lastDoc && lastDoc.entryNumber) {
      const parts = lastDoc.entryNumber.split("-");
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq) && lastSeq >= nextSeq) {
        nextSeq = lastSeq + 1;
      }
    }
  }

  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
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
      if (newAdvance > 0) {
        if (newAdvance >= amount) {
          newAdvance -= amount;
        } else {
          const remaining = amount - newAdvance;
          newAdvance = 0;
          newOutstanding += remaining;
        }
      } else {
        newOutstanding += amount;
      }
      break;

    case "PAYMENT":
      credit = amount;
      if (amount > newOutstanding) {
        const excess = amount - newOutstanding;
        newOutstanding = 0;
        newAdvance += excess;
      } else {
        newOutstanding -= amount;
      }
      break;

    case "RETURN_CREDIT":
      credit = amount;
      if (amount > newOutstanding) {
        const excess = amount - newOutstanding;
        newOutstanding = 0;
        newAdvance += excess;
      } else {
        newOutstanding -= amount;
      }
      break;

    case "ADVANCE_DEPOSIT":
      credit = amount;
      if (newOutstanding > 0) {
        if (newOutstanding >= amount) {
          newOutstanding -= amount;
        } else {
          const excess = amount - newOutstanding;
          newOutstanding = 0;
          newAdvance += excess;
        }
      } else {
        newAdvance += amount;
      }
      break;

    case "ADVANCE_REFUND":
      debit = amount;
      if (newAdvance >= amount) {
        newAdvance -= amount;
      } else {
        const remaining = amount - newAdvance;
        newAdvance = 0;
        newOutstanding = Math.max(0, newOutstanding + remaining);
      }
      break;

    case "DEBT_ADJUSTMENT":
      debit = amount;
      newOutstanding = Math.max(0, newOutstanding + amount);
      break;
  }

  const entryNumber = await generateLedgerEntryNumber(session);

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
