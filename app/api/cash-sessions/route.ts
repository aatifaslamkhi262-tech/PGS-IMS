import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { CashSession } from "@/models/CashSession";
import { CashMovement } from "@/models/CashMovement";
import { Expense } from "@/models/Expense";
import { Payment } from "@/models/Payment";
import { Sale } from "@/models/Sale";
import { Invoice } from "@/models/Invoice";
import { Location } from "@/models/Location";
import { openCashSession } from "@/lib/cashSessionEngine";
import { verifyRole } from "@/lib/auth/rbac";

async function loadDailyDiaryData(locationId: string, dateStr: string, statusFilter?: string | null) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const startDate = new Date(Date.UTC(year, month - 1, day - 1, 19, 0, 0, 0));
  const endDate = new Date(Date.UTC(year, month - 1, day, 18, 59, 59, 999));

  const query: any = {};
  if (locationId && locationId !== "ALL") query.location = locationId;
  if (statusFilter) query.status = statusFilter;

  const payQuery: any = {
    createdAt: { $gte: startDate, $lte: endDate },
    status: "PAID",
  };
  const refundedPayQuery: any = {
    createdAt: { $gte: startDate, $lte: endDate },
    status: "REFUNDED",
  };
  // Match COMPLETED sales by completedAt so Advance Bookings / Online Orders align with completion-day payments
  const saleQuery: any = {
    status: "COMPLETED",
    $or: [
      { completedAt: { $gte: startDate, $lte: endDate } },
      { completedAt: null, createdAt: { $gte: startDate, $lte: endDate } },
    ],
  };
  const expQuery: any = {
    createdAt: { $gte: startDate, $lte: endDate },
    status: { $in: ["APPROVED", "Approved"] },
  };
  const refundMoveQuery: any = {
    createdAt: { $gte: startDate, $lte: endDate },
    type: "CASH_REFUND",
  };

  if (locationId && locationId !== "ALL") {
    payQuery.location = locationId;
    refundedPayQuery.location = locationId;
    saleQuery.location = locationId;
    expQuery.location = locationId;
    refundMoveQuery.location = locationId;
  }

  const [sessions, paymentsToday, refundedPaymentsToday, salesToday, expensesToday, refundMovementsToday] =
    await Promise.all([
      CashSession.find(query)
        .select(
          "sessionNumber location locationName cashier openingCash expectedCash actualCash openingOnline expectedOnline actualOnline variance varianceReason status openedAt closedAt"
        )
        .sort({ openedAt: -1 })
        .limit(15)
        .lean(),
      Payment.find(payQuery).select("sale paymentMethod amount notes").lean(),
      Payment.find(refundedPayQuery).select("sale paymentMethod amount").lean(),
      Sale.find(saleQuery).select("saleNumber salesmanName totalPaid totalAmount isAccrued completedAt createdAt").lean(),
      Expense.find(expQuery)
        .select(
          "expenseNumber locationName shopTag entryType category amount paymentMethod cashAmount onlineAmount recipient reason notes attachmentUrl createdAt"
        )
        .sort({ createdAt: 1 })
        .lean(),
      CashMovement.find(refundMoveQuery)
        .select("movementNumber location shopTag paymentMethod amount referenceType referenceId notes createdAt")
        .sort({ createdAt: 1 })
        .lean(),
    ]);

  // Identify same-day cancelled sales whose Payment already disappeared from paymentsToday (avoid double subtraction)
  const sameDayRefundedSaleIds = new Set(
    (refundedPaymentsToday as any[])
      .map((p) => p.sale?.toString())
      .filter(Boolean)
  );
  let sameDayRefundedSaleNumbers = new Set<string>();
  const saleRefundRefs = (refundMovementsToday as any[])
    .filter((cm) => cm.referenceType === "Sale" && cm.referenceId)
    .map((cm) => cm.referenceId);

  if (saleRefundRefs.length > 0 && sameDayRefundedSaleIds.size > 0) {
    const [matchedInvoices, matchedSales] = await Promise.all([
      Invoice.find({ invoiceNumber: { $in: saleRefundRefs } }).select("invoiceNumber sale").lean(),
      Sale.find({ _id: { $in: Array.from(sameDayRefundedSaleIds) } }).select("saleNumber").lean(),
    ]);
    for (const s of matchedSales as any[]) {
      if (s.saleNumber) sameDayRefundedSaleNumbers.add(s.saleNumber);
    }
    for (const inv of matchedInvoices as any[]) {
      if (inv.sale && sameDayRefundedSaleIds.has(inv.sale.toString()) && inv.invoiceNumber) {
        sameDayRefundedSaleNumbers.add(inv.invoiceNumber);
      }
    }
  }

  const activeSession: any = sessions.find((s: any) => s.status === "OPEN") || null;
  const history: any[] = sessions.filter((s: any) => s.status === "CLOSED");

  const sessionForDate: any = sessions.find((s: any) => {
    const openedTime = new Date(s.openedAt).getTime();
    return openedTime >= startDate.getTime() && openedTime <= endDate.getTime();
  });

  const prevClosedSession: any = sessions.find((s: any) => {
    const openedTime = new Date(s.openedAt).getTime();
    return s.status === "CLOSED" && openedTime < startDate.getTime();
  });

  let openingBalance = 0;
  let openingOnline = 0;
  if (sessionForDate) {
    openingBalance = Number(sessionForDate.openingCash || 0);
    openingOnline = Number(sessionForDate.openingOnline || 0);
  } else if (activeSession && new Date(activeSession.openedAt).getTime() <= endDate.getTime()) {
    openingBalance = Number(activeSession.openingCash || 0);
    openingOnline = Number(activeSession.openingOnline || 0);
  } else if (prevClosedSession) {
    openingBalance = Number(prevClosedSession.actualCash ?? prevClosedSession.expectedCash ?? 0);
    openingOnline = Number(prevClosedSession.actualOnline ?? prevClosedSession.expectedOnline ?? 0);
  }

  let todayCashSales = 0;
  let todayOnlineSales = 0;
  let todayCardSales = 0;

  for (const p of paymentsToday as any[]) {
    const amt = Number(p.amount || 0);
    if (p.paymentMethod === "CASH") todayCashSales += amt;
    else if (p.paymentMethod === "BANK_TRANSFER" || p.paymentMethod === "ONLINE_GATEWAY") todayOnlineSales += amt;
    else if (p.paymentMethod === "CARD") todayCardSales += amt;
  }

  if (paymentsToday.length === 0 && salesToday.length > 0) {
    for (const s of salesToday as any[]) {
      if (!s.isAccrued) {
        todayCashSales += Number(s.totalPaid || s.totalAmount || 0);
      }
    }
  }

  const cashSalesNoteParts: string[] = [];
  const onlineSalesNoteParts: string[] = [];
  const cardSalesNoteParts: string[] = [];
  const smCashMap = new Map<string, number>();
  const smOnlineMap = new Map<string, number>();
  const smCardMap = new Map<string, number>();
  const cashBySaleId = new Map<string, number>();
  const onlineBySaleId = new Map<string, number>();
  const cardBySaleId = new Map<string, number>();

  for (const p of paymentsToday as any[]) {
    if (p.sale) {
      const sId = p.sale.toString();
      if (p.paymentMethod === "CASH") {
        cashBySaleId.set(sId, (cashBySaleId.get(sId) || 0) + Number(p.amount || 0));
      } else if (p.paymentMethod === "BANK_TRANSFER" || p.paymentMethod === "ONLINE_GATEWAY") {
        onlineBySaleId.set(sId, (onlineBySaleId.get(sId) || 0) + Number(p.amount || 0));
      } else if (p.paymentMethod === "CARD") {
        cardBySaleId.set(sId, (cardBySaleId.get(sId) || 0) + Number(p.amount || 0));
      }
    }
  }
  const completedSaleIds = new Set((salesToday as any[]).map((s) => s._id.toString()));
  for (const s of salesToday as any[]) {
    const sId = s._id.toString();
    const smName = s.salesmanName || "Counter";
    // Only use legacy totalPaid fallback when the sale was created on the same reporting day (avoid attributing prior-day deposits)
    const legacySameDayFallback =
      paymentsToday.length === 0 &&
      (!s.completedAt || (s.createdAt && new Date(s.createdAt) >= startDate))
        ? Number(s.totalPaid || 0)
        : 0;
    const cAmt = cashBySaleId.get(sId) || legacySameDayFallback;
    const oAmt = onlineBySaleId.get(sId) || 0;
    const cardAmt = cardBySaleId.get(sId) || 0;
    if (cAmt > 0) smCashMap.set(smName, (smCashMap.get(smName) || 0) + cAmt);
    if (oAmt > 0) smOnlineMap.set(smName, (smOnlineMap.get(smName) || 0) + oAmt);
    if (cardAmt > 0) smCardMap.set(smName, (smCardMap.get(smName) || 0) + cardAmt);
  }
  for (const p of paymentsToday as any[]) {
    const sId = p.sale?.toString();
    if (sId && completedSaleIds.has(sId)) continue;
    const amt = Number(p.amount || 0);
    if (amt <= 0) continue;

    const noteLower = String(p.notes || "").toLowerCase();
    const bucketLabel = noteLower.includes("repair")
      ? "Repairs"
      : noteLower.includes("khata") || noteLower.includes("settlement")
      ? "Khata"
      : noteLower.includes("rental")
      ? "Rentals"
      : sId || noteLower.includes("advance")
      ? "Advance"
      : "Collections";

    if (p.paymentMethod === "CASH") {
      smCashMap.set(bucketLabel, (smCashMap.get(bucketLabel) || 0) + amt);
    } else if (p.paymentMethod === "BANK_TRANSFER" || p.paymentMethod === "ONLINE_GATEWAY") {
      smOnlineMap.set(bucketLabel, (smOnlineMap.get(bucketLabel) || 0) + amt);
    } else if (p.paymentMethod === "CARD") {
      smCardMap.set(bucketLabel, (smCardMap.get(bucketLabel) || 0) + amt);
    }
  }
  for (const [name, val] of smCashMap.entries()) {
    cashSalesNoteParts.push(`${name} ${val.toLocaleString()}`);
  }
  for (const [name, val] of smOnlineMap.entries()) {
    onlineSalesNoteParts.push(`${name} ${val.toLocaleString()}`);
  }
  for (const [name, val] of smCardMap.entries()) {
    cardSalesNoteParts.push(`${name} ${val.toLocaleString()}`);
  }

  let todayExpenses = 0;
  let todayCashExpenses = 0;
  let todayOnlineExpenses = 0;
  let purchasingAndAtifNet = 0;
  let purchasingAndAtifCashNet = 0;
  let purchasingAndAtifOnlineNet = 0;

  let runningCashBalance = openingBalance;
  let runningOnlineBalance = openingOnline;

  const diaryEntries: any[] = [
    {
      _id: "OB-ROW",
      seq: "O.B",
      time: "09:00 AM",
      description: "Starting Opening Balance (Cash & Online)",
      shopTag: locationId === "ALL" ? "ALL" : (activeSession?.locationName || "SHOP"),
      paymentMethod: "OPENING",
      cashIn: openingBalance,
      cashOut: 0,
      onlineIn: openingOnline,
      onlineOut: 0,
      runningBalance: runningCashBalance,
      runningOnlineBalance,
      entryType: "OPENING",
    },
  ];

  if (todayCashSales > 0 || todayOnlineSales > 0 || todayCardSales > 0) {
    runningCashBalance += todayCashSales;
    runningOnlineBalance += todayOnlineSales;
    diaryEntries.push({
      _id: "CS-ROW",
      seq: "POS",
      time: "Auto POS",
      description: `Today's POS & Collections${cashSalesNoteParts.length > 0 ? ` • Cash: ${cashSalesNoteParts.join(" + ")}` : ""}${onlineSalesNoteParts.length > 0 ? ` • Online: ${onlineSalesNoteParts.join(" + ")}` : ""}${cardSalesNoteParts.length > 0 ? ` • Card: ${cardSalesNoteParts.join(" + ")}` : ""}`,
      shopTag: locationId === "ALL" ? "ALL" : (activeSession?.locationName || "SHOP"),
      paymentMethod: todayCashSales > 0 && todayOnlineSales > 0 ? "SPLIT" : todayOnlineSales > 0 ? "ONLINE" : "CASH",
      cashIn: todayCashSales,
      cashOut: 0,
      onlineIn: todayOnlineSales,
      onlineOut: 0,
      runningBalance: runningCashBalance,
      runningOnlineBalance,
      entryType: "CASH_SALE",
    });
  }

  let idxCounter = 1;
  for (const e of expensesToday as any[]) {
    const totalAmt = Number(e.amount || 0);
    const pMethod = e.paymentMethod || "CASH";
    const eType =
      e.entryType ||
      (e.category === "Atif Withdraw"
        ? "ATIF_WITHDRAW"
        : e.category === "Atif Deposit"
        ? "ATIF_DEPOSIT"
        : e.category === "Purchasing"
        ? "CASH_PURCHASING"
        : "EXPENSE");

    let cPart = 0;
    let oPart = 0;
    if (pMethod === "SPLIT") {
      cPart = Number(e.cashAmount || 0);
      oPart = Number(e.onlineAmount || 0);
    } else if (pMethod === "ONLINE" || pMethod === "BANK_TRANSFER" || pMethod === "CARD") {
      cPart = 0;
      oPart = totalAmt;
    } else {
      cPart = totalAmt;
      oPart = 0;
    }

    const isInflow = eType === "ATIF_DEPOSIT";
    if (isInflow) {
      runningCashBalance += cPart;
      runningOnlineBalance += oPart;
      purchasingAndAtifNet -= totalAmt;
      purchasingAndAtifCashNet -= cPart;
      purchasingAndAtifOnlineNet -= oPart;
    } else {
      runningCashBalance -= cPart;
      runningOnlineBalance -= oPart;
      if (eType === "EXPENSE") {
        todayExpenses += totalAmt;
        todayCashExpenses += cPart;
        todayOnlineExpenses += oPart;
      } else {
        purchasingAndAtifNet += totalAmt;
        purchasingAndAtifCashNet += cPart;
        purchasingAndAtifOnlineNet += oPart;
      }
    }

    diaryEntries.push({
      _id: e._id.toString(),
      expenseNumber: e.expenseNumber,
      seq: String(idxCounter++),
      time: e.createdAt
        ? new Date(e.createdAt).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })
        : "—",
      description: e.reason || e.recipient || e.notes || e.category,
      category: e.category,
      shopTag: e.shopTag || e.locationName || "P.G.S",
      paymentMethod: pMethod,
      cashIn: isInflow ? cPart : 0,
      cashOut: isInflow ? 0 : cPart,
      onlineIn: isInflow ? oPart : 0,
      onlineOut: isInflow ? 0 : oPart,
      runningBalance: runningCashBalance,
      runningOnlineBalance,
      attachmentUrl: e.attachmentUrl,
      entryType: eType,
    });
  }

  for (const cm of refundMovementsToday as any[]) {
    if (cm.referenceType === "Sale" && cm.referenceId && sameDayRefundedSaleNumbers.has(cm.referenceId)) {
      continue;
    }
    const amt = Number(cm.amount || 0);
    if (amt <= 0) continue;
    const pMethod = cm.paymentMethod || "CASH";
    const isOnlineRefund =
      pMethod === "ONLINE" || pMethod === "BANK_TRANSFER" || pMethod === "ONLINE_GATEWAY" || pMethod === "CARD";
    const cOut = isOnlineRefund ? 0 : amt;
    const oOut = isOnlineRefund ? amt : 0;

    runningCashBalance -= cOut;
    runningOnlineBalance -= oOut;

    diaryEntries.push({
      _id: `REF-${cm._id.toString()}`,
      seq: "REF",
      time: cm.createdAt
        ? new Date(cm.createdAt).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })
        : "—",
      description: cm.notes || `Refund (${cm.referenceId || cm.movementNumber})`,
      category: "Refund",
      shopTag: cm.shopTag || "P.G.S",
      paymentMethod: isOnlineRefund ? "ONLINE" : "CASH",
      cashIn: 0,
      cashOut: cOut,
      onlineIn: 0,
      onlineOut: oOut,
      runningBalance: runningCashBalance,
      runningOnlineBalance,
      entryType: "CASH_REFUND",
    });
  }

  return {
    activeSession,
    history,
    sessions,
    diarySummary: {
      date: dateStr,
      openingBalance,
      openingOnline,
      todayCashSales,
      todayOnlineSales,
      todayCardSales,
      todayExpenses,
      todayCashExpenses,
      todayOnlineExpenses,
      expenseCount: expensesToday.filter((e: any) => !e.entryType || e.entryType === "EXPENSE").length,
      purchasingAndAtifNet,
      purchasingAndAtifCashNet,
      purchasingAndAtifOnlineNet,
      closingCashBalance: runningCashBalance,
      closingOnlineBalance: runningOnlineBalance,
    },
    diaryEntries,
  };
}

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Branch", "Salesman"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const locationId = searchParams.get("locationId") || "ALL";
    const status = searchParams.get("status");
    const todayPkt = new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
    const dateStr = searchParams.get("date") || todayPkt;

    const data = await loadDailyDiaryData(locationId, dateStr, status);

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch cash sessions." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Branch", "Salesman"]);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const {
      action,
      locationId,
      date,
      openingCash,
      openingOnline,
      sessionId,
      actualCashCount,
      actualOnlineCount,
      varianceReason,
      notes,
    } = body;

    if (action === "OPEN") {
      let targetLocId = locationId;
      if (!targetLocId || targetLocId === "ALL") {
        const firstLoc = await Location.findOne({ active: true }).lean();
        targetLocId = firstLoc?._id?.toString();
      }
      if (!targetLocId) {
        return NextResponse.json({ success: false, error: "Location ID is required to open session." }, { status: 400 });
      }

      const newObCash = Math.max(0, Number(openingCash || 0));
      const newObOnline = Math.max(0, Number(openingOnline || 0));

      // If an active session already exists, update its openingCash & openingOnline directly
      const existingOpen = await CashSession.findOne({
        ...(locationId && locationId !== "ALL" ? { location: locationId } : {}),
        status: "OPEN",
      });
      if (existingOpen) {
        const diffCash = newObCash - Number(existingOpen.openingCash || 0);
        const diffOnline = newObOnline - Number(existingOpen.openingOnline || 0);
        existingOpen.openingCash = newObCash;
        existingOpen.expectedCash = Number(existingOpen.expectedCash || 0) + diffCash;
        existingOpen.openingOnline = newObOnline;
        existingOpen.expectedOnline = Number(existingOpen.expectedOnline || 0) + diffOnline;
        await existingOpen.save();
        return NextResponse.json({
          success: true,
          message: "Opening Balances (Cash & Online O.B) updated.",
          data: existingOpen,
        });
      }

      const openResult = await openCashSession({
        locationId: targetLocId,
        cashierUsername: auth.user.username,
        openingCash: newObCash,
        notes,
      });

      if (openResult.session) {
        openResult.session.openingOnline = newObOnline;
        openResult.session.expectedOnline = newObOnline;
        await openResult.session.save();
      }

      return NextResponse.json({
        success: true,
        message: "Opening Balances (Cash & Online O.B) set.",
        data: openResult.session,
      });
    }

    if (action === "CLOSE") {
      const todayPkt = new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
      const diaryDate = date || todayPkt;
      const diaryData = await loadDailyDiaryData(locationId || "ALL", diaryDate);
      const summary = diaryData.diarySummary;

      let targetSession = sessionId ? await CashSession.findById(sessionId) : null;
      if (!targetSession) {
        targetSession = await CashSession.findOne({
          ...(locationId && locationId !== "ALL" ? { location: locationId } : {}),
          status: "OPEN",
        }).sort({ openedAt: -1 });
      }
      if (!targetSession) {
        const [year, month, day] = diaryDate.split("-").map(Number);
        const startDate = new Date(Date.UTC(year, month - 1, day - 1, 19, 0, 0, 0));
        const endDate = new Date(Date.UTC(year, month - 1, day, 18, 59, 59, 999));
        targetSession = await CashSession.findOne({
          ...(locationId && locationId !== "ALL" ? { location: locationId } : {}),
          status: "CLOSED",
          openedAt: { $gte: startDate, $lte: endDate },
        }).sort({ closedAt: -1 });
      }
      if (!targetSession) {
        let targetLocId = locationId && locationId !== "ALL" ? locationId : "";
        if (!targetLocId) {
          const firstLoc = await Location.findOne({ active: true }).select("_id").lean();
          targetLocId = (firstLoc as any)?._id?.toString() || "";
        }
        if (!targetLocId) {
          return NextResponse.json({ success: false, error: "Location ID is required to close register." }, { status: 400 });
        }
        const opened = await openCashSession({
          locationId: targetLocId,
          cashierUsername: auth.user.username,
          openingCash: summary.openingBalance,
          notes: notes?.trim() || "Auto-opened at EOD Diary Close",
        });
        targetSession = opened.session;
        targetSession.openingOnline = summary.openingOnline;
      } else if (targetSession.status === "CLOSED") {
        return NextResponse.json({
          success: true,
          message: "Daily Diary already closed.",
          data: targetSession,
        });
      }

      const actualCash = Number(actualCashCount || 0);
      const actualOnline =
        actualOnlineCount !== undefined
          ? Number(actualOnlineCount || 0)
          : summary.closingOnlineBalance;
      const variance = actualCash - summary.closingCashBalance;

      if (Math.abs(variance) > 0.01 && !varianceReason?.trim()) {
        return NextResponse.json(
          {
            success: false,
            error: `Variance of Rs. ${variance.toLocaleString()} detected. A variance explanation reason is required.`,
          },
          { status: 400 }
        );
      }

      targetSession.totalCashSales = summary.todayCashSales;
      targetSession.totalCardSales = summary.todayCardSales;
      targetSession.totalOnlineSales = summary.todayOnlineSales;
      targetSession.totalExpenses = summary.todayExpenses;
      targetSession.expectedCash = summary.closingCashBalance;
      targetSession.expectedOnline = summary.closingOnlineBalance;
      targetSession.actualCash = actualCash;
      targetSession.actualOnline = actualOnline;
      targetSession.variance = variance;
      if (varianceReason?.trim()) targetSession.varianceReason = varianceReason.trim();
      if (notes?.trim()) targetSession.notes = notes.trim();
      targetSession.status = "CLOSED";
      targetSession.closedAt = new Date();
      await targetSession.save();

      return NextResponse.json({
        success: true,
        message: "Daily Diary closed & locked (Cash & Online balances saved for tomorrow).",
        data: targetSession,
      });
    }

    return NextResponse.json({ success: false, error: "Invalid action. Use 'OPEN' or 'CLOSE'." }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process cash session operation." },
      { status: 500 }
    );
  }
}
