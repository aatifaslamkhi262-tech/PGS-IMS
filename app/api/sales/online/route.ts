import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Sale } from "@/models/Sale";
import { createSaleInput, completeSale } from "@/lib/salesEngine";
import { SerialNumber } from "@/models/SerialNumber";

export async function POST(request: Request) {
  try {
    await dbConnect();
    const body = await request.json();

    const {
      saleSource, // WEBSITE | WHATSAPP | INSTAGRAM | PHONE
      locationId,
      customerName,
      customerPhone,
      items,
      deliveryCharges,
      notes,
      createdBy,
    } = body;

    const saleResult = await createSaleInput({
      creationMode: "DIRECT_COUNTER",
      saleSource: saleSource || "WEBSITE",
      locationId,
      customerName,
      customerPhone,
      items,
      deliveryCharges,
      notes,
      createdBy: createdBy || "online-system",
    });

    const sale = saleResult.sale;
    sale.status = "DRAFT"; // Received state
    await sale.save();

    return NextResponse.json({
      success: true,
      data: sale,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create online order." },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    await dbConnect();
    const body = await request.json();
    const { saleId, action, trackingNumber, courierName, processedBy, paymentMethod } = body;

    const sale = await Sale.findById(saleId);
    if (!sale) {
      return NextResponse.json(
        { success: false, error: "Online order not found." },
        { status: 404 }
      );
    }

    // Action 1: PICK_PACK -> Reserve stock & serials (No SALE_OUT yet)
    if (action === "PICK_PACK") {
      sale.status = "CHECKOUT";
      for (const item of sale.items) {
        if (item.serialNumbers && item.serialNumbers.length > 0) {
          await SerialNumber.updateMany(
            { serialNumber: { $in: item.serialNumbers } },
            { $set: { status: "Reserved" } }
          );
        }
      }
      await sale.save();
      return NextResponse.json({ success: true, message: "Order picked & packed. Stock reserved.", data: sale });
    }

    // Action 2: DISPATCH -> Assign Courier & Tracking #
    if (action === "DISPATCH") {
      sale.status = "PAYMENT_PENDING";
      sale.notes = `Dispatched via ${courierName || "Courier"} (Tracking #: ${trackingNumber || "N/A"}). ${sale.notes || ""}`;
      await sale.save();
      return NextResponse.json({ success: true, message: "Order dispatched.", data: sale });
    }

    // Action 3: DELIVERED_COMPLETE -> Final Fulfillment & COD Settlement (Actual SALE_OUT occurs here!)
    if (action === "DELIVERED_COMPLETE") {
      // Unreserve serial numbers so completeSale can mark them 'Sold' and trigger SALE_OUT
      for (const item of sale.items) {
        if (item.serialNumbers && item.serialNumbers.length > 0) {
          await SerialNumber.updateMany(
            { serialNumber: { $in: item.serialNumbers } },
            { $set: { status: "Available" } }
          );
        }
      }

      const completedResult = await completeSale({
        saleId: sale._id.toString(),
        completedBy: processedBy || "system",
        paymentAllocations: [
          { method: paymentMethod || "CASH", amount: sale.totalAmount },
        ],
      });

      return NextResponse.json({
        success: true,
        message: "Online order delivered & COD cash settled. Inventory SALE_OUT completed.",
        data: completedResult,
      });
    }

    return NextResponse.json(
      { success: false, error: "Invalid action specified." },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update online order status." },
      { status: 500 }
    );
  }
}
