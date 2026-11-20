import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/lib/db";
import { Sale } from "@/models/Sale";
import { Payment } from "@/models/Payment";
import { Location } from "@/models/Location";
import { User } from "@/models/User";
import { createSaleInput, completeSale, generatePaymentNumber } from "@/lib/salesEngine";
import { recordPayment } from "@/lib/paymentEngine";
import { SerialNumber } from "@/models/SerialNumber";
import { CashSession } from "@/models/CashSession";
import { recordCashMovement } from "@/lib/cashSessionEngine";
import { recordCustomerLedgerEntry } from "@/lib/customerLedgerEngine";
import { verifyRole } from "@/lib/auth/rbac";
import { lockIdempotencyKey, completeIdempotencyKey, failIdempotencyKey } from "@/lib/idempotencyEngine";

export async function POST(request: Request) {
  let idempotencyKeyHeader = "";
  let createdSaleId: string | null = null;
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Salesman", "Branch"]);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    idempotencyKeyHeader = request.headers.get("x-idempotency-key") || body.idempotencyKey || "";

    if (idempotencyKeyHeader) {
      const lockRes = await lockIdempotencyKey(idempotencyKeyHeader, body, "/api/sales/advance");
      if (lockRes.isDuplicate) {
        return NextResponse.json(
          lockRes.responseBody || { success: false, error: lockRes.error },
          { status: lockRes.statusCode || 409 }
        );
      }
    }

    const {
      locationId,
      customerId,
      customerName,
      customerPhone,
      salesmanId,
      salesmanName,
      items,
      advanceAmount,
      discountAmount,
      paymentMethod,
      paymentAllocations,
      expectedDate,
      notes,
      createdBy,
    } = body;

    const cleanAllocations: Array<{
      method: "CASH" | "CARD" | "BANK_TRANSFER" | "ONLINE_GATEWAY" | "COD" | "CUSTOMER_ADVANCE" | "EXCHANGE_CREDIT";
      amount: number;
      referenceNumber?: string;
      notes?: string;
    }> =
      Array.isArray(paymentAllocations) && paymentAllocations.length > 0
        ? paymentAllocations
            .map((a: any) => ({
              method: a.method || "CASH",
              amount: Number(a.amount || 0),
              referenceNumber: a.referenceNumber ? String(a.referenceNumber).trim() : undefined,
              notes: a.notes ? String(a.notes).trim() : undefined,
            }))
            .filter((a) => a.amount > 0)
        : Number(advanceAmount || 0) > 0
        ? [{ method: paymentMethod || "CASH", amount: Number(advanceAmount || 0) }]
        : [];

    const advAmt = cleanAllocations.reduce((sum, a) => sum + a.amount, 0);
    if (!advAmt || advAmt <= 0 || cleanAllocations.length === 0) {
      if (idempotencyKeyHeader) await failIdempotencyKey(idempotencyKeyHeader);
      return NextResponse.json(
        { success: false, error: "Advance down-payment amount must be greater than 0." },
        { status: 400 }
      );
    }

    if (!locationId || locationId === "ALL") {
      if (idempotencyKeyHeader) await failIdempotencyKey(idempotencyKeyHeader);
      return NextResponse.json(
        { success: false, error: "Please select a specific Store Location for Advance Booking." },
        { status: 400 }
      );
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      if (idempotencyKeyHeader) await failIdempotencyKey(idempotencyKeyHeader);
      return NextResponse.json(
        { success: false, error: "At least one product item is required for Advance Booking." },
        { status: 400 }
      );
    }

    const cleanCustName = customerName ? String(customerName).trim() : "";
    const cleanCustPhone = customerPhone ? String(customerPhone).trim() : "";
    if (!customerId && (!cleanCustName || cleanCustName === "Advance Booking Customer") && !cleanCustPhone) {
      if (idempotencyKeyHeader) await failIdempotencyKey(idempotencyKeyHeader);
      return NextResponse.json(
        { success: false, error: "Customer Name and/or Phone is required for Advance Booking ledger tracking." },
        { status: 400 }
      );
    }

    const actorUsername = auth.user.username || createdBy || "system";

    let resolvedSalesmanName = salesmanName;
    if (salesmanId && !resolvedSalesmanName) {
      const salesmanDoc = await User.findById(salesmanId).select("name username").lean();
      if (salesmanDoc) {
        resolvedSalesmanName = (salesmanDoc as any).name || (salesmanDoc as any).username;
      }
    }

    const noteParts: string[] = [];
    if (expectedDate && String(expectedDate).trim()) {
      noteParts.push(`Expected Pickup: ${String(expectedDate).trim()}`);
    }
    if (notes && String(notes).trim()) {
      noteParts.push(String(notes).trim());
    }
    const combinedNotes = noteParts.length > 0 ? noteParts.join(" • ") : undefined;

    // 1. Create Sale in PAYMENT_PENDING status with ADVANCE_BOOKING source
    const saleResult = await createSaleInput({
      creationMode: "DIRECT_COUNTER",
      saleSource: "ADVANCE_BOOKING",
      locationId,
      customerId,
      customerName: cleanCustName || undefined,
      customerPhone: cleanCustPhone || undefined,
      salesmanId,
      salesmanName: resolvedSalesmanName,
      items,
      discountAmount: Number(discountAmount || 0),
      notes: combinedNotes,
      createdBy: actorUsername,
      allowDeferredSerials: true,
    });

    const sale = saleResult.sale;
    createdSaleId = sale._id.toString();

    if (advAmt > sale.totalAmount + 0.01) {
      await Sale.deleteOne({ _id: sale._id });
      createdSaleId = null;
      if (idempotencyKeyHeader) await failIdempotencyKey(idempotencyKeyHeader);
      return NextResponse.json(
        {
          success: false,
          error: `Advance deposit (Rs. ${advAmt.toLocaleString()}) cannot exceed total booking amount (Rs. ${sale.totalAmount.toLocaleString()}).`,
        },
        { status: 400 }
      );
    }

    const session = await mongoose.startSession();
    try {
      session.startTransaction();
    } catch (txErr) {
      session.endSession();
      await Sale.deleteOne({ _id: sale._id }).catch(() => {});
      createdSaleId = null;
      throw txErr;
    }

    let createdPayments: any[] = [];
    try {
      const txSale = await Sale.findById(sale._id).session(session);
      if (!txSale) throw new Error("Advance booking sale record disappeared during transaction.");

      txSale.status = "PAYMENT_PENDING";
      txSale.totalPaid = advAmt;
      txSale.balanceDue = Math.max(0, txSale.totalAmount - advAmt);
      await txSale.save({ session });

      // 2. Mark serials as Reserved if serialized
      for (const item of txSale.items) {
        if (item.serialNumbers && item.serialNumbers.length > 0) {
          await SerialNumber.updateMany(
            { product: item.product, serialNumber: { $in: item.serialNumbers }, status: "Available" },
            { $set: { status: "Reserved" } },
            { session }
          );
        }
      }

      const targetCustId = txSale.customer ? txSale.customer.toString() : customerId;

      const activeCashSession = cleanAllocations.some((a) => a.method === "CASH")
        ? (await CashSession.findOne({
            location: locationId,
            cashier: actorUsername,
            status: "OPEN",
          }).session(session)) ||
          (await CashSession.findOne({
            location: locationId,
            status: "OPEN",
          }).session(session))
        : null;

      // 3. Record Advance Payment(s) (Single or Split)
      const usedPaymentNums = new Set<string>();
      for (const alloc of cleanAllocations) {
        let payNum = await generatePaymentNumber(session);
        while (usedPaymentNums.has(payNum)) {
          const parts = payNum.split("-");
          const seq = parseInt(parts[parts.length - 1], 10) || 1;
          parts[parts.length - 1] = String(seq + 1).padStart(3, "0");
          payNum = parts.join("-");
        }
        usedPaymentNums.add(payNum);

        const pDoc = await recordPayment(
          {
            saleId: txSale._id.toString(),
            locationId,
            customerId: targetCustId,
            paymentMethod: alloc.method,
            amount: alloc.amount,
            paymentNumber: payNum,
            referenceNumber: alloc.referenceNumber,
            receivedBy: actorUsername,
            notes: alloc.notes || `Advance Down-Payment for Booking #${txSale.saleNumber}`,
          },
          session
        );
        createdPayments.push(pDoc);

        if (alloc.method === "CASH" && activeCashSession) {
          await recordCashMovement(
            {
              sessionId: activeCashSession._id.toString(),
              locationId: locationId.toString(),
              cashier: actorUsername,
              type: "CASH_SALE",
              amount: alloc.amount,
              direction: "IN",
              referenceType: "Payment",
              referenceId: pDoc.paymentNumber,
              notes: `Advance deposit cash collection for Booking #${txSale.saleNumber}`,
            },
            session
          );
        }
      }

      // 4. Record Customer Ledger Advance Deposit (total advance paid)
      if (targetCustId) {
        await recordCustomerLedgerEntry(
          {
            customerId: targetCustId,
            type: "ADVANCE_DEPOSIT",
            amount: advAmt,
            referenceType: "Payment",
            referenceId: createdPayments[0]?.paymentNumber || txSale.saleNumber,
            notes: `Advance Down-Payment for Booking #${txSale.saleNumber}`,
            createdBy: actorUsername,
          },
          session
        );
      }

      await session.commitTransaction();
      session.endSession();
      createdSaleId = null;
    } catch (innerErr) {
      await session.abortTransaction();
      session.endSession();
      await Sale.deleteOne({ _id: sale._id }).catch(() => {});
      createdSaleId = null;
      throw innerErr;
    }

    const updatedSale = (await Sale.findById(sale._id).lean()) || sale;
    const locationDoc = await Location.findById(locationId).lean();

    const receiptData = {
      invoiceNumber: `ADV-${updatedSale.saleNumber}`,
      saleNumber: updatedSale.saleNumber,
      date: updatedSale.createdAt || new Date(),
      locationName: (locationDoc as any)?.name || "Warehouse",
      cashierName: actorUsername,
      salesmanName: updatedSale.salesmanName || "Direct Counter",
      customerName: updatedSale.customerName || "Walk-in Customer",
      customerPhone: updatedSale.customerPhone || "N/A",
      items: (updatedSale.items || []).map((it: any) => ({
        productName: it.productName || "Product Item",
        condition: it.condition || "New",
        quantity: it.quantity || 1,
        unitPrice: it.unitPrice || 0,
        lineTotal: it.lineTotal || it.quantity * (it.unitPrice || 0),
        serialNumbers: it.serialNumbers || [],
      })),
      subtotal: updatedSale.subtotal,
      discountAmount: updatedSale.discountAmount || 0,
      deliveryCharges: updatedSale.deliveryCharges || 0,
      totalAmount: updatedSale.totalAmount,
      paidAmount: advAmt,
      changeDue: 0,
      balanceDue: Math.max(0, updatedSale.totalAmount - advAmt),
      status: "ADVANCE_BOOKED",
      payments: cleanAllocations.map((a) => ({
        method: a.method,
        amount: a.amount,
      })),
    };

    const respData = {
      success: true,
      data: {
        sale: updatedSale,
        advancePayment: createdPayments[0],
        advancePayments: createdPayments,
        receiptData,
      },
    };
    if (idempotencyKeyHeader) await completeIdempotencyKey(idempotencyKeyHeader, 200, respData);
    return NextResponse.json(respData);
  } catch (error: any) {
    if (createdSaleId) {
      await Sale.deleteOne({ _id: createdSaleId, status: { $ne: "COMPLETED" } }).catch(() => {});
    }
    if (idempotencyKeyHeader) await failIdempotencyKey(idempotencyKeyHeader);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create advance booking." },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant"]);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const { saleId, remainingPaymentAllocations, processedBy } = body;

    const sale = await Sale.findById(saleId);
    if (!sale) {
      return NextResponse.json(
        { success: false, error: "Advance booking sale not found." },
        { status: 404 }
      );
    }

    if (sale.status === "COMPLETED") {
      return NextResponse.json(
        { success: false, error: "Sale is already completed." },
        { status: 400 }
      );
    }

    const actorUsername = auth.user.username || processedBy || "system";

    // Execute final SALE_OUT, balance collection & final tax invoice generation
    const completedResult = await completeSale({
      saleId: sale._id.toString(),
      completedBy: actorUsername,
      paymentAllocations: Array.isArray(remainingPaymentAllocations) ? remainingPaymentAllocations : [],
    });

    const completedSaleDoc = completedResult.sale || sale;
    const invoiceDoc = completedResult.invoice;

    const allPayments = await Payment.find({ sale: completedSaleDoc._id, status: "PAID" }).lean();
    const totalPaidSum = allPayments.reduce((sum, p) => sum + Number(p.amount), 0);

    const receiptData = {
      invoiceNumber: invoiceDoc?.invoiceNumber || completedSaleDoc.saleNumber,
      saleNumber: completedSaleDoc.saleNumber,
      date: invoiceDoc?.createdAt || new Date(),
      locationName: completedSaleDoc.locationName || "Warehouse",
      cashierName: actorUsername,
      salesmanName: completedSaleDoc.salesmanName || "Direct Counter",
      customerName: completedSaleDoc.customerName || "Walk-in Customer",
      customerPhone: completedSaleDoc.customerPhone || "N/A",
      items: (completedSaleDoc.items || []).map((it: any) => ({
        productName: it.productName || "Product Item",
        condition: it.condition || "New",
        quantity: it.quantity || 1,
        unitPrice: it.unitPrice || 0,
        lineTotal: it.lineTotal || it.quantity * (it.unitPrice || 0),
        serialNumbers: it.serialNumbers || [],
      })),
      subtotal: completedSaleDoc.subtotal,
      discountAmount: completedSaleDoc.discountAmount || 0,
      deliveryCharges: completedSaleDoc.deliveryCharges || 0,
      totalAmount: completedSaleDoc.totalAmount,
      paidAmount: totalPaidSum,
      changeDue: 0,
      balanceDue: 0,
      status: "COMPLETED",
      payments: allPayments.map((p) => ({
        method: p.paymentMethod,
        amount: p.amount,
      })),
    };

    return NextResponse.json({
      success: true,
      data: {
        ...completedResult,
        receiptData,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to finalize advance pickup." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant"]);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const saleId = searchParams.get("saleId");
    if (!saleId) {
      return NextResponse.json({ success: false, error: "saleId is required" }, { status: 400 });
    }

    const sale = await Sale.findById(saleId);
    if (!sale) {
      return NextResponse.json({ success: false, error: "Sale not found" }, { status: 404 });
    }

    if (sale.status === "CANCELLED") {
      return NextResponse.json({ success: true, message: "Sale is already cancelled.", data: sale });
    }

    // 1. Unreserve ONLY serial numbers that are still Reserved
    for (const item of sale.items) {
      if (item.serialNumbers && item.serialNumbers.length > 0) {
        await SerialNumber.updateMany(
          { product: item.product, serialNumber: { $in: item.serialNumbers }, status: "Reserved" },
          { $set: { status: "Available", location: sale.locationName || "Warehouse" } }
        );
      }
    }

    // 2. Refund payments recorded for this sale
    const allPaidPayments = await Payment.find({ sale: sale._id, status: "PAID" });
    const totalPaidSum = allPaidPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    const cashPayments = allPaidPayments.filter((p) => p.paymentMethod === "CASH");
    const totalCashPaid = cashPayments.reduce((sum, p) => sum + Number(p.amount), 0);

    await Payment.updateMany({ sale: sale._id }, { $set: { status: "REFUNDED" } });

    // 3. Log cash movement if active cash session exists
    const activeCashSession = await CashSession.findOne({
      location: sale.location,
      status: "OPEN",
    });

    if (activeCashSession && totalCashPaid > 0) {
      await recordCashMovement({
        sessionId: activeCashSession._id.toString(),
        locationId: sale.location.toString(),
        cashier: auth.user.username || activeCashSession.cashier || "system",
        type: "CASH_REFUND",
        amount: totalCashPaid,
        direction: "OUT",
        referenceType: "Sale",
        referenceId: sale.saleNumber,
        notes: `Cash refund for cancelled advance booking ${sale.saleNumber}`,
      });
    }

    // 4. Update Customer Ledger to refund/reverse advance balance if customer exists
    if (sale.customer && totalPaidSum > 0) {
      await recordCustomerLedgerEntry({
        customerId: sale.customer.toString(),
        type: "ADVANCE_REFUND",
        amount: totalPaidSum,
        referenceType: "AdvanceBooking",
        referenceId: sale.saleNumber,
        notes: `Advance deposit refund for cancelled booking #${sale.saleNumber}`,
        createdBy: auth.user.username || "system",
      });
    }

    // 5. Update sale status to CANCELLED
    sale.status = "CANCELLED";
    sale.cancelledAt = new Date();
    sale.cancellationReason = "Advance booking cancelled by user";
    await sale.save();

    return NextResponse.json({
      success: true,
      message: "Advance booking cancelled, serials unreserved, and payment refunded successfully.",
      data: sale,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to cancel advance booking." },
      { status: 500 }
    );
  }
}

