import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/lib/db";
import { RentalBooking } from "@/models/RentalBooking";
import { Product } from "@/models/Product";
import { Sale } from "@/models/Sale";
import { Location } from "@/models/Location";
import { InventoryMovement } from "@/models/InventoryMovement";
import { SerialNumber } from "@/models/SerialNumber";
import { CashSession } from "@/models/CashSession";
import { recordCashMovement } from "@/lib/cashSessionEngine";
import { updateAverageCostOnIntake } from "@/lib/averageCostEngine";
import { verifyRole } from "@/lib/auth/rbac";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Salesman", "Branch"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const body = await request.json();
    const { action, returnedItemIds, customRentFee, topUpAmount, notes, processedBy } = body;

    const booking = await RentalBooking.findById(id);
    if (!booking) {
      return NextResponse.json({ success: false, error: "Rental Booking record not found." }, { status: 400 });
    }

    const session = await mongoose.startSession();
    try {
      session.startTransaction();
    } catch {
      session.endSession();
    }
    const isTxActive = session.inTransaction();

    if (action === "PARTIAL_RETURN") {
      if (!returnedItemIds || !Array.isArray(returnedItemIds) || returnedItemIds.length === 0) {
        if (isTxActive) await session.abortTransaction();
        return NextResponse.json({ success: false, error: "No items selected for return." }, { status: 400 });
      }

      let totalAccruedRentRealized = 0;
      let totalNetRefundToCustomer = 0;
      const returnedItemsSummary: any[] = [];

      for (const itemId of returnedItemIds) {
        const item = (booking.items as any).id(itemId);
        if (!item || item.status === "RETURNED") continue;

        const rentedDate = new Date(item.rentedAt || booking.createdAt);
        const now = new Date();
        const diffDays = Math.max(1, Math.ceil((now.getTime() - rentedDate.getTime()) / (1000 * 3600 * 24)));
        
        let rentFee = item.perDayRate > 0 ? diffDays * item.perDayRate : 0;
        if (customRentFee !== undefined && Number(customRentFee) >= 0 && returnedItemIds.length === 1) {
          rentFee = Number(customRentFee);
        }

        const netRefund = item.depositPaid - rentFee;
        item.status = "RETURNED";
        item.returnedAt = now;
        item.accruedRent = rentFee;
        item.netRefundPaid = netRefund;

        totalAccruedRentRealized += rentFee;
        totalNetRefundToCustomer += netRefund;

        // Return stock to location
        const intakeRes = await updateAverageCostOnIntake(
          {
            productId: item.product,
            locationId: booking.location,
            condition: item.condition || "Used",
            quantity: 1,
            unitCost: rentFee,
          },
          isTxActive ? session : undefined
        );

        const movement = new InventoryMovement({
          product: item.product,
          productName: item.productName,
          sku: item.sku,
          destinationLocation: booking.location,
          destinationName: booking.locationName,
          sourceName: booking.customerName || "Customer",
          type: "RETURN_IN",
          quantity: 1,
          serialNumbers: item.serialNumber ? [item.serialNumber] : [],
          unitCost: rentFee,
          totalCost: rentFee,
          referenceType: "RENTAL_RETURN",
          referenceId: booking.bookingNumber,
          reason: `Rental Return Intake (${diffDays} days rental @ Rs. ${item.perDayRate}/day = Rs. ${rentFee})`,
          beforeQuantity: Math.max(0, (intakeRes.newQuantity || 1) - 1),
          afterQuantity: intakeRes.newQuantity || 1,
          performedBy: processedBy || auth.user?.username || "system",
          createdBy: processedBy || auth.user?.username || "system",
        });

        if (isTxActive) {
          await movement.save({ session });
        } else {
          await movement.save();
        }

        if (item.serialNumber) {
          const snFilter = { serialNumber: item.serialNumber.trim() };
          const snUpdate = { $set: { status: "Available", location: booking.locationName } };
          if (isTxActive) {
            await SerialNumber.updateOne(snFilter, snUpdate, { session });
          } else {
            await SerialNumber.updateOne(snFilter, snUpdate);
          }
        }

        returnedItemsSummary.push({
          productName: item.productName,
          depositPaid: item.depositPaid,
          rentFee,
          netRefund,
          daysRented: diffDays,
        });
      }

      booking.totalRentRealized = (booking.totalRentRealized || 0) + totalAccruedRentRealized;
      booking.totalDepositHeld = Math.max(0, booking.totalDepositHeld - (totalNetRefundToCustomer + totalAccruedRentRealized));

      const hasRemainingItems = booking.items.some((it) => it.status === "ON_RENT");
      booking.status = hasRemainingItems ? "PARTIALLY_RETURNED" : "COMPLETED";

      if (isTxActive) {
        await booking.save({ session });
      } else {
        await booking.save();
      }

      // Save a completed Sale document for Realized Rental Revenue & Salesman Attribution
      if (totalAccruedRentRealized > 0) {
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        const rentSaleNumber = `RNT-REV-${dateStr}-${Math.floor(100 + Math.random() * 900)}`;

        const rentSale = new Sale({
          saleNumber: rentSaleNumber,
          creationMode: "DIRECT_COUNTER",
          saleSource: "EXCHANGE",
          location: booking.location,
          locationName: booking.locationName,
          salesman: booking.salesman,
          salesmanName: booking.salesmanName || "Direct Counter",
          customer: booking.customer,
          customerName: booking.customerName || "Rental Customer",
          customerPhone: booking.customerPhone,
          items: returnedItemsSummary.map((r) => ({
            product: r.productId || booking.location,
            productName: `[RENTAL REALIZED INCOME] ${r.productName} (${r.daysRented} days)`,
            sku: "RENT-SERVICE",
            barcode: "RENT-SERVICE",
            condition: "Service",
            quantity: 1,
            unitCost: 0,
            unitPrice: r.rentFee,
            minSellingPrice: r.rentFee,
            discountAmount: 0,
            lineTotal: r.rentFee,
            grossProfit: r.rentFee,
          })),
          subtotal: totalAccruedRentRealized,
          discountAmount: 0,
          taxAmount: 0,
          deliveryCharges: 0,
          totalAmount: totalAccruedRentRealized,
          totalPaid: totalAccruedRentRealized,
          balanceDue: 0,
          totalCost: 0,
          netProfit: totalAccruedRentRealized,
          status: "COMPLETED",
          notes: notes || `Realized Rental Revenue for ${booking.bookingNumber}`,
          createdBy: processedBy || auth.user?.username || "system",
          completedBy: processedBy || auth.user?.username || "system",
          completedAt: new Date(),
        });

        if (isTxActive) {
          await rentSale.save({ session });
        } else {
          await rentSale.save();
        }
      }

      // Cash Drawer Movement (Refund paid OUT to customer or Top-up received IN)
      const activeCashSession = await CashSession.findOne({
        location: booking.location,
        cashier: processedBy || auth.user?.username || "system",
        status: "OPEN",
      });

      if (activeCashSession) {
        if (totalNetRefundToCustomer > 0) {
          await recordCashMovement(
            {
              sessionId: activeCashSession._id.toString(),
              locationId: booking.location.toString(),
              cashier: processedBy || auth.user?.username || "system",
              type: "CASH_REFUND",
              amount: totalNetRefundToCustomer,
              direction: "OUT",
              referenceType: "Return",
              referenceId: booking.bookingNumber,
              notes: `Rental Security Deposit Refund paid to ${booking.customerName}`,
            },
            isTxActive ? session : undefined
          );
        } else if (totalNetRefundToCustomer < 0) {
          await recordCashMovement(
            {
              sessionId: activeCashSession._id.toString(),
              locationId: booking.location.toString(),
              cashier: processedBy || auth.user?.username || "system",
              type: "CASH_SALE",
              amount: Math.abs(totalNetRefundToCustomer),
              direction: "IN",
              referenceType: "Return",
              referenceId: booking.bookingNumber,
              notes: `Rental Usage Excess Collection from ${booking.customerName}`,
            },
            isTxActive ? session : undefined
          );
        }
      }

      if (isTxActive) {
        await session.commitTransaction();
        session.endSession();
      }

      return NextResponse.json({
        success: true,
        data: {
          booking,
          totalAccruedRentRealized,
          totalNetRefundToCustomer,
          returnedItemsSummary,
        },
      });
    } else if (action === "ADD_TOP_UP") {
      const topUpVal = Number(topUpAmount || 0);
      if (topUpVal <= 0) {
        if (isTxActive) await session.abortTransaction();
        return NextResponse.json({ success: false, error: "Top-up amount must be greater than 0." }, { status: 400 });
      }

      booking.totalDepositHeld += topUpVal;
      booking.topUpHistory.push({
        date: new Date(),
        amount: topUpVal,
        notes: notes || "Deposit Top-Up",
        addedBy: processedBy || auth.user?.username || "system",
      });

      if (isTxActive) {
        await booking.save({ session });
      } else {
        await booking.save();
      }

      const activeCashSession = await CashSession.findOne({
        location: booking.location,
        cashier: processedBy || auth.user?.username || "system",
        status: "OPEN",
      });

      if (activeCashSession) {
        await recordCashMovement(
          {
            sessionId: activeCashSession._id.toString(),
            locationId: booking.location.toString(),
            cashier: processedBy || auth.user?.username || "system",
            type: "CASH_SALE",
            amount: topUpVal,
            direction: "IN",
            referenceType: "Payment",
            referenceId: booking.bookingNumber,
            notes: `Rental Deposit Top-Up for ${booking.bookingNumber}`,
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
        data: booking,
      });
    } else {
      if (isTxActive) await session.abortTransaction();
      return NextResponse.json({ success: false, error: "Invalid action requested." }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update rental booking." },
      { status: 500 }
    );
  }
}
