import { ClientSession } from "mongoose";
import { dbConnect } from "@/lib/db";
import { CashSession } from "@/models/CashSession";
import { Payment } from "@/models/Payment";
import { Location } from "@/models/Location";
import { CashMovement, CashMovementType } from "@/models/CashMovement";
import { Expense, ExpenseCategory } from "@/models/Expense";

export async function generateSessionNumber(session?: ClientSession): Promise<string> {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `SES-${dateStr}-`;

  const countQuery: any = CashSession.countDocuments({
    sessionNumber: new RegExp(`^${prefix}`),
  });
  if (session && countQuery && typeof countQuery.session === "function") {
    countQuery.session(session);
  }
  const count = typeof countQuery?.exec === "function" ? await countQuery.exec() : await countQuery;
  let nextSeq = (count || 0) + 1;

  if (count > 0) {
    let lastDoc: any = null;
    const rawQuery: any = CashSession.findOne({
      sessionNumber: new RegExp(`^${prefix}`),
    });
    if (rawQuery && typeof rawQuery.sort === "function") {
      const sortedQuery = rawQuery.sort({ sessionNumber: -1 });
      if (session && typeof sortedQuery.session === "function") {
        sortedQuery.session(session);
      }
      lastDoc = typeof sortedQuery.exec === "function" ? await sortedQuery.exec() : await sortedQuery;
    } else if (rawQuery) {
      lastDoc = await rawQuery;
    }

    if (lastDoc && lastDoc.sessionNumber) {
      const parts = lastDoc.sessionNumber.split("-");
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq) && lastSeq >= nextSeq) {
        nextSeq = lastSeq + 1;
      }
    }
  }

  return `${prefix}${String(nextSeq).padStart(3, "0")}`;
}

export async function generateCashMovementNumber(session?: ClientSession): Promise<string> {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `CSM-${dateStr}-`;

  const countQuery: any = CashMovement.countDocuments({
    movementNumber: new RegExp(`^${prefix}`),
  });
  if (session && countQuery && typeof countQuery.session === "function") {
    countQuery.session(session);
  }
  const count = typeof countQuery?.exec === "function" ? await countQuery.exec() : await countQuery;
  let nextSeq = (count || 0) + 1;

  if (count > 0) {
    let lastDoc: any = null;
    const rawQuery: any = CashMovement.findOne({
      movementNumber: new RegExp(`^${prefix}`),
    });
    if (rawQuery && typeof rawQuery.sort === "function") {
      const sortedQuery = rawQuery.sort({ movementNumber: -1 });
      if (session && typeof sortedQuery.session === "function") {
        sortedQuery.session(session);
      }
      lastDoc = typeof sortedQuery.exec === "function" ? await sortedQuery.exec() : await sortedQuery;
    } else if (rawQuery) {
      lastDoc = await rawQuery;
    }

    if (lastDoc && lastDoc.movementNumber) {
      const parts = lastDoc.movementNumber.split("-");
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq) && lastSeq >= nextSeq) {
        nextSeq = lastSeq + 1;
      }
    }
  }

  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}

export interface RecordCashMovementInput {
  sessionId: string;
  locationId: string;
  cashier: string;
  type: CashMovementType;
  amount: number;
  direction: "IN" | "OUT";
  paymentMethod?: string;
  referenceType?: "Sale" | "Payment" | "Expense" | "Return" | "TradeIn" | "Withdrawal" | "Adjustment";
  referenceId?: string;
  notes?: string;
}

export async function findOrAutoOpenCashSession(
  locationId: string,
  actorUsername: string
) {
  let session =
    (await CashSession.findOne({ location: locationId, cashier: actorUsername, status: "OPEN" })) ||
    (await CashSession.findOne({ location: locationId, status: "OPEN" })) ||
    (await CashSession.findOne({ status: "OPEN" }));

  if (!session && locationId) {
    const lastClosed = await CashSession.findOne({ location: locationId, status: "CLOSED" })
      .select("actualCash expectedCash actualOnline expectedOnline")
      .sort({ closedAt: -1 })
      .lean();
    const carryCash = Number((lastClosed as any)?.actualCash ?? (lastClosed as any)?.expectedCash ?? 0);
    const carryOnline = Number((lastClosed as any)?.actualOnline ?? (lastClosed as any)?.expectedOnline ?? 0);
    const opened = await openCashSession({
      locationId,
      cashierUsername: actorUsername,
      openingCash: carryCash,
      notes: "Auto-opened from Transaction",
    });
    session = opened.session;
    session.openingOnline = carryOnline;
    session.expectedOnline = carryOnline;
    await session.save();
  }

  return session;
}

