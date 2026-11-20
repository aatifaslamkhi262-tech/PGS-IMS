import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Sale } from "@/models/Sale";
import { Invoice } from "@/models/Invoice";
import { Payment } from "@/models/Payment";
import { InventoryMovement } from "@/models/InventoryMovement";
import { PurchaseInvoice } from "@/models/PurchaseInvoice";
import { Expense } from "@/models/Expense";
import { Customer } from "@/models/Customer";
import { CustomerLedger } from "@/models/CustomerLedger";
import { RentalBooking } from "@/models/RentalBooking";
import { Repair } from "@/models/Repair";
import { CashMovement } from "@/models/CashMovement";
import { verifyRole } from "@/lib/auth/rbac";

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Salesman", "Branch"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }
    const canInspectCards = String(auth.user?.username || "").trim().toLowerCase() === "ayan";

    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get("date") || new Date().toISOString().slice(0, 10);
    const startDateParam = searchParams.get("startDate") || dateStr;
    const endDateParam = searchParams.get("endDate") || dateStr;
    const locationId = searchParams.get("locationId") || "ALL";
    const staffId = searchParams.get("staffId") || "ALL";

    // 1. Build Pakistan Standard Time (PKT - Asia/Karachi, UTC+5) Date Window
    const [sYear, sMonth, sDay] = startDateParam.split("-").map(Number);
    const [eYear, eMonth, eDay] = endDateParam.split("-").map(Number);
    const startDate = new Date(Date.UTC(sYear, sMonth - 1, sDay - 1, 19, 0, 0, 0));
    const endDate = new Date(Date.UTC(eYear, eMonth - 1, eDay, 18, 59, 59, 999));

    // 2. Build Query Filters for Independent Data Sources
    // Match COMPLETED sales by completedAt so Advance Bookings / Online Orders appear on completion day
    // rather than creation day (falling back to createdAt for legacy docs without completedAt).
    const saleQuery: any = {
      status: "COMPLETED",
      $or: [
        { completedAt: { $gte: startDate, $lte: endDate } },
        { completedAt: null, createdAt: { $gte: startDate, $lte: endDate } },
      ],
    };
    if (locationId !== "ALL") {
      saleQuery.location = locationId;
    }

    const paymentQuery: any = {
      createdAt: { $gte: startDate, $lte: endDate },
      status: "PAID",
    };
    if (locationId !== "ALL") {
      paymentQuery.location = locationId;
    }

    const movementQuery: any = {
      $or: [
        { date: { $gte: startDate, $lte: endDate } },
        { createdAt: { $gte: startDate, $lte: endDate } },
      ],
    };
    if (locationId !== "ALL") {
      movementQuery.$and = [
        {
          $or: [
            { sourceLocation: locationId },
            { destinationLocation: locationId },
          ],
        },
      ];
    }

    const purchaseInvoiceQuery: any = {
      $or: [
        { invoiceDate: { $gte: startDate, $lte: endDate } },
        { createdAt: { $gte: startDate, $lte: endDate } },
      ],
      status: { $ne: "Rejected" },
    };
    if (locationId !== "ALL") {
      purchaseInvoiceQuery.$and = [
        {
          $or: [
            { location: locationId },
            { location: { $exists: false } },
            { location: null },
          ],
        },
      ];
    }

    const expenseQuery: any = {
      $or: [
        { createdAt: { $gte: startDate, $lte: endDate } },
        { date: { $gte: startDate, $lte: endDate } },
      ],
      status: { $in: ["APPROVED", "Approved"] },
    };
    if (locationId !== "ALL") {
      expenseQuery.location = locationId;
    }

    const rentalBookingQuery: any = {
      $or: [
        { createdAt: { $gte: startDate, $lte: endDate } },
        { "items.returnedAt": { $gte: startDate, $lte: endDate } },
      ],
    };
    if (locationId !== "ALL") {
      rentalBookingQuery.location = locationId;
    }

    const repairQuery: any = {
      createdAt: { $gte: startDate, $lte: endDate },
    };
    if (locationId !== "ALL") {
      repairQuery.location = locationId;
    }

    const cashRefundMoveQuery: any = {
      createdAt: { $gte: startDate, $lte: endDate },
      type: "CASH_REFUND",
    };
    const refundedPaymentQuery: any = {
      createdAt: { $gte: startDate, $lte: endDate },
      status: "REFUNDED",
    };
    if (locationId !== "ALL") {
      cashRefundMoveQuery.location = locationId;
      refundedPaymentQuery.location = locationId;
    }

    // 3. Parallel Database Execution for All Independent Queries
    const [
      sales,
      payments,
      movements,
      purchaseInvoices,
      expensesDocs,
      customerAgg,
      customersWithAdvance,
      customersWithOutstanding,
      rentalBookings,
      repairsDocs,
      refundCashMovements,
      refundedPaymentsToday,
    ] = await Promise.all([
      Sale.find(saleQuery).lean(),
      Payment.find(paymentQuery)
        .select("paymentNumber sale customer paymentMethod amount notes receivedBy createdAt")
        .populate("customer", "name phone")
        .sort({ createdAt: -1 })
        .lean(),
      InventoryMovement.find(movementQuery).lean(),
      PurchaseInvoice.find(purchaseInvoiceQuery).select("-items -attachmentUrls").lean(),
      Expense.find(expenseQuery)
        .select("expenseNumber amount entryType category reason recipient paymentMethod createdAt date")
        .sort({ createdAt: -1 })
        .lean(),
      Customer.aggregate([
        { $match: { active: true } },
        {
          $group: {
            _id: null,
            outstanding: { $sum: "$outstandingBalance" },
            customerAdvances: { $sum: "$advanceBalance" },
          },
        },
      ]),
      Customer.find({ advanceBalance: { $gt: 0 } })
        .select("_id name phone advanceBalance updatedAt")
        .sort({ advanceBalance: -1 })
        .lean(),
      canInspectCards
        ? Customer.find({ active: true, outstandingBalance: { $gt: 0 } })
            .select("_id name phone outstandingBalance updatedAt")
            .sort({ outstandingBalance: -1 })
            .lean()
        : Promise.resolve([]),
      RentalBooking.find(rentalBookingQuery).lean(),
      Repair.find(repairQuery).lean(),
      CashMovement.find(cashRefundMoveQuery)
        .select("movementNumber amount paymentMethod referenceType referenceId notes createdAt")
        .sort({ createdAt: -1 })
        .lean(),
      Payment.find(refundedPaymentQuery).select("sale").lean(),
    ]);

    // Identify same-day cancelled sales whose Payment already excluded from Cash Received (avoid showing phantom cashRefunds)
    const sameDayRefundedSaleIds = new Set(
      (refundedPaymentsToday as any[])
        .map((p) => p.sale?.toString())
        .filter(Boolean)
    );
    const sameDayRefundedSaleNumbers = new Set<string>();
    const saleRefundRefs = (refundCashMovements as any[])
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

    // Lightweight summary row type for card drilldown modals
    interface SummaryRow {
      ref: string;
      date?: string;
      summary: string;
      amount: number;
      kind?: "SALE" | "RENTAL" | "PAYMENT" | "REPAIR" | "PURCHASE" | "EXPENSE" | "REFUND" | "CUSTOMER";
      targetId?: string;
      badge?: string;
    }

    const saleLookupById = new Map<string, any>();
    for (const s of sales as any[]) {
      saleLookupById.set(s._id.toString(), s);
    }

    // Map payments by sale ID so each sale & salesman row knows exact Cash / Card / Online / Exchange Credit
    const paymentsBySaleMap = new Map<
      string,
      { cash: number; card: number; online: number; exchangeCredit: number }
    >();

    let cashReceived = 0;
    let card = 0;
    let bankOnline = 0;
    let exchangeCredit = 0;

    const cashReceivedRows: SummaryRow[] = [];
    const cardRows: SummaryRow[] = [];
    const bankOnlineRows: SummaryRow[] = [];
    const exchangeCreditRows: SummaryRow[] = [];

    for (const p of payments as any[]) {
      const sId = p.sale?.toString();
      const linkedSale = sId ? saleLookupById.get(sId) : null;
      const entry = sId
        ? paymentsBySaleMap.get(sId) || { cash: 0, card: 0, online: 0, exchangeCredit: 0 }
        : null;
      const amt = Number(p.amount || 0);
      const custName = (p.customer as any)?.name || linkedSale?.customerName;
      const rowRef = linkedSale?.saleNumber || p.paymentNumber || "PAY";
      const noteText = p.notes || (linkedSale ? `${custName || "Walk-in"} (${linkedSale.salesmanName || "Counter"})` : custName || p.receivedBy || "Collection");
      const rowKind: SummaryRow["kind"] = linkedSale
        ? "SALE"
        : String(p.notes || "").toLowerCase().includes("repair")
        ? "REPAIR"
        : String(p.notes || "").toLowerCase().includes("rental")
        ? "RENTAL"
        : p.customer
        ? "CUSTOMER"
        : "PAYMENT";
      const rowBadge = linkedSale
        ? linkedSale.saleSource === "WEBSITE"
          ? "Online"
          : "Sale"
        : rowKind === "REPAIR"
        ? "Repair"
        : rowKind === "RENTAL"
        ? "Rental"
        : "Khata";
      const baseRow: SummaryRow = {
        ref: rowRef,
        date: p.createdAt ? new Date(p.createdAt).toISOString() : undefined,
        summary: custName && !noteText.toLowerCase().includes(custName.toLowerCase()) ? `${custName} • ${noteText}` : noteText,
        amount: amt,
        kind: rowKind,
        targetId: linkedSale?._id?.toString() || (p.customer as any)?._id?.toString() || sId || p._id?.toString(),
        badge: rowBadge,
      };

      if (p.paymentMethod === "CASH") {
        cashReceived += amt;
        if (amt > 0) cashReceivedRows.push(baseRow);
        if (entry) entry.cash += amt;
      } else if (p.paymentMethod === "CARD") {
        card += amt;
        if (amt > 0) cardRows.push(baseRow);
        if (entry) entry.card += amt;
      } else if (p.paymentMethod === "BANK_TRANSFER" || p.paymentMethod === "ONLINE_GATEWAY") {
        bankOnline += amt;
        if (amt > 0) bankOnlineRows.push(baseRow);
        if (entry) entry.online += amt;
      } else if (p.paymentMethod === "EXCHANGE_CREDIT") {
        exchangeCredit += amt;
        if (amt > 0) exchangeCreditRows.push(baseRow);
        if (entry) entry.exchangeCredit += amt;
      }
      if (sId && entry) {
        paymentsBySaleMap.set(sId, entry);
      }
    }

    // 4. Process Sales & Profit Metrics (Pure Product Sales, excluding delivery charges from profit)
    let totalSales = 0;
    let accruedSales = 0;
    let accruedProfit = 0;
    let cogs = 0;
    let stockOutValue = 0;
    let deliveryCollected = 0;

    const enrichedSales: any[] = [];

    for (const s of sales as any[]) {
      // Filter staff if specified
      if (staffId !== "ALL") {
        if (staffId === "DIRECT" && s.salesman) continue;
        if (staffId === "WEBSITE" && s.saleSource !== "WEBSITE") continue;
        if (
          staffId !== "DIRECT" &&
          staffId !== "WEBSITE" &&
          s.salesman?.toString() !== staffId
        ) {
          continue;
        }
      }

      const delivery = Number(s.deliveryCharges || 0);
      deliveryCollected += delivery;

      const productSales =
        s.subtotal !== undefined
          ? Math.max(0, Number(s.subtotal || 0) - Number(s.discountAmount || 0))
          : Math.max(0, Number(s.totalAmount || 0) - delivery);
      const saleProfit = productSales - (s.totalCost || 0);

      if (s.isAccrued) {
        accruedSales += productSales;
        accruedProfit += saleProfit;
      } else {
        totalSales += productSales;
        cogs += s.totalCost || 0;
      }

      for (const item of s.items || []) {
        const itemCost = item.unitCost !== undefined && item.unitCost >= 0 ? item.unitCost : 0;
        stockOutValue += itemCost * (item.quantity || 1);
      }

      const salePayments = paymentsBySaleMap.get(s._id.toString()) || {
        cash: payments.length === 0 && !s.isAccrued ? Number(s.totalPaid || s.totalAmount || 0) : 0,
        card: 0,
        online: 0,
        exchangeCredit: 0,
      };

      enrichedSales.push({
        ...s,
        paymentBreakdown: salePayments,
      });
    }

    if (payments.length === 0) {
      for (const s of enrichedSales) {
        if (!s.isAccrued && s.status === "COMPLETED") {
          const fallbackPaid = Number(s.totalPaid || s.totalAmount || 0);
          cashReceived += fallbackPaid;
          if (fallbackPaid > 0) {
            cashReceivedRows.push({
              ref: s.saleNumber || "SALE",
              date: (s.completedAt || s.createdAt) ? new Date(s.completedAt || s.createdAt).toISOString() : undefined,
              summary: `${s.customerName || "Walk-in"} (${s.salesmanName || "Counter"})`,
              amount: fallbackPaid,
              kind: "SALE",
              targetId: s._id?.toString(),
              badge: "Sale",
            });
          }
        }
      }
    }

    // 5. Rental Booking Security Deposits & Refunds
    let rentalDepositsToday = 0;
    let rentalRefundsToday = 0;
    let realizedRentalIncome = 0;
    const cashRefundRows: SummaryRow[] = [];
    const settlementPaidRows: SummaryRow[] = [];

    for (const r of rentalBookings as any[]) {
      if (r.createdAt && new Date(r.createdAt) >= startDate && new Date(r.createdAt) <= endDate) {
        if (r.status !== "COMPLETED") {
          const hasRecordedPayment = (payments as any[]).some(
            (p) => typeof p.notes === "string" && p.notes.includes(r.bookingNumber)
          );
          if (!hasRecordedPayment) {
            const heldAmt = Number(r.totalDepositHeld || 0);
            rentalDepositsToday += heldAmt;
            if (heldAmt > 0) {
              cashReceivedRows.push({
                ref: r.bookingNumber || "RENT",
                date: new Date(r.createdAt).toISOString(),
                summary: `${r.customerName || "Rental Customer"} • Security Deposit`,
                amount: heldAmt,
                kind: "RENTAL",
                targetId: r._id?.toString(),
                badge: "Rental",
              });
            }
          }
        }
      }

      for (const item of r.items || []) {
        if (item.status === "RETURNED" && item.returnedAt) {
          const retDate = new Date(item.returnedAt);
          if (retDate >= startDate && retDate <= endDate) {
            if (item.netRefundPaid && item.netRefundPaid > 0) {
              const hasRefundMove = (refundCashMovements as any[]).some(
                (cm) => cm.referenceId && r.bookingNumber && cm.referenceId === r.bookingNumber
              );
              if (!hasRefundMove) {
                rentalRefundsToday += item.netRefundPaid;
                const rRow: SummaryRow = {
                  ref: r.bookingNumber || "RENT",
                  date: retDate.toISOString(),
                  summary: `${r.customerName || "Rental Customer"} • Deposit Refund`,
                  amount: Number(item.netRefundPaid),
                  kind: "RENTAL",
                  targetId: r._id?.toString(),
                  badge: "Rental Refund",
                };
                cashRefundRows.push(rRow);
                settlementPaidRows.push(rRow);
              }
            }
            if (item.accruedRent && item.accruedRent > 0) {
              realizedRentalIncome += item.accruedRent;
            }
          }
        }
      }
    }
    cashReceived += rentalDepositsToday;

    // 6. Process Inventory Movements & Purchase Invoices (Direct Stock-In vs Exchange Stock-In)
    let stockInAcquisitionValue = 0;
    let directStockIn = 0;
    let exchangeStockIn = 0;
    let supplierStockIn = 0;
    const directStockInRows: SummaryRow[] = [];
    const exchangeStockInRows: SummaryRow[] = [];
    const rentalStockOutRows: SummaryRow[] = [];
    let customerSettlementReceived = 0;
    for (const s of enrichedSales) {
      if (s.saleSource === "EXCHANGE") {
        customerSettlementReceived += Number(s.totalPaid || 0);
      }
    }
    let cashRefunds = rentalRefundsToday;
    let customerSettlementPaid = rentalRefundsToday;
    if (staffId === "ALL") {
      for (const cm of refundCashMovements as any[]) {
        if (cm.referenceType === "Sale" && cm.referenceId && sameDayRefundedSaleNumbers.has(cm.referenceId)) {
          continue;
        }
        const amt = Number(cm.amount || 0);
        if (amt <= 0) continue;
        cashRefunds += amt;
        const moveRow: SummaryRow = {
          ref: cm.referenceId || cm.movementNumber || "REF",
          date: cm.createdAt ? new Date(cm.createdAt).toISOString() : undefined,
          summary: cm.notes || `Refund (${cm.paymentMethod || "CASH"})`,
          amount: amt,
          kind: "REFUND",
          targetId: cm._id?.toString(),
          badge: cm.paymentMethod || "Refund",
        };
        cashRefundRows.push(moveRow);
        if (cm.referenceType === "Return") {
          customerSettlementPaid += amt;
          settlementPaidRows.push(moveRow);
        }
      }
    }

    // Track per-salesman stock-in from Purchase Invoices
    const salesmanStockInMap = new Map<
      string,
      { salesmanName: string; directStockIn: number; exchangeStockIn: number; supplierStockIn: number }
    >();

    for (const pi of purchaseInvoices as any[]) {
      if (staffId !== "ALL" && staffId !== "DIRECT" && staffId !== "WEBSITE") {
        if (pi.handledBySalesman && pi.handledBySalesman.toString() !== staffId) continue;
      }
      const piTotal = Number(pi.total || pi.subtotal || 0);
      const purpose =
        pi.intakePurpose ||
        (pi.receivingType === "CUSTOMER_BUYBACK"
          ? "DIRECT_BUYBACK"
          : pi.receivingType === "CUSTOMER_RETURN"
          ? "EXCHANGE_INTAKE"
          : "SUPPLIER_PURCHASE");

      const invRow: SummaryRow = {
        ref: pi.invoiceNumber || "PINV",
        date: (pi.invoiceDate || pi.createdAt) ? new Date(pi.invoiceDate || pi.createdAt).toISOString() : undefined,
        summary: `${pi.customerName || pi.handledBySalesmanName || "Purchase"} (${pi.status || "Draft"})`,
        amount: piTotal,
        kind: "PURCHASE",
        targetId: pi._id?.toString(),
        badge: purpose === "DIRECT_BUYBACK" ? "Buyback" : purpose === "EXCHANGE_INTAKE" ? "Exchange In" : "Supplier",
      };

      if (purpose === "DIRECT_BUYBACK") {
        directStockIn += piTotal;
        if (piTotal > 0) directStockInRows.push(invRow);
      } else if (purpose === "EXCHANGE_INTAKE") {
        exchangeStockIn += piTotal;
        if (piTotal > 0) exchangeStockInRows.push(invRow);
      } else {
        supplierStockIn += piTotal;
      }

      if (pi.handledBySalesman || pi.handledBySalesmanName) {
        const key = pi.handledBySalesman?.toString() || pi.handledBySalesmanName;
        const smEntry = salesmanStockInMap.get(key) || {
          salesmanName: pi.handledBySalesmanName || "Assigned Staff",
          directStockIn: 0,
          exchangeStockIn: 0,
          supplierStockIn: 0,
        };
        if (purpose === "DIRECT_BUYBACK") smEntry.directStockIn += piTotal;
        else if (purpose === "EXCHANGE_INTAKE") smEntry.exchangeStockIn += piTotal;
        else smEntry.supplierStockIn += piTotal;
        salesmanStockInMap.set(key, smEntry);
      }
    }

    for (const m of movements as any[]) {
      if (
        m.type === "SUPPLIER_PURCHASE" ||
        m.type === "CUSTOMER_BUYBACK" ||
        m.type === "PURCHASE_RECEIVING" ||
        m.type === "RETURN_IN" ||
        (m.type === "STOCK_IN" && m.referenceType !== "RETURN_EXCHANGE")
      ) {
        stockInAcquisitionValue += m.totalCost || 0;
        if (m.type === "RETURN_IN" && exchangeStockIn === 0) {
          exchangeStockIn += m.totalCost || 0;
        }
      }

      if (m.type === "SALE_OUT" && (m.referenceType === "RENTAL_BOOKING" || m.referenceType === "RENTAL_SWAP")) {
        const moveCost = Number(m.totalCost || 0);
        stockOutValue += moveCost;
        if (moveCost > 0) {
          rentalStockOutRows.push({
            ref: m.referenceId || m.referenceTransaction || "RENT",
            date: (m.date || m.createdAt) ? new Date(m.date || m.createdAt).toISOString() : undefined,
            summary: `${m.productName || "Rental Item"} (${m.quantity || 1}x • ${m.referenceType})`,
            amount: moveCost,
            kind: "RENTAL",
            badge: "Rental Stock-Out",
          });
        }
      }
    }

    if (stockInAcquisitionValue === 0 && (directStockIn + exchangeStockIn + supplierStockIn) > 0) {
      stockInAcquisitionValue = directStockIn + exchangeStockIn + supplierStockIn;
    }

    // 7. Process Expenses (Isolate Operating Expenses from Atif Withdraw/Deposit & Cash Purchasing)
    let expenses = 0;
    let atifWithdrawTotal = 0;
    let atifDepositTotal = 0;
    let cashPurchasingTotal = 0;
    const expenseRows: SummaryRow[] = [];

    for (const e of expensesDocs as any[]) {
      const amt = Number(e.amount || 0);
      if (e.entryType === "ATIF_WITHDRAW" || e.category === "Atif Withdraw") {
        atifWithdrawTotal += amt;
      } else if (e.entryType === "ATIF_DEPOSIT" || e.category === "Atif Deposit") {
        atifDepositTotal += amt;
      } else if (e.entryType === "CASH_PURCHASING" || e.category === "Purchasing") {
        cashPurchasingTotal += amt;
      } else {
        expenses += amt;
        if (amt > 0) {
          expenseRows.push({
            ref: e.expenseNumber || "EXP",
            date: (e.createdAt || e.date) ? new Date(e.createdAt || e.date).toISOString() : undefined,
            summary: `${e.reason || e.recipient || e.category || "Expense"} (${e.paymentMethod || "CASH"})`,
            amount: amt,
            kind: "EXPENSE",
            targetId: e._id?.toString(),
            badge: e.category || "Expense",
          });
        }
      }
    }

    // 8. Process Repairs & Technician Breakdown
    let repairCount = 0;
    let repairTotalRevenue = 0;
    let repairLaborCharges = 0;
    let repairPartsCost = 0;
    let repairDirectCost = 0;
    let repairPartsSelling = 0;
    const technicianMap = new Map<
      string,
      { technician: string; count: number; totalRevenue: number; totalCost: number; profit: number; laborRevenue: number }
    >();

    for (const r of repairsDocs as any[]) {
      if (staffId !== "ALL") {
        if (staffId !== "DIRECT" && r.technicianId?.toString() !== staffId && r.repairedBy !== staffId) {
          continue;
        }
      }

      const rev = Number(r.totalAmount || 0);
      const directKharcha = Number(r.repairCost || 0);
      const inventoryPartCost = Number(r.partsCostTotal || 0);
      const totalCostOfJob = directKharcha + inventoryPartCost;
      const jobProfit = rev - totalCostOfJob;

      repairCount++;
      repairTotalRevenue += rev;
      repairDirectCost += directKharcha;
      repairPartsCost += totalCostOfJob;
      repairPartsSelling += r.partsTotal || 0;
      repairLaborCharges += Number(r.laborCost || 0);

      const tech = r.repairedBy || "In-House Technician";
      const existing = technicianMap.get(tech) || {
        technician: tech,
        count: 0,
        totalRevenue: 0,
        totalCost: 0,
        profit: 0,
        laborRevenue: 0,
      };
      existing.count += 1;
      existing.totalRevenue += rev;
      existing.totalCost += totalCostOfJob;
      existing.profit += jobProfit;
      existing.laborRevenue += jobProfit;
      technicianMap.set(tech, existing);
    }
    const technicianBreakdown = Array.from(technicianMap.values());
    const repairProfit = repairTotalRevenue - repairPartsCost;

    // 9. Profit Metrics
    const combinedTotalSales = totalSales + repairTotalRevenue;
    const combinedCogs = cogs + repairPartsCost;
    const grossProfit = combinedTotalSales - combinedCogs;
    const netProfit = grossProfit - expenses;

    // 10. Outstanding & Customer Advances (read-only reconciliation including CustomerLedger advances; never mutate Customer in GET)
    const customerTotals = customerAgg[0] || { outstanding: 0, customerAdvances: 0 };
    const outstanding = Number(customerTotals.outstanding || 0);
    let customerAdvances = Number(customerTotals.customerAdvances || 0);

    const customerAdvanceRows: SummaryRow[] = [];
    const outstandingRows: SummaryRow[] = (customersWithOutstanding as any[]).map((c: any) => ({
      ref: c.phone || c._id?.toString().slice(-6).toUpperCase() || "CUST",
      date: c.updatedAt ? new Date(c.updatedAt).toISOString() : undefined,
      summary: `${c.name || "Customer"} — Khata Udhar Baqaya`,
      amount: Number(c.outstandingBalance || 0),
      kind: "CUSTOMER" as const,
      targetId: c._id?.toString(),
      badge: "Khata Due",
    }));

    if (customersWithAdvance.length > 0) {
      const advCustIds = customersWithAdvance.map((c: any) => c._id);
      const [pendingAdvSales, activeCustRentals, openingAdvLedgers, latestLedgerAdvances] = await Promise.all([
        Sale.find({
          customer: { $in: advCustIds },
          status: { $in: ["PAYMENT_PENDING", "CHECKOUT", "DRAFT"] },
          totalPaid: { $gt: 0 },
        })
          .select("customer saleNumber totalPaid createdAt")
          .lean(),
        RentalBooking.find({
          customer: { $in: advCustIds },
          status: { $ne: "COMPLETED" },
          totalDepositHeld: { $gt: 0 },
        })
          .select("customer bookingNumber totalDepositHeld createdAt")
          .lean(),
        CustomerLedger.find({
          customer: { $in: advCustIds },
          type: "ADVANCE_DEPOSIT",
          referenceId: "OPENING-BAL",
        })
          .select("customer credit createdAt")
          .lean(),
        CustomerLedger.aggregate([
          { $match: { customer: { $in: advCustIds } } },
          { $sort: { createdAt: -1, _id: -1 } },
          {
            $group: {
              _id: "$customer",
              latestAdvance: { $first: "$runningAdvance" },
              latestRef: { $first: "$referenceId" },
              latestDate: { $first: "$createdAt" },
              latestType: { $first: "$type" },
            },
          },
        ]),
      ]);

      const latestLedgerAdvMap = new Map<
        string,
        { latestAdvance: number; latestRef?: string; latestDate?: Date; latestType?: string }
      >();
      for (const row of latestLedgerAdvances as any[]) {
        if (typeof row.latestAdvance === "number") {
          latestLedgerAdvMap.set(row._id.toString(), {
            latestAdvance: Math.max(0, Number(row.latestAdvance)),
            latestRef: row.latestRef,
            latestDate: row.latestDate,
            latestType: row.latestType,
          });
        }
      }

      let reconciledAdvanceTotal = 0;

      for (const cust of customersWithAdvance as any[]) {
        const cIdStr = cust._id.toString();
        const custPendingSales = (pendingAdvSales as any[]).filter(
          (s) => s.customer?.toString() === cIdStr
        );
        const custActiveRentals = (activeCustRentals as any[]).filter(
          (r) => r.customer?.toString() === cIdStr
        );
        const pendingSaleAdv = custPendingSales.reduce((sum, s) => sum + Number(s.totalPaid || 0), 0);
        const activeRentalAdv = custActiveRentals.reduce((sum, r) => sum + Number(r.totalDepositHeld || 0), 0);
        const openingAdv = (openingAdvLedgers as any[])
          .filter((l) => l.customer?.toString() === cIdStr)
          .reduce((sum, l) => sum + Number(l.credit || 0), 0);
        const ledgerMeta = latestLedgerAdvMap.get(cIdStr);
        const ledgerAdv = ledgerMeta ? ledgerMeta.latestAdvance : openingAdv;

        const trueActiveAdvance = Math.max(pendingSaleAdv + activeRentalAdv, ledgerAdv);
        reconciledAdvanceTotal += trueActiveAdvance;

        if (trueActiveAdvance > 0) {
          const primaryRental = custActiveRentals[0];
          const primaryPendingSale = custPendingSales[0];
          const custLabel = `${cust.name || "Customer"}${cust.phone ? ` (${cust.phone})` : ""}`;
          let advRef = ledgerMeta?.latestRef || cust.phone || "ADVANCE";
          let advDate: any = ledgerMeta?.latestDate || cust.updatedAt;
          let advSummary = `${custLabel} — Ledger / Khata Advance`;
          let advBadge = "Ledger";

          if (primaryRental && activeRentalAdv >= pendingSaleAdv) {
            advRef = primaryRental.bookingNumber || advRef;
            advDate = primaryRental.createdAt || advDate;
            advSummary =
              ledgerAdv > pendingSaleAdv + activeRentalAdv
                ? `${custLabel} — Active Rental + Extra Ledger`
                : `${custLabel} — Active Rental Deposit`;
            advBadge = "Rental";
          } else if (primaryPendingSale) {
            advRef = primaryPendingSale.saleNumber || advRef;
            advDate = primaryPendingSale.createdAt || advDate;
            advSummary = `${custLabel} — Pending Advance Booking`;
            advBadge = "Advance";
          }

          customerAdvanceRows.push({
            ref: advRef,
            date: advDate ? new Date(advDate).toISOString() : undefined,
            summary: advSummary,
            amount: trueActiveAdvance,
            kind: "CUSTOMER",
            targetId: cIdStr,
            badge: advBadge,
          });
        }
      }

      customerAdvances = reconciledAdvanceTotal;
      customerAdvanceRows.sort((a, b) => b.amount - a.amount);
    }

    return NextResponse.json({
      success: true,
      data: {
        date: dateStr,
        startDate: startDateParam,
        endDate: endDateParam,
        locationId,
        cards: {
          totalSales: combinedTotalSales,
          retailSalesOnly: totalSales,
          repairRevenue: repairTotalRevenue,
          repairLaborCharges,
          repairPartsCost,
          repairDirectCost,
          repairCount,
          repairProfit,
          technicianBreakdown,
          accruedSales,
          accruedProfit,
          cashReceived,
          card,
          bankOnline,
          exchangeCredit,
          customerSettlementReceived,
          stockInAcquisitionValue,
          directStockIn,
          exchangeStockIn,
          supplierStockIn,
          stockOutValue,
          cogs: combinedCogs,
          cashRefunds,
          customerSettlementPaid,
          realizedRentalIncome,
          grossProfit,
          deliveryCollected,
          expenses,
          atifWithdrawTotal,
          atifDepositTotal,
          cashPurchasingTotal,
          netProfit,
          outstanding,
          customerAdvances,
        },
        canInspectCards,
        cardBreakdowns: canInspectCards
          ? {
              cashReceived: cashReceivedRows,
              card: cardRows,
              bankOnline: bankOnlineRows,
              exchangeCredit: exchangeCreditRows,
              directStockIn: directStockInRows,
              exchangeStockIn: exchangeStockInRows,
              cashRefunds: cashRefundRows,
              settlementPaid: settlementPaidRows,
              expenses: expenseRows,
              outstanding: outstandingRows,
              customerAdvances: customerAdvanceRows,
              rentalStockOut: rentalStockOutRows,
            }
          : undefined,
        salesmanStockIn: Object.fromEntries(salesmanStockInMap),
        rawSales: enrichedSales,
        repairs: repairsDocs,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to generate daily closing report." },
      { status: 500 }
    );
  }
}
