import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Expense } from "@/models/Expense";
import { CashSession } from "@/models/CashSession";
import { CashMovement } from "@/models/CashMovement";
import { Location } from "@/models/Location";
import { recordCashMovement, openCashSession } from "@/lib/cashSessionEngine";
import { lockIdempotencyKey, completeIdempotencyKey, failIdempotencyKey } from "@/lib/idempotencyEngine";
import { verifyRole } from "@/lib/auth/rbac";

export async function POST(request: Request) {
  let idempotencyKeyHeader = "";
  try {
    await dbConnect();
    const body = await request.json();
    idempotencyKeyHeader = request.headers.get("x-idempotency-key") || body.idempotencyKey || "";

    if (idempotencyKeyHeader) {
      const lockRes = await lockIdempotencyKey(idempotencyKeyHeader, body, "/api/cash-sessions/expense");
      if (lockRes.isDuplicate) {
        return NextResponse.json(
          lockRes.responseBody || { success: false, error: lockRes.error },
          { status: lockRes.statusCode || 409 }
        );
      }
    }

    const {
      sessionId,
      locationId,
      shopTag,
      entryType,
      paymentMethod,
      category,
      amount,
      cashAmount,
      onlineAmount,
      recipient,
      reason,
      description,
      attachmentUrl,
      date: entryDateStr,
      createdBy,
    } = body;

    const chosenMethod: "CASH" | "ONLINE" | "BANK_TRANSFER" | "CARD" | "SPLIT" =
      paymentMethod || "CASH";

    let cPart = 0;
    let oPart = 0;
    let expenseAmount = Number(amount || 0);

    if (chosenMethod === "SPLIT") {
      cPart = Math.max(0, Number(cashAmount || 0));
      oPart = Math.max(0, Number(onlineAmount || 0));
      expenseAmount = cPart + oPart;
    } else if (chosenMethod === "ONLINE" || chosenMethod === "BANK_TRANSFER" || chosenMethod === "CARD") {
      cPart = 0;
      oPart = Math.max(0, Number(amount || 0));
      expenseAmount = oPart;
    } else {
      cPart = Math.max(0, Number(amount || 0));
      oPart = 0;
      expenseAmount = cPart;
    }

    if (!expenseAmount || expenseAmount <= 0) {
      if (idempotencyKeyHeader) await failIdempotencyKey(idempotencyKeyHeader);
      return NextResponse.json({ success: false, error: "Amount must be greater than 0." }, { status: 400 });
    }

    const todayPktIso = new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
    const targetDateIso = entryDateStr && /^\d{4}-\d{2}-\d{2}$/.test(entryDateStr) ? entryDateStr : todayPktIso;
    const dateStr = targetDateIso.replace(/-/g, "");
    const prefix = `PCV-${dateStr}-`;

    // Run auth, location, session, and last voucher sequence lookup in ONE parallel roundtrip
    const [auth, resolvedLocation, resolvedSession, lastExp] = await Promise.all([
      verifyRole(["Admin", "Warehouse", "Accountant", "Branch", "Salesman"]).catch(() => ({
        authorized: false,
        user: null,
      })),
      locationId && locationId !== "ALL"
        ? Location.findById(locationId).lean()
        : Location.findOne({ active: true }).lean(),
      sessionId
        ? CashSession.findById(sessionId)
        : locationId && locationId !== "ALL"
        ? CashSession.findOne({ location: locationId, status: "OPEN" })
        : CashSession.findOne({ status: "OPEN" }),
      Expense.findOne({ expenseNumber: new RegExp(`^${prefix}`) })
        .select("expenseNumber")
        .sort({ expenseNumber: -1 })
        .lean(),
    ]);

    const actorUsername = createdBy || (auth as any).user?.username || "staff";

    let location: any = resolvedLocation;
    if (!location && resolvedSession) {
      location = await Location.findById(resolvedSession.location).lean();
    }
    if (!location) {
      if (idempotencyKeyHeader) await failIdempotencyKey(idempotencyKeyHeader);
      return NextResponse.json({ success: false, error: "Location not found." }, { status: 400 });
    }

    let session = resolvedSession;
    if (!session) {
      const lastClosed = await CashSession.findOne({ location: location._id, status: "CLOSED" })
        .select("actualCash expectedCash actualOnline expectedOnline")
        .sort({ closedAt: -1 })
        .lean();
      const carryForwardCash = Number((lastClosed as any)?.actualCash ?? (lastClosed as any)?.expectedCash ?? 0);
      const carryForwardOnline = Number((lastClosed as any)?.actualOnline ?? (lastClosed as any)?.expectedOnline ?? 0);
      const opened = await openCashSession({
        locationId: location._id.toString(),
        cashierUsername: actorUsername,
        openingCash: carryForwardCash,
        notes: "Auto-opened from Daily Petty Cash Diary",
      });
      session = opened.session;
      session.openingOnline = carryForwardOnline;
      session.expectedOnline = carryForwardOnline;
      await session.save();
    }

    const actualEntryType: "EXPENSE" | "ATIF_WITHDRAW" | "ATIF_DEPOSIT" | "CASH_PURCHASING" =
      entryType || "EXPENSE";
    const isInflow = actualEntryType === "ATIF_DEPOSIT";

    // Note: Negative Cash/Online drawer balances are allowed; do not block against stale session.expectedCash
    // (POS/Repair/Rental/Khata inflows live in Payment docs and aggregate dynamically in loadDailyDiaryData).

    let nextSeq = 1;
    if (lastExp && (lastExp as any).expenseNumber) {
      const parts = (lastExp as any).expenseNumber.split("-");
      const parsed = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(parsed)) nextSeq = parsed + 1;
    }
    const expenseNumber = `${prefix}${String(nextSeq).padStart(4, "0")}`;

    const cleanDesc = (description || reason || recipient || "").trim();
    const resolvedCategory =
      category ||
      (actualEntryType === "ATIF_WITHDRAW"
        ? "Atif Withdraw"
        : actualEntryType === "ATIF_DEPOSIT"
        ? "Atif Deposit"
        : actualEntryType === "CASH_PURCHASING"
        ? "Purchasing"
        : "Other");

    const notes = cleanDesc || `${resolvedCategory} (${shopTag || location.name})`;

    const customCreatedAt =
      targetDateIso !== todayPktIso
        ? new Date(`${targetDateIso}T12:00:00+05:00`)
        : new Date();

    const expense = new Expense({
      expenseNumber,
      location: location._id,
      locationName: location.name,
      shopTag: shopTag || location.name || "P.G.S",
      entryType: actualEntryType,
      category: resolvedCategory,
      amount: expenseAmount,
      paymentMethod: chosenMethod,
      cashAmount: cPart,
      onlineAmount: oPart,
      recipient: recipient || cleanDesc,
      reason: cleanDesc || resolvedCategory,
      attachmentUrl: attachmentUrl || undefined,
      notes,
      createdBy: actorUsername,
      status: "APPROVED",
      createdAt: customCreatedAt,
    });

    if (isInflow) {
      session.expectedCash = (session.expectedCash || 0) + cPart;
      session.expectedOnline = (session.expectedOnline || 0) + oPart;
      session.totalAtifDeposit = (session.totalAtifDeposit || 0) + expenseAmount;
    } else {
      if (actualEntryType === "EXPENSE") {
        session.totalExpenses = (session.totalExpenses || 0) + expenseAmount;
      } else if (actualEntryType === "ATIF_WITHDRAW") {
        session.totalAtifWithdraw = (session.totalAtifWithdraw || 0) + expenseAmount;
      } else if (actualEntryType === "CASH_PURCHASING") {
        session.totalPurchasingOut = (session.totalPurchasingOut || 0) + expenseAmount;
      }
      session.expectedCash = (session.expectedCash || 0) - cPart;
      session.expectedOnline = (session.expectedOnline || 0) - oPart;
    }

    // Save Expense, CashSession, and CashMovement in ONE parallel roundtrip
    await Promise.all([
      expense.save(),
      session.save(),
      cPart > 0
        ? recordCashMovement({
            sessionId: session._id.toString(),
            locationId: location._id.toString(),
            cashier: actorUsername,
            type:
              actualEntryType === "ATIF_WITHDRAW"
                ? "ATIF_WITHDRAW"
                : actualEntryType === "ATIF_DEPOSIT"
                ? "ATIF_DEPOSIT"
                : actualEntryType === "CASH_PURCHASING"
                ? "CUSTOMER_BUYBACK"
                : "PETTY_CASH",
            amount: cPart,
            direction: isInflow ? "IN" : "OUT",
            referenceType: "Expense",
            referenceId: expenseNumber,
            notes,
          })
        : Promise.resolve(),
    ]);

    const responseData = {
      success: true,
      data: {
        expense,
        session,
      },
    };

    if (idempotencyKeyHeader) {
      await completeIdempotencyKey(idempotencyKeyHeader, 200, responseData);
    }

    return NextResponse.json(responseData);
  } catch (error: any) {
    if (idempotencyKeyHeader) await failIdempotencyKey(idempotencyKeyHeader);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to record diary entry." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Accountant", "Warehouse"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "Entry ID is required." }, { status: 400 });
    }
    const exp: any = await Expense.findById(id);
    if (!exp) {
      return NextResponse.json({ success: false, error: "Diary entry not found." }, { status: 404 });
    }

    const totalAmt = Number(exp.amount || 0);
    const pMethod = exp.paymentMethod || "CASH";
    const cPart =
      pMethod === "SPLIT"
        ? Number(exp.cashAmount || 0)
        : pMethod === "ONLINE" || pMethod === "BANK_TRANSFER" || pMethod === "CARD"
        ? 0
        : totalAmt;
    const oPart =
      pMethod === "SPLIT"
        ? Number(exp.onlineAmount || 0)
        : pMethod === "ONLINE" || pMethod === "BANK_TRANSFER" || pMethod === "CARD"
        ? totalAmt
        : 0;
    const isInflow = exp.entryType === "ATIF_DEPOSIT" || exp.category === "Atif Deposit";

    // Remove associated CashMovement if present
    if (exp.expenseNumber) {
      await CashMovement.deleteMany({ referenceId: exp.expenseNumber });
    }

    // Reverse impact on active CashSession if open
    const session = await CashSession.findOne({ location: exp.location, status: "OPEN" });
    if (session) {
      if (isInflow) {
        session.expectedCash = (session.expectedCash || 0) - cPart;
        session.expectedOnline = (session.expectedOnline || 0) - oPart;
        session.totalAtifDeposit = Math.max(0, (session.totalAtifDeposit || 0) - totalAmt);
      } else {
        session.expectedCash = (session.expectedCash || 0) + cPart;
        session.expectedOnline = (session.expectedOnline || 0) + oPart;
        if (!exp.entryType || exp.entryType === "EXPENSE") {
          session.totalExpenses = Math.max(0, (session.totalExpenses || 0) - totalAmt);
        } else if (exp.entryType === "ATIF_WITHDRAW") {
          session.totalAtifWithdraw = Math.max(0, (session.totalAtifWithdraw || 0) - totalAmt);
        } else if (exp.entryType === "CASH_PURCHASING") {
          session.totalPurchasingOut = Math.max(0, (session.totalPurchasingOut || 0) - totalAmt);
        }
      }
      await session.save();
    }

    await Expense.findByIdAndDelete(id);
    return NextResponse.json({ success: true, message: "Diary entry removed and balance updated." });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Failed to delete entry." }, { status: 500 });
  }
}
