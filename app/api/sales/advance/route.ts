import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Sale } from "@/models/Sale";
import { createSaleInput, completeSale } from "@/lib/salesEngine";
import { recordPayment } from "@/lib/paymentEngine";
import { SerialNumber } from "@/models/SerialNumber";

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

    // 3. Record Advance Payment
    const payment = await recordPayment({
      saleId: sale._id.toString(),
      locationId,
      customerId,
      paymentMethod: paymentMethod || "CASH",
      amount: advanceAmount,
      receivedBy: createdBy || "system",
      notes: `Advance Down-Payment for Booking #${sale.saleNumber}`,
    });

    return NextResponse.json({
      success: true,
      data: {
        sale,
        advancePayment: payment,
        receiptData: {
          invoiceNumber: `ADV-${sale.saleNumber}`,
          saleNumber: sale.saleNumber,
          customerName: sale.customerName || "Walk-in Customer",
          totalAmount: sale.totalAmount,
          advancePaid: advanceAmount,
          balanceDue: sale.totalAmount - advanceAmount,
          status: "ADVANCE_BOOKED",
          items: sale.items,
        },
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

    // Note: completeSale safely transitions linked serial numbers from Reserved -> Sold directly.

    // Execute final SALE_OUT, balance collection & final tax invoice generation
    const completedResult = await completeSale({
      saleId: sale._id.toString(),
      completedBy: processedBy || "system",
      paymentAllocations: remainingPaymentAllocations,
    });

    return NextResponse.json({
      success: true,
      data: completedResult,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to finalize advance pickup." },
      { status: 500 }
    );
  }
}
