import { Customer } from "@/models/Customer";
import { Types, ClientSession } from "mongoose";

export interface ResolveCustomerInput {
  customerId?: string | Types.ObjectId;
  customerName?: string;
  customerPhone?: string;
}

/**
 * Resolves an existing Customer document by ObjectId or phone number.
 * If no existing customer is found but name & phone are provided,
 * automatically creates a new active Customer document so that
 * Customer Ledger and financial history are 100% tracked.
 */
export async function resolveOrCreateCustomer(
  input: ResolveCustomerInput,
  session?: ClientSession
): Promise<Types.ObjectId | undefined> {
  // 1. If explicit customerId provided and valid
  if (input.customerId && Types.ObjectId.isValid(input.customerId)) {
    const custQuery = Customer.findById(input.customerId);
    if (session) custQuery.session(session);
    const existing = await custQuery.exec();
    if (existing) return existing._id;
  }

  const cleanPhone = input.customerPhone ? input.customerPhone.trim() : "";
  const cleanName = input.customerName ? input.customerName.trim() : "";

  // 2. If valid phone is provided, lookup by phone
  if (cleanPhone && cleanPhone !== "N/A" && cleanPhone !== "0000000000") {
    let query = Customer.findOne({ phone: cleanPhone, active: true });
    if (session) query = query.session(session);
    let cust = await query.exec();

    if (cust) {
      // Update name if a real customer name was provided and doesn't match default
      if (cleanName && cleanName !== "Walk-in Customer" && cust.name !== cleanName) {
        cust.name = cleanName;
        if (session) await cust.save({ session });
        else await cust.save();
      }
      return cust._id;
    }

    // Auto-create new customer document by phone
    const newCust = new Customer({
      name: cleanName && cleanName !== "Walk-in Customer" ? cleanName : `Customer (${cleanPhone})`,
      phone: cleanPhone,
      advanceBalance: 0,
      outstandingBalance: 0,
      storeCredit: 0,
      active: true,
    });

    if (session) await newCust.save({ session });
    else await newCust.save();
    return newCust._id;
  }

  // 3. Fallback by Name if name is specific (even if phone is missing)
  if (cleanName && cleanName !== "Walk-in Customer") {
    let query = Customer.findOne({ name: cleanName, active: true });
    if (session) query = query.session(session);
    let cust = await query.exec();
    if (cust) return cust._id;

    // Auto-create customer by name with unique fallback phone
    const fallbackPhone = `N/A-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
    const newCust = new Customer({
      name: cleanName,
      phone: fallbackPhone,
      advanceBalance: 0,
      outstandingBalance: 0,
      storeCredit: 0,
      active: true,
    });

    if (session) await newCust.save({ session });
    else await newCust.save();
    return newCust._id;
  }

  return undefined;
}
