import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/lib/db";
import { RentalBooking } from "@/models/RentalBooking";
import { Product } from "@/models/Product";
import { Location } from "@/models/Location";
import { User } from "@/models/User";
import { InventoryMovement } from "@/models/InventoryMovement";
import { SerialNumber } from "@/models/SerialNumber";
import { CashSession } from "@/models/CashSession";
import { recordCashMovement } from "@/lib/cashSessionEngine";
import { deductInventoryWithAverageCost } from "@/lib/averageCostEngine";
import { resolveOrCreateCustomer } from "@/lib/customerResolver";
import { verifyRole } from "@/lib/auth/rbac";

export async function GET(request: Request) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Salesman", "Branch"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query") || "";

    if (!query) {
      const activeBookings = await RentalBooking.find({ status: { $ne: "COMPLETED" } })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();
      return NextResponse.json({ success: true, data: activeBookings });
    }

    const cleanQuery = query.trim();
    const bookings = await RentalBooking.find({
      $or: [
        { bookingNumber: { $regex: cleanQuery, $options: "i" } },
        { customerPhone: { $regex: cleanQuery, $options: "i" } },
        { customerName: { $regex: cleanQuery, $options: "i" } },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    return NextResponse.json({ success: true, data: bookings });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to search rental bookings." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Salesman", "Branch"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const {
      locationId,
      salesmanId,
      customerName,
      customerPhone,
      items, // array of { productId, depositPaid, perDayRate, serialNumber, condition }
      notes,
      processedBy,
    } = body;

    if (!locationId || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: "Location and at least one item are required for rental booking." },
        { status: 400 }
      );
    }

    const location = await Location.findById(locationId);
    if (!location) {
      return NextResponse.json({ success: false, error: "Location not found." }, { status: 400 });
    }

    let salesmanUser: any = null;
    if (salesmanId) {
      salesmanUser = await User.findById(salesmanId);
    }

    const customerId = await resolveOrCreateCustomer({
      customerName: customerName || "Walk-in Rental Customer",
      customerPhone: customerPhone || undefined,
    });

    const session = await mongoose.startSession();
    try {
      session.startTransaction();
    } catch {
      session.endSession();
    }
    const isTxActive = session.inTransaction();

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const bookingNumber = `RENT-${dateStr}-${Math.floor(100 + Math.random() * 900)}`;

    let totalDeposit = 0;
    const processedItems: any[] = [];

    for (const itemInput of items) {
      const product = await Product.findById(itemInput.productId);
      if (!product) continue;

      const deposit = Number(itemInput.depositPaid || 0);
      const dayRate = Number(itemInput.perDayRate || 0);
      totalDeposit += deposit;

      // Deduct inventory stock
      const deductRes = await deductInventoryWithAverageCost(
        {
          productId: product._id,
          locationId: location._id,
          condition: itemInput.condition || product.condition || "Used",
          quantity: 1,
        },
        isTxActive ? session : undefined
      );

      const movement = new InventoryMovement({
        product: product._id,
        productName: product.name,
        sku: product.sku,
        sourceLocation: location._id,
        sourceName: location.name,
        destinationName: customerName || "Rental Customer",
        type: "SALE_OUT",
        quantity: 1,
        serialNumbers: itemInput.serialNumber ? [itemInput.serialNumber] : [],
        unitCost: deductRes.unitCost,
        totalCost: deductRes.totalCost,
        referenceType: "RENTAL_BOOKING",
        referenceTransaction: bookingNumber,
        referenceId: bookingNumber,
        reason: `Rental Issue (Deposit: Rs. ${deposit}, Rate: Rs. ${dayRate}/day)`,
        beforeQuantity: (deductRes.remainingQty || 0) + 1,
        afterQuantity: deductRes.remainingQty || 0,
        performedBy: processedBy || auth.user?.username || "system",
        createdBy: processedBy || auth.user?.username || "system",
      });

      if (isTxActive) {
        await movement.save({ session });
      } else {
        await movement.save();
      }

      if (itemInput.serialNumber) {
        const snFilter = { serialNumber: itemInput.serialNumber.trim() };
        const snUpdate = { $set: { status: "Rented", location: customerName || "Rental Customer" } };
        if (isTxActive) {
          await SerialNumber.updateOne(snFilter, snUpdate, { session });
        } else {
          await SerialNumber.updateOne(snFilter, snUpdate);
        }
      }

      processedItems.push({
        product: product._id,
        productName: product.name,
        sku: product.sku,
        serialNumber: itemInput.serialNumber || undefined,
        condition: itemInput.condition || product.condition || "Used",
        depositPaid: deposit,
        perDayRate: dayRate,
        rentedAt: new Date(),
        status: "ON_RENT",
      });
    }

    const newBooking = new RentalBooking({
      bookingNumber,
      location: location._id,
      locationName: location.name,
      salesman: salesmanUser?._id,
      salesmanName: salesmanUser?.name || salesmanUser?.username || "Direct Counter",
      customer: customerId || undefined,
      customerName: customerName || "Walk-in Rental Customer",
      customerPhone: customerPhone || undefined,
      items: processedItems,
      totalDepositHeld: totalDeposit,
      totalRentRealized: 0,
      status: "ACTIVE",
      notes: notes || `Rental Booking Created (${processedItems.length} items)`,
      createdBy: processedBy || auth.user?.username || "system",
    });

    if (isTxActive) {
      await newBooking.save({ session });
    } else {
      await newBooking.save();
    }

    // Cash Drawer IN Movement for Security Deposit Liability
    const activeCashSession = await CashSession.findOne({
      location: location._id,
      cashier: processedBy || auth.user?.username || "system",
      status: "OPEN",
    });

    if (activeCashSession && totalDeposit > 0) {
      await recordCashMovement(
        {
          sessionId: activeCashSession._id.toString(),
          locationId: location._id.toString(),
          cashier: processedBy || auth.user?.username || "system",
          type: "CASH_SALE",
          amount: totalDeposit,
          direction: "IN",
          referenceType: "Payment",
          referenceId: bookingNumber,
          notes: `Rental Security Deposit Received for ${bookingNumber}`,
        },
        isTxActive ? session : undefined
      );
    }

    if (isTxActive) {
      await session.commitTransaction();
      session.endSession();
    }

    return NextResponse.json({
      success: true,
      data: newBooking,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create rental booking." },
      { status: 500 }
    );
  }
}
