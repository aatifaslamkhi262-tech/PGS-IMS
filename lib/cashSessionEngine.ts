import { ClientSession } from "mongoose";
import { dbConnect } from "@/lib/db";
import { CashSession } from "@/models/CashSession";
import { Payment } from "@/models/Payment";
import { Location } from "@/models/Location";
import { CashMovement, CashMovementType } from "@/models/CashMovement";

export async function generateSessionNumber(): Promise<string> {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const count = await CashSession.countDocuments({
    sessionNumber: new RegExp(`^SES-${dateStr}`),
  });
  return `SES-${dateStr}-${String(count + 1).padStart(3, "0")}`;
}

export async function generateCashMovementNumber(): Promise<string> {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const count = await CashMovement.countDocuments({
    movementNumber: new RegExp(`^CSM-${dateStr}`),
  });
  return `CSM-${dateStr}-${String(count + 1).padStart(4, "0")}`;
}

export interface RecordCashMovementInput {
  sessionId: string;
  locationId: string;
  cashier: string;
  type: CashMovementType;
  amount: number;
  direction: "IN" | "OUT";
  referenceType?: "Sale" | "Payment" | "Expense" | "Return" | "TradeIn" | "Withdrawal" | "Adjustment";
  referenceId?: string;
  notes?: string;
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

  const movementNumber = await generateCashMovementNumber();

  const movement = new CashMovement({
    movementNumber,
    cashSession: input.sessionId,
    location: input.locationId,
    cashier: input.cashier,
    type: input.type,
    amount,
    direction: input.direction,
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
  const openingAmount = Math.max(0, Number(input.openingCash || 0));

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
    if (m.direction === "IN") {
      expectedCash += m.amount;
      if (m.type === "CASH_SALE" || m.type === "DEBT_COLLECTION") {
        totalCashSales += m.amount;
      }
    } else if (m.direction === "OUT") {
      expectedCash -= m.amount;
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
