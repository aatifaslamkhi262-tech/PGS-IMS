import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Sale } from "@/models/Sale";
import { Payment } from "@/models/Payment";
import { Location } from "@/models/Location";
import { createSaleInput, completeSale } from "@/lib/salesEngine";
import { recordPayment } from "@/lib/paymentEngine";
import { SerialNumber } from "@/models/SerialNumber";
import { CashSession } from "@/models/CashSession";
import { recordCashMovement } from "@/lib/cashSessionEngine";

import { recordCustomerLedgerEntry } from "@/lib/customerLedgerEngine";

export async function POST(request: Request) {
  try {
    await dbConnect();
    const body = await request.json();

    const {
      locationId,
      customerId,
      customerName,
      customerPhone,
      salesmanId,
      items,
      advanceAmount,
      paymentMethod,
      createdBy,
    } = body;

    if (!advanceAmount || advanceAmount <= 0) {
      return NextResponse.json(
        { success: false, error: "Advance down-payment amount is required." },
        { status: 400 }
      );
    }

    // 1. Create Sale in PAYMENT_PENDING status with ADVANCE_BOOKING source
    const saleResult = await createSaleInput({
      creationMode: "DIRECT_COUNTER",
      saleSource: "ADVANCE_BOOKING",
      locationId,
      customerId,
      customerName,
      customerPhone,
      salesmanId,
      items,
      createdBy: createdBy || "system",
    });

    const sale = saleResult.sale;
    sale.status = "PAYMENT_PENDING";
    await sale.save();

    // 2. Mark serials as Reserved if serialized
    for (const item of sale.items) {
      if (item.serialNumbers && item.serialNumbers.length > 0) {
        await SerialNumber.updateMany(
          { serialNumber: { $in: item.serialNumbers } },
          { $set: { status: "Reserved" } }
        );
      }
    }

    const targetCustId = sale.customer ? sale.customer.toString() : customerId;

    // 3. Record Advance Payment
    const payment = await recordPayment({
      saleId: sale._id.toString(),
      locationId,
      customerId: targetCustId,
      paymentMethod: paymentMethod || "CASH",
      amount: advanceAmount,
      receivedBy: createdBy || "system",
      notes: `Advance Down-Payment for Booking #${sale.saleNumber}`,
    });

    if (targetCustId) {
      await recordCustomerLedgerEntry({
        customerId: targetCustId,
        type: "ADVANCE_DEPOSIT",
        amount: advanceAmount,
        referenceType: "Payment",
        referenceId: payment.paymentNumber,
        notes: `Advance Down-Payment for Booking #${sale.saleNumber}`,
        createdBy: createdBy || "system",
      });
    }

    const locationDoc = await Location.findById(locationId);

    const receiptData = {
      invoiceNumber: `ADV-${sale.saleNumber}`,
      saleNumber: sale.saleNumber,
      date: sale.createdAt || new Date(),
      locationName: locationDoc?.name || "Warehouse",
      cashierName: createdBy || "system",
      salesmanName: sale.salesmanName || "Direct Counter",
      customerName: sale.customerName || "Walk-in Customer",
      customerPhone: sale.customerPhone || "N/A",
      items: (sale.items || []).map((it: any) => ({
        productName: it.productName || "Product Item",
        condition: it.condition || "New",
        quantity: it.quantity || 1,
        unitPrice: it.unitPrice || 0,
        lineTotal: it.lineTotal || (it.quantity * (it.unitPrice || 0)),
        serialNumbers: it.serialNumbers || [],
      })),
      subtotal: sale.subtotal,
      discountAmount: sale.discountAmount || 0,
      deliveryCharges: sale.deliveryCharges || 0,
      totalAmount: sale.totalAmount,
      paidAmount: advanceAmount,
      changeDue: 0,
      balanceDue: sale.totalAmount - advanceAmount,
      status: "ADVANCE_BOOKED",
      payments: [
        {
          method: paymentMethod || "CASH",
          amount: advanceAmount,
        },
      ],
    };

    return NextResponse.json({
      success: true,
      data: {
        sale,
        advancePayment: payment,
        receiptData,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create advance booking." },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    await dbConnect();
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

    // Execute final SALE_OUT, balance collection & final tax invoice generation
    const completedResult = await completeSale({
      saleId: sale._id.toString(),
      completedBy: processedBy || "system",
      paymentAllocations: remainingPaymentAllocations,
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
      cashierName: processedBy || "system",
      salesmanName: completedSaleDoc.salesmanName || "Direct Counter",
      customerName: completedSaleDoc.customerName || "Walk-in Customer",
      customerPhone: completedSaleDoc.customerPhone || "N/A",
      items: (completedSaleDoc.items || []).map((it: any) => ({
        productName: it.productName || "Product Item",
        condition: it.condition || "New",
        quantity: it.quantity || 1,
        unitPrice: it.unitPrice || 0,
        lineTotal: it.lineTotal || (it.quantity * (it.unitPrice || 0)),
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

    // 1. Unreserve serial numbers if any
    for (const item of sale.items) {
      if (item.serialNumbers && item.serialNumbers.length > 0) {
        await SerialNumber.updateMany(
          { serialNumber: { $in: item.serialNumbers } },
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
        cashier: activeCashSession.cashier || "system",
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
        createdBy: "system",
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

