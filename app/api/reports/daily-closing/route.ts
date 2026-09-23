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

    const startDate = new Date(dateStr);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(dateStr);
    endDate.setHours(23, 59, 59, 999);

    // 1. Sales Query Filter
    const saleQuery: any = {
      createdAt: { $gte: startDate, $lte: endDate },
      status: "COMPLETED",
    };
    if (locationId !== "ALL") {
      saleQuery.location = locationId;
    }

    const sales = await Sale.find(saleQuery).lean();

    let totalSales = 0;
    let cogs = 0;
    let stockOutValue = 0;

    for (const s of sales) {
      // Filter staff if specified
      if (staffId !== "ALL") {
        if (staffId === "DIRECT" && s.salesman) continue;
        if (staffId !== "DIRECT" && s.salesman?.toString() !== staffId) continue;
      }

      totalSales += s.totalAmount || 0;
      cogs += s.totalCost || 0;

      for (const item of s.items || []) {
        stockOutValue += (item.unitPrice || 0) * (item.quantity || 1);
      }
    }

    // 2. Payments & Channels Query
    const paymentQuery: any = {
      createdAt: { $gte: startDate, $lte: endDate },
      status: "PAID",
    };
    if (locationId !== "ALL") {
      paymentQuery.location = locationId;
    }

    const payments = await Payment.find(paymentQuery).lean();

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

    // 3. Inventory Movements (Stock-In Acquisition, Returns, Exchanges, Customer Buybacks)
    const movementQuery: any = {
      date: { $gte: startDate, $lte: endDate },
    };
    if (locationId !== "ALL") {
      movementQuery.$or = [
        { sourceLocation: locationId },
        { destinationLocation: locationId },
      ];
    }

    const movements = await InventoryMovement.find(movementQuery).lean();

    let stockInAcquisitionValue = 0;
    let customerSettlementReceived = 0;
    let cashRefunds = 0;
    let customerSettlementPaid = 0;

    for (const m of (movements as any[])) {
      // Stock-In Acquisition Value represents business inventory acquisitions (Supplier Purchases & Customer Buybacks ONLY).
      // Customer Returns are reversals of previous sales and do NOT count as new acquisition value.
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

    // 4. Expenses
    const expenseQuery: any = {
      date: { $gte: startDate, $lte: endDate },
      status: "Approved",
    };
    if (locationId !== "ALL") {
      expenseQuery.location = locationId;
    }

    const expensesDocs = await Expense.find(expenseQuery).lean();
    const expenses = expensesDocs.reduce((sum, e) => sum + Number(e.amount || 0), 0);

    // 5. Profit Metrics
    const grossProfit = totalSales - cogs;
    const netProfit = grossProfit - expenses;

    // 6. Outstanding & Customer Advances
    const customers = await Customer.find({ active: true }).select("outstandingBalance advanceBalance").lean();
    const outstanding = customers.reduce((sum, c) => sum + Number(c.outstandingBalance || 0), 0);
    const customerAdvances = customers.reduce((sum, c) => sum + Number(c.advanceBalance || 0), 0);

    return NextResponse.json({
      success: true,
      data: {
        date: dateStr,
        locationId,
        // 15 Required Stat Cards
        cards: {
          totalSales,
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
