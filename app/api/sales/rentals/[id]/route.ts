import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/lib/db";
import { RentalBooking } from "@/models/RentalBooking";
import { Product } from "@/models/Product";
import { Sale } from "@/models/Sale";
import { Location } from "@/models/Location";
import { InventoryMovement } from "@/models/InventoryMovement";
import { SerialNumber } from "@/models/SerialNumber";
import { Payment } from "@/models/Payment";
import { generatePaymentNumber } from "@/lib/salesEngine";
import { recordCashMovement, findOrAutoOpenCashSession } from "@/lib/cashSessionEngine";
import { recordCustomerLedgerEntry } from "@/lib/customerLedgerEngine";
import { updateAverageCostOnIntake } from "@/lib/averageCostEngine";
import { Inventory } from "@/models/Inventory";
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
    const { action, returnedItemIds, customRentFee, topUpAmount, paymentMethod, notes, processedBy } = body;
    const chosenMethod: "CASH" | "CARD" | "BANK_TRANSFER" | "ONLINE_GATEWAY" = paymentMethod || "CASH";
    const actorUsername = processedBy || auth.user?.username || "system";

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

        // Return stock to location preserving true asset cost (never treat rental fee as purchase intake cost)
        const { isValidCost } = await import("@/lib/costing");
        const returnCondition = item.condition || "Used";
        let beforeQuantity = 0;
        let afterQuantity = 0;

        let inv = await Inventory.findOne({
          product: item.product,
          location: booking.location,
          condition: returnCondition,
        });

        beforeQuantity = inv ? (inv.quantity || 0) : 0;

        // Resolve return cost: preserve existing pool averageCost if valid, else fallback to Product master costPrice
        let returnCost = 0;
        if (inv && isValidCost(inv.averageCost)) {
          returnCost = inv.averageCost;
        } else {
          const prodDoc = await Product.findById(item.product);
          if (prodDoc && isValidCost(prodDoc.costPrice)) {
            returnCost = prodDoc.costPrice;
          }
        }

        if (!inv) {
          inv = new Inventory({
            product: item.product,
            location: booking.location,
            condition: returnCondition,
            quantity: 1,
            averageCost: returnCost,
            totalCostValue: returnCost,
            status: "In Stock",
          });
        } else {
          inv.quantity += 1;
          if (!isValidCost(inv.averageCost) && returnCost > 0) {
            inv.averageCost = returnCost;
          }
          const effCost = (inv.averageCost && isValidCost(inv.averageCost)) ? inv.averageCost : returnCost;
          inv.totalCostValue = Math.round(inv.quantity * effCost * 100) / 100;
          inv.status = inv.quantity > 0 ? "In Stock" : "Out of Stock";
        }
        afterQuantity = inv.quantity;

        if (isTxActive && session) {
          await inv.save({ session });
        } else {
          await inv.save();
        }

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
          unitCost: returnCost,
          totalCost: returnCost,
          referenceType: "RENTAL_RETURN",
          referenceId: booking.bookingNumber,
          reason: `Rental Return Intake (${diffDays} days rental @ Rs. ${item.perDayRate}/day = Rs. ${rentFee})`,
          beforeQuantity,
          afterQuantity,
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

      // Cash / Bank Drawer Movement & Payment tracking
      if (totalNetRefundToCustomer > 0) {
        const activeCashSession = await findOrAutoOpenCashSession(
          booking.location.toString(),
          actorUsername
        );
        if (activeCashSession) {
          await recordCashMovement(
            {
              sessionId: activeCashSession._id.toString(),
              locationId: booking.location.toString(),
              cashier: actorUsername,
              type: "CASH_REFUND",
              amount: totalNetRefundToCustomer,
              direction: "OUT",
              paymentMethod: chosenMethod,
              referenceType: "Return",
              referenceId: booking.bookingNumber,
              notes: `Rental Deposit Refund (${booking.bookingNumber} - ${booking.customerName}) [${chosenMethod}]`,
            },
            isTxActive ? session : undefined
          );
        }
      } else if (totalNetRefundToCustomer < 0) {
        const excessFeeAmt = Math.abs(totalNetRefundToCustomer);
        const payNum = await generatePaymentNumber(isTxActive ? session : undefined);
        const excessPayment = new Payment({
          paymentNumber: payNum,
          customer: booking.customer,
          location: booking.location,
          paymentMethod: chosenMethod,
          amount: excessFeeAmt,
          notes: `Rental Usage Excess Collection (${booking.bookingNumber})`,
          receivedBy: actorUsername,
          status: "PAID",
        });
        if (isTxActive) await excessPayment.save({ session });
        else await excessPayment.save();

        if (chosenMethod === "CASH") {
          const activeCashSession = await findOrAutoOpenCashSession(
            booking.location.toString(),
            actorUsername
          );
          if (activeCashSession) {
            await recordCashMovement(
              {
                sessionId: activeCashSession._id.toString(),
                locationId: booking.location.toString(),
                cashier: actorUsername,
                type: "CASH_SALE",
                amount: excessFeeAmt,
                direction: "IN",
                paymentMethod: "CASH",
                referenceType: "Return",
                referenceId: booking.bookingNumber,
                notes: `Rental Usage Excess Collection from ${booking.customerName}`,
              },
              isTxActive ? session : undefined
            );
          }
        }
      }

      // Reconcile Customer Ledger for realized rent fee & refunded deposit / excess payment
      if (booking.customer) {
        if (totalAccruedRentRealized > 0) {
          await recordCustomerLedgerEntry(
            {
              customerId: booking.customer.toString(),
              type: "INVOICE",
              amount: totalAccruedRentRealized,
              referenceType: "Return",
              referenceId: booking.bookingNumber,
              notes: `Rental Usage Fee (${booking.bookingNumber})`,
              createdBy: actorUsername,
            },
            isTxActive ? session : undefined
          );
        }
        if (totalNetRefundToCustomer > 0) {
          await recordCustomerLedgerEntry(
            {
              customerId: booking.customer.toString(),
              type: "ADVANCE_REFUND",
              amount: totalNetRefundToCustomer,
              referenceType: "Refund",
              referenceId: booking.bookingNumber,
              notes: `Rental Security Deposit Refund (${booking.bookingNumber} - ${chosenMethod})`,
              createdBy: actorUsername,
            },
            isTxActive ? session : undefined
          );
        } else if (totalNetRefundToCustomer < 0) {
          await recordCustomerLedgerEntry(
            {
              customerId: booking.customer.toString(),
              type: "PAYMENT",
              amount: Math.abs(totalNetRefundToCustomer),
              referenceType: "Payment",
              referenceId: booking.bookingNumber,
              notes: `Rental Excess Usage Collection (${booking.bookingNumber} - ${chosenMethod})`,
              createdBy: actorUsername,
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

      const payNum = await generatePaymentNumber(isTxActive ? session : undefined);
      const topUpPayment = new Payment({
        paymentNumber: payNum,
        customer: booking.customer,
        location: booking.location,
        paymentMethod: chosenMethod,
        amount: topUpVal,
        notes: `Rental Deposit Top-Up (${booking.bookingNumber})`,
        receivedBy: actorUsername,
        status: "PAID",
      });
      if (isTxActive) await topUpPayment.save({ session });
      else await topUpPayment.save();

      if (chosenMethod === "CASH") {
        const activeCashSession = await findOrAutoOpenCashSession(
          booking.location.toString(),
          actorUsername
        );
        if (activeCashSession) {
          await recordCashMovement(
            {
              sessionId: activeCashSession._id.toString(),
              locationId: booking.location.toString(),
              cashier: actorUsername,
              type: "CASH_SALE",
              amount: topUpVal,
              direction: "IN",
              paymentMethod: "CASH",
              referenceType: "Payment",
              referenceId: booking.bookingNumber,
              notes: `Rental Deposit Top-Up for ${booking.bookingNumber}`,
            },
            isTxActive ? session : undefined
          );
        }
      }

      if (booking.customer && topUpVal > 0) {
        await recordCustomerLedgerEntry(
          {
            customerId: booking.customer.toString(),
            type: "ADVANCE_DEPOSIT",
            amount: topUpVal,
            referenceType: "Payment",
            referenceId: booking.bookingNumber,
            notes: `Rental Deposit Top-Up (${booking.bookingNumber} - ${chosenMethod})`,
            createdBy: actorUsername,
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
