import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/lib/db";
import { Product } from "@/models/Product";
import { Inventory } from "@/models/Inventory";
import { InventoryMovement } from "@/models/InventoryMovement";
import { SerialNumber } from "@/models/SerialNumber";
import { Location } from "@/models/Location";
import { Customer } from "@/models/Customer";
import { updateAverageCostOnIntake } from "@/lib/averageCostEngine";
import { recordCustomerLedgerEntry } from "@/lib/customerLedgerEngine";
import { recordCashMovement } from "@/lib/cashSessionEngine";
import { CashSession } from "@/models/CashSession";
import { lockIdempotencyKey, completeIdempotencyKey, failIdempotencyKey } from "@/lib/idempotencyEngine";
import { verifyRole } from "@/lib/auth/rbac";

export async function POST(req: NextRequest) {
  let idempotencyKeyHeader = "";
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Salesman", "Branch"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    idempotencyKeyHeader = req.headers.get("x-idempotency-key") || body.idempotencyKey || "";

    if (idempotencyKeyHeader) {
      const lockRes = await lockIdempotencyKey(idempotencyKeyHeader, body, "/api/purchases/customer-buyback");
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
      items, // Array of { productId, condition, quantity, acquisitionValue, serialNumber }
      paymentMethod, // CASH, CARD, BANK_TRANSFER, ONLINE_GATEWAY
      notes,
    } = body;

    const location = await Location.findById(locationId);
    if (!location) {
      if (idempotencyKeyHeader) await failIdempotencyKey(idempotencyKeyHeader);
      return NextResponse.json({ success: false, error: "Invalid location specified." }, { status: 400 });
    }

    if (!Array.isArray(items) || items.length === 0) {
      if (idempotencyKeyHeader) await failIdempotencyKey(idempotencyKeyHeader);
      return NextResponse.json({ success: false, error: "At least one buyback item is required." }, { status: 400 });
    }

    // Lookup or create customer by phone if phone provided
    let customerObj: any = null;
    if (customerId) {
      customerObj = await Customer.findById(customerId);
    } else if (customerPhone && customerPhone.trim()) {
      customerObj = await Customer.findOne({ phone: customerPhone.trim() });
      if (!customerObj && customerName && customerName.trim()) {
        customerObj = new Customer({
          name: customerName.trim(),
          phone: customerPhone.trim(),
        });
        await customerObj.save();
      }
    }

    const session = await mongoose.startSession();
    try {
      session.startTransaction();
    } catch {
      session.endSession();
    }

    const isTxActive = session.inTransaction();
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const buybackRefNumber = `CBUY-${dateStr}-${Math.floor(100 + Math.random() * 900)}`;

    let totalAcquisitionValue = 0;
    const processedItems: any[] = [];

    for (const itemInput of items) {
      const product = await Product.findById(itemInput.productId);
      if (!product) continue;

      const condition = itemInput.condition || "Used";
      const quantity = Math.max(1, Number(itemInput.quantity || 1));
      const acquisitionVal = Math.max(0, Number(itemInput.acquisitionValue || 0));
      const lineTotal = acquisitionVal * quantity;
      totalAcquisitionValue += lineTotal;

      // Update Moving Average Cost & Stock Intake
      const intakeRes = await updateAverageCostOnIntake(
        {
          productId: product._id,
          locationId: location._id,
          condition,
          quantity,
          unitCost: acquisitionVal,
        },
        isTxActive ? session : undefined
      );

      // Serial registration if applicable
      const cleanSerials: string[] = [];
      if (itemInput.serialNumber) {
        const sn = itemInput.serialNumber.trim();
        cleanSerials.push(sn);

        const snFilter = { serialNumber: sn };
        const snUpdate = {
          product: product._id,
          location: location._id,
          serialNumber: sn,
          status: "Available",
          condition,
          purchaseRate: acquisitionVal,
          transactionReference: buybackRefNumber,
        };

        if (isTxActive) {
          await SerialNumber.findOneAndUpdate(snFilter, snUpdate, { upsert: true, new: true, session });
        } else {
          await SerialNumber.findOneAndUpdate(snFilter, snUpdate, { upsert: true, new: true });
        }
      }

      // Record Inventory Movement
      const movement = new InventoryMovement({
        product: product._id,
        productName: product.name,
        sku: product.sku,
        location: location._id,
        locationName: location.name,
        type: "STOCK_IN",
        quantity,
        serialNumbers: cleanSerials,
        unitCost: acquisitionVal,
        totalCost: lineTotal,
        referenceType: "PURCHASE",
        referenceId: buybackRefNumber,
        reason: `Daily Customer Purchase (${condition})`,
        createdBy: auth.user?.username || "system",
      });

      if (isTxActive) {
        await movement.save({ session });
      } else {
        await movement.save();
      }

      processedItems.push({
        product: product._id,
        productName: product.name,
        sku: product.sku,
        condition,
        quantity,
        acquisitionValue: acquisitionVal,
        serialNumber: itemInput.serialNumber || undefined,
        lineTotal,
      });
    }

    // Ledger record if customer exists
    if (customerObj) {
      await recordCustomerLedgerEntry(
        {
          customerId: customerObj._id.toString(),
          type: "PAYMENT",
          amount: totalAcquisitionValue,
          referenceType: "TradeIn",
          referenceId: buybackRefNumber,
          notes: `Customer inventory acquisition payout`,
          createdBy: auth.user?.username || "system",
        },
        isTxActive ? session : undefined
      );
    }

    // Cash movement if paid in Cash
    const chosenMethod = paymentMethod || "CASH";
    if (chosenMethod === "CASH") {
      const activeCashSession = await CashSession.findOne({
        location: location._id,
        cashier: auth.user?.username || "system",
        status: "OPEN",
      });

      if (activeCashSession) {
        await recordCashMovement(
          {
            sessionId: activeCashSession._id.toString(),
            locationId: location._id.toString(),
            cashier: auth.user?.username || "system",
            type: "CASH_REFUND",
            amount: totalAcquisitionValue,
            direction: "OUT",
            referenceType: "TradeIn",
            referenceId: buybackRefNumber,
            notes: `Cash paid for Customer Buyback ${buybackRefNumber}`,
          },
          isTxActive ? session : undefined
        );
      }
    }

    if (isTxActive) {
      await session.commitTransaction();
      session.endSession();
    }

    const responseData = {
      success: true,
      data: {
        buybackRefNumber,
        locationName: location.name,
        customerName: customerName || customerObj?.name || "Walk-in Customer",
        itemsCount: processedItems.length,
        totalAcquisitionValue,
        paymentMethod: chosenMethod,
        items: processedItems,
        receiptData: {
          invoiceNumber: buybackRefNumber,
          customerName: customerName || customerObj?.name || "Walk-in Customer",
          totalAcquisitionValue,
          paymentMethod: chosenMethod,
          processedBy: auth.user?.username || "system",
          items: processedItems,
        },
      },
    };

    if (idempotencyKeyHeader) {
      await completeIdempotencyKey(idempotencyKeyHeader, 200, responseData);
    }

    return NextResponse.json(responseData);
  } catch (error: any) {
    if (idempotencyKeyHeader) await failIdempotencyKey(idempotencyKeyHeader);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process customer buyback." },
      { status: 500 }
    );
  }
}