export interface RecordDiaryOutflowInput {
  locationId?: string;
  actorUsername: string;
  entryType: "EXPENSE" | "CASH_PURCHASING";
  category: ExpenseCategory;
  cashAmount?: number;
  onlineAmount?: number;
  reason: string;
  recipient?: string;
  notes?: string;
  dedupeTag?: string;
}

/**
 * Records a shop Cash (Galla) / Online Bank outflow into Expense Diary,
 * CashSession drawer totals, and CashMovement (for physical cash).
 */
export async function recordDiaryOutflowEntry(input: RecordDiaryOutflowInput) {
  await dbConnect();
  const cPart = Math.max(0, Number(input.cashAmount || 0));
  const oPart = Math.max(0, Number(input.onlineAmount || 0));
  const totalAmt = cPart + oPart;
  if (totalAmt <= 0) return null;

  if (input.dedupeTag) {
    const existing = await Expense.findOne({
      notes: { $regex: input.dedupeTag.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&") },
      status: "APPROVED",
    }).lean();
    if (existing) return existing;
  }

  let location: any = input.locationId
    ? await Location.findById(input.locationId).lean()
    : null;
  if (!location) {
    location = await Location.findOne({ active: true }).lean();
  }
  if (!location) {
    throw new Error("Active branch location is required to record cash/online diary entry.");
  }

  const cashSession = await findOrAutoOpenCashSession(
    location._id.toString(),
    input.actorUsername || "system"
  );
  if (!cashSession) {
    throw new Error("Unable to resolve or open Cash Diary session.");
  }

  const todayPktIso = new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
  const dateStr = todayPktIso.replace(/-/g, "");
  const prefix = `PCV-${dateStr}-`;
  const lastExp: any = await Expense.findOne({ expenseNumber: new RegExp(`^${prefix}`) })
    .select("expenseNumber")
    .sort({ expenseNumber: -1 })
    .lean();
  let nextSeq = 1;
  if (lastExp?.expenseNumber) {
    const parts = lastExp.expenseNumber.split("-");
    const parsed = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(parsed)) nextSeq = parsed + 1;
  }
  const expenseNumber = `${prefix}${String(nextSeq).padStart(4, "0")}`;

  const paymentMethod =
    cPart > 0 && oPart > 0 ? "SPLIT" : oPart > 0 ? "ONLINE" : "CASH";
  const finalNotes = [input.notes?.trim(), input.dedupeTag].filter(Boolean).join(" • ");

  const expense = new Expense({
    expenseNumber,
    location: location._id,
    locationName: location.name,
    shopTag: location.name || "P.G.S",
    entryType: input.entryType,
    category: input.category,
    amount: totalAmt,
    paymentMethod,
    cashAmount: cPart,
    onlineAmount: oPart,
    recipient: input.recipient || input.reason,
    reason: input.reason,
    notes: finalNotes || input.reason,
    createdBy: input.actorUsername || "system",
    status: "APPROVED",
  });

  if (input.entryType === "CASH_PURCHASING") {
    cashSession.totalPurchasingOut = (cashSession.totalPurchasingOut || 0) + totalAmt;
  } else {
    cashSession.totalExpenses = (cashSession.totalExpenses || 0) + totalAmt;
  }
  cashSession.expectedCash = (cashSession.expectedCash || 0) - cPart;
  cashSession.expectedOnline = (cashSession.expectedOnline || 0) - oPart;

  await Promise.all([
    expense.save(),
    cashSession.save(),
    cPart > 0
      ? recordCashMovement({
          sessionId: cashSession._id.toString(),
          locationId: location._id.toString(),
          cashier: input.actorUsername || "system",
          type: input.entryType === "CASH_PURCHASING" ? "CUSTOMER_BUYBACK" : "PETTY_CASH",
          amount: cPart,
          direction: "OUT",
          paymentMethod: "CASH",
          referenceType: "Expense",
          referenceId: expenseNumber,
          notes: input.reason,
        })
      : Promise.resolve(),
  ]);

  return expense;
}

/**
 * Records an explicit physical cash drawer movement (Cash in or Cash out).
 */
export async function recordCashMovement(
  input: RecordCashMovementInput,
  session?: ClientSession
) {
  const amount = Math.abs(Number(input.amount || 0));
  if (amount <= 0) return null;

  const movementNumber = await generateCashMovementNumber(session);

  const movement = new CashMovement({
    movementNumber,
    cashSession: input.sessionId,
    location: input.locationId,
    cashier: input.cashier,
    type: input.type,
    amount,
    direction: input.direction,
    paymentMethod: input.paymentMethod || "CASH",
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    notes: input.notes,
  });

  if (session) {
    await movement.save({ session });
  } else {
    await movement.save();
  }

  return movement;
}

