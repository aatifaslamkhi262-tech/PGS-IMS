

import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Sale } from "@/models/Sale";
import { Payment } from "@/models/Payment";
import { InventoryMovement } from "@/models/InventoryMovement";
import { Expense } from "@/models/Expense";
import { Customer } from "@/models/Customer";
import { verifyRole } from "@/lib/auth/rbac";

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Salesman", "Branch"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get("date") || new Date().toISOString().slice(0, 10);
    const locationId = searchParams.get("locationId") || "ALL";
    const staffId = searchParams.get("staffId") || "ALL";

    // 1. Build Pakistan Standard Time (PKT - Asia/Karachi, UTC+5) Date Window
    const [year, month, day] = dateStr.split("-").map(Number);
    // PKT 00:00:00 = UTC Previous Day 19:00:00
    const startDate = new Date(Date.UTC(year, month - 1, day - 1, 19, 0, 0, 0));
    // PKT 23:59:59.999 = UTC Same Day 18:59:59.999
    const endDate = new Date(Date.UTC(year, month - 1, day, 18, 59, 59, 999));

    // 1. Build Query Filters for Independent Data Sources
    const saleQuery: any = {
      createdAt: { $gte: startDate, $lte: endDate },
      status: "COMPLETED",
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
      date: { $gte: startDate, $lte: endDate },
    };
    if (locationId !== "ALL") {
      movementQuery.$or = [
        { sourceLocation: locationId },
        { destinationLocation: locationId },
      ];
    }

    const expenseQuery: any = {
      date: { $gte: startDate, $lte: endDate },
      status: "Approved",
    };
    if (locationId !== "ALL") {
      expenseQuery.location = locationId;
    }

    // 2. Parallel Database Execution for All 5 Independent Queries
    const [sales, payments, movements, expensesDocs, customerAgg] = await Promise.all([
      Sale.find(saleQuery).lean(),
      Payment.find(paymentQuery).lean(),
      InventoryMovement.find(movementQuery).lean(),
      Expense.find(expenseQuery).lean(),
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
    ]);

    // 3. Process Sales & Profit Metrics
    let totalSales = 0;
    let accruedSales = 0;
    let accruedProfit = 0;
    let cogs = 0;
    let stockOutValue = 0;

    for (const s of sales) {
      // Filter staff if specified
      if (staffId !== "ALL") {
        if (staffId === "DIRECT" && s.salesman) continue;
        if (staffId !== "DIRECT" && s.salesman?.toString() !== staffId) continue;
      }

      const saleProfit = (s.totalAmount || 0) - (s.totalCost || 0);

      if (s.isAccrued) {
        accruedSales += s.totalAmount || 0;
        accruedProfit += saleProfit;
      } else {
        totalSales += s.totalAmount || 0;
        cogs += s.totalCost || 0;
      }

      for (const item of s.items || []) {
        const itemCost = item.unitCost !== undefined && item.unitCost >= 0 ? item.unitCost : 0;
        stockOutValue += itemCost * (item.quantity || 1);
      }
    }

    // 4. Process Payments & Payment Channels
    let cashReceived = 0;
    let card = 0;
    let bankOnline = 0;

    for (const p of payments) {
      if (p.paymentMethod === "CASH") {
        cashReceived += p.amount || 0;
      } else if (p.paymentMethod === "CARD") {
        card += p.amount || 0;
      } else if (p.paymentMethod === "BANK_TRANSFER" || p.paymentMethod === "ONLINE_GATEWAY") {
        bankOnline += p.amount || 0;
      }
    }

    // 5. Process Inventory Movements
    let stockInAcquisitionValue = 0;
    let customerSettlementReceived = 0;
    let cashRefunds = 0;
    let customerSettlementPaid = 0;

    for (const m of (movements as any[])) {
      if (m.type === "SUPPLIER_PURCHASE" || m.type === "CUSTOMER_BUYBACK" || m.type === "PURCHASE_RECEIVING" || (m.type === "STOCK_IN" && m.referenceType !== "RETURN_EXCHANGE")) {
        stockInAcquisitionValue += m.totalCost || 0;
      }

      if (m.referenceType === "RETURN_EXCHANGE") {
        if (m.type === "SALE_OUT") {
          customerSettlementReceived += m.totalCost || 0;
        } else if (m.type === "RETURN_IN") {
          customerSettlementPaid += m.totalCost || 0;
        }
      }
    }

    // 6. Process Expenses
    const expenses = expensesDocs.reduce((sum, e) => sum + Number(e.amount || 0), 0);

    // 7. Profit Metrics
    const grossProfit = totalSales - cogs;
    const netProfit = grossProfit - expenses;

    // 8. Outstanding & Customer Advances via MongoDB Aggregate Result
    const customerTotals = customerAgg[0] || { outstanding: 0, customerAdvances: 0 };
    const outstanding = Number(customerTotals.outstanding || 0);
    const customerAdvances = Number(customerTotals.customerAdvances || 0);

    return NextResponse.json({
      success: true,
      data: {
        date: dateStr,
        locationId,
        cards: {
          totalSales,
          accruedSales,
          accruedProfit,
          cashReceived,
          card,
          bankOnline,
          customerSettlementReceived,
          stockInAcquisitionValue,
          stockOutValue,
          cogs,
          cashRefunds,
          customerSettlementPaid,
          grossProfit,
          expenses,
          netProfit,
          outstanding,
          customerAdvances,
        },
        rawSales: sales,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to generate daily closing report." },
      { status: 500 }
    );
  }
}