export interface OpenCashSessionInput {
  locationId: string;
  cashierUsername: string;
  openingCash: number;
  notes?: string;
}

export async function openCashSession(input: OpenCashSessionInput) {
  await dbConnect();

  const location = await Location.findById(input.locationId);
  if (!location || !location.active) {
    throw new Error("Invalid or inactive location specified.");
  }

  const existingSession = await CashSession.findOne({
    location: location._id,
    cashier: input.cashierUsername,
    status: "OPEN",
  });

  if (existingSession) {
    return { isNew: false, session: existingSession };
  }

  const sessionNumber = await generateSessionNumber();
  const openingAmount = Number(input.openingCash || 0);

  const session = new CashSession({
    sessionNumber,
    location: location._id,
    locationName: location.name,
    cashier: input.cashierUsername,
    openingCash: openingAmount,
    expectedCash: openingAmount,
    totalCashSales: 0,
    totalCardSales: 0,
    totalOnlineSales: 0,
    totalRefunds: 0,
    totalExpenses: 0,
    status: "OPEN",
    notes: input.notes?.trim(),
    openedAt: new Date(),
  });

  await session.save();

  // Log OPENING_CASH movement
  if (openingAmount > 0) {
    await recordCashMovement({
      sessionId: session._id.toString(),
      locationId: location._id.toString(),
      cashier: input.cashierUsername,
      type: "OPENING_CASH",
      amount: openingAmount,
      direction: "IN",
      notes: "Opening drawer cash balance",
    });
  }

  return { isNew: true, session };
}

export interface CloseCashSessionInput {
  sessionId: string;
  cashierUsername: string;
  actualCashCount: number;
  varianceReason?: string;
  notes?: string;
}

export async function closeCashSession(input: CloseCashSessionInput) {
  await dbConnect();

  const session = await CashSession.findById(input.sessionId);
  if (!session) {
    throw new Error("Cash register session not found.");
  }

  if (session.status === "CLOSED") {
    return session;
  }

  // Query all explicit physical Cash Movements for this session
  const movements = await CashMovement.find({ cashSession: session._id });

  let expectedCash = 0;
  let totalCashSales = 0;
  let totalExpenses = 0;
  let totalRefunds = 0;

  for (const m of movements) {
    const isCash = !m.paymentMethod || m.paymentMethod === "CASH";
    if (m.direction === "IN") {
      if (isCash) {
        expectedCash += m.amount;
        if (m.type === "CASH_SALE" || m.type === "DEBT_COLLECTION") {
          totalCashSales += m.amount;
        }
      }
    } else if (m.direction === "OUT") {
      if (isCash) {
        expectedCash -= m.amount;
      }
      if (m.type === "PETTY_CASH") {
        totalExpenses += m.amount;
      } else if (m.type === "CASH_REFUND") {
        totalRefunds += m.amount;
      }
    }
  }

  // Calculate digital payments (Card, Bank Transfer, Online) strictly for reporting within session window
  const digitalPayments = await Payment.find({
    location: session.location,
    receivedBy: session.cashier,
    createdAt: { $gte: session.openedAt, $lte: new Date() },
    status: "PAID",
  });

  let cardTotal = 0;
  let onlineTotal = 0;

  for (const p of digitalPayments) {
    if (p.paymentMethod === "CARD") {
      cardTotal += p.amount;
    } else if (p.paymentMethod === "BANK_TRANSFER" || p.paymentMethod === "ONLINE_GATEWAY") {
      onlineTotal += p.amount;
    }
  }

  const variance = input.actualCashCount - expectedCash;

  if (Math.abs(variance) > 0.01 && !input.varianceReason?.trim()) {
    throw new Error(
      `Variance of Rs. ${variance.toLocaleString()} detected. A variance explanation reason is required.`
    );
  }

  session.totalCashSales = totalCashSales;
  session.totalCardSales = cardTotal;
  session.totalOnlineSales = onlineTotal;
  session.totalExpenses = totalExpenses;
  session.totalRefunds = totalRefunds;
  session.expectedCash = expectedCash;
  session.actualCash = input.actualCashCount;
  session.variance = variance;
  session.varianceReason = input.varianceReason?.trim();
  if (input.notes) session.notes = input.notes.trim();
  session.status = "CLOSED";
  session.closedAt = new Date();

  await session.save();
  return session;
}
