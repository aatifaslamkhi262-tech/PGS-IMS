import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/lib/db";
import { Sale } from "@/models/Sale";
import { Product } from "@/models/Product";
import { Inventory } from "@/models/Inventory";
import { InventoryMovement } from "@/models/InventoryMovement";
import { SerialNumber } from "@/models/SerialNumber";
import { Location } from "@/models/Location";
import { updateAverageCostOnIntake, deductInventoryWithAverageCost } from "@/lib/averageCostEngine";
import { recordCustomerLedgerEntry } from "@/lib/customerLedgerEngine";
import { recordCashMovement } from "@/lib/cashSessionEngine";
import { CashSession } from "@/models/CashSession";
import { lockIdempotencyKey, completeIdempotencyKey, failIdempotencyKey } from "@/lib/idempotencyEngine";
import { verifyRole } from "@/lib/auth/rbac";

export async function POST(request: Request) {
  let idempotencyKeyHeader = "";
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Salesman", "Branch"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const { action, originalSaleId, locationId, customerName, customerPhone, securityDepositPaid, rentalFeeDeducted, additionalTopUpCash, returnedItem, returnedItems, replacementItems, paymentMethod, cashAmount, nonCashAmount, processedBy, notes } = body;
    idempotencyKeyHeader = request.headers.get("x-idempotency-key") || body.idempotencyKey || "";

    if (idempotencyKeyHeader) {
      const lockRes = await lockIdempotencyKey(idempotencyKeyHeader, body, "/api/sales/returns");
      if (lockRes && lockRes.isDuplicate) {
        return NextResponse.json(
          lockRes.responseBody || { success: false, error: lockRes.error },
          { status: lockRes.statusCode || 409 }
        );
      }
    }

    let originalSale: any = null;
    let targetLocationId = locationId;

    if (action !== "RENTAL_SWAP") {
      originalSale = await Sale.findById(originalSaleId);
      if (!originalSale || originalSale.status !== "COMPLETED") {
        if (idempotencyKeyHeader) await failIdempotencyKey(idempotencyKeyHeader);
        return NextResponse.json(
          { success: false, error: "Original completed sale invoice not found." },
          { status: 400 }
        );
      }
      targetLocationId = originalSale.location;
    }

    const location = await Location.findById(targetLocationId);
    if (!location) {
      if (idempotencyKeyHeader) await failIdempotencyKey(idempotencyKeyHeader);
      return NextResponse.json({ success: false, error: "Location not found." }, { status: 400 });
    }

    const session = await mongoose.startSession();
    try {
      session.startTransaction();
    } catch {
      session.endSession();
    }

    const isTxActive = session.inTransaction();
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const returnTxNumber = action === "RENTAL_SWAP" ? `RNT-${dateStr}-${Math.floor(100 + Math.random() * 900)}` : `RET-${dateStr}-${Math.floor(100 + Math.random() * 900)}`;

    let returnTotalValue = 0;
    const processedReturns: any[] = [];
    const rawReturnedList = returnedItems || (returnedItem ? [returnedItem] : []);

    const secDepositPaid = Number(securityDepositPaid || 0);
    const rentDeducted = Number(rentalFeeDeducted || 0);
    const topUpCash = Number(additionalTopUpCash || 0);
    const netDepositCredit = Math.max(0, secDepositPaid - rentDeducted) + topUpCash;

    // Over-Return Guard Check against Original Sale Invoice
    if (originalSale && originalSale.items) {
      for (const rItem of rawReturnedList) {
        const origItem = originalSale.items.find(
          (it: any) => it.product.toString() === rItem.productId.toString()
        );
        if (origItem) {
          const returnQty = Math.max(1, Number(rItem.quantity || 1));
          const alreadyReturned = Number(origItem.returnedQuantity || 0);
          const remainingReturnable = origItem.quantity - alreadyReturned;

          if (returnQty > remainingReturnable) {
            if (isTxActive) await session.abortTransaction();
            if (idempotencyKeyHeader) await failIdempotencyKey(idempotencyKeyHeader);
            return NextResponse.json(
              {
                success: false,
                error: `Cannot return ${returnQty} units of '${origItem.productName}'. Remaining returnable limit on Invoice ${originalSale.saleNumber} is ${Math.max(0, remainingReturnable)} (Original Sold: ${origItem.quantity}, Already Returned: ${alreadyReturned}).`,
              },
              { status: 400 }
            );
          }
        }
      }
    }

    // Process Returned Items with Condition-Based Valuation Override
    for (const rItem of rawReturnedList) {
      const product = await Product.findById(rItem.productId);
      if (!product) continue;

      const returnQty = Math.max(1, Number(rItem.quantity || 1));
      const condition = rItem.condition || product.condition || "Used";
      
      const returnValuation = rItem.agreedReturnValuation !== undefined && Number(rItem.agreedReturnValuation) >= 0
        ? Number(rItem.agreedReturnValuation)
        : (action === "RENTAL_SWAP" && netDepositCredit > 0 ? netDepositCredit : Number(rItem.unitPrice || product.costPrice || 0));

      const lineTotal = returnValuation * returnQty;
      returnTotalValue += lineTotal;

      await updateAverageCostOnIntake(
        {
          productId: product._id,
          locationId: targetLocationId,
          condition,
          quantity: returnQty,
          unitCost: returnValuation,
        },
        isTxActive ? session : undefined
      );

      const movement = new InventoryMovement({
        product: product._id,
        productName: product.name,
        sku: product.sku,
        destinationLocation: targetLocationId,
        destinationName: location.name,
        sourceName: "Customer",
        type: "RETURN_IN",
        quantity: returnQty,
        serialNumbers: rItem.serialNumbers || (rItem.serialNumber ? [rItem.serialNumber] : []),
        unitCost: returnValuation,
        totalCost: lineTotal,
        referenceType: action === "RENTAL_SWAP" ? "RENTAL_SWAP" : "RETURN_EXCHANGE",
        referenceId: returnTxNumber,
        reason: action === "RENTAL_SWAP"
          ? `Rental Return Intake (Deposit: Rs. ${secDepositPaid}, Rent Deducted: Rs. ${rentDeducted})`
          : `Return against Invoice ${originalSale?.saleNumber || ""} (${condition})`,
        createdBy: processedBy || auth.user?.username || "system",
      });

      if (isTxActive) {
        await movement.save({ session });
      } else {
        await movement.save();
      }

      // Update returnedQuantity on Original Sale Item
      if (originalSale && originalSale.items) {
        const origItem = originalSale.items.find(
          (it: any) => it.product.toString() === product._id.toString()
        );
        if (origItem) {
          origItem.returnedQuantity = (origItem.returnedQuantity || 0) + returnQty;
        }
      }

      const serials = rItem.serialNumbers || (rItem.serialNumber ? [rItem.serialNumber] : []);
      if (serials && serials.length > 0) {
        const targetStatus = condition === "Defective" ? "Defective" : "Available";
        const snFilter = { serialNumber: { $in: serials } };
        const snUpdate = { $set: { status: targetStatus, location: location.name } };
        
        if (isTxActive) {
          await SerialNumber.updateMany(snFilter, snUpdate, { session });
        } else {
          await SerialNumber.updateMany(snFilter, snUpdate);
        }
      }

      processedReturns.push({
        product: product._id,
        productName: product.name,
        sku: product.sku,
        condition,
        quantity: returnQty,
        unitPrice: returnValuation,
        lineTotal,
      });
    }

    if (originalSale) {
      if (isTxActive) {
        await originalSale.save({ session });
      } else {
        await originalSale.save();
      }
    }

    if (action === "RENTAL_SWAP" && netDepositCredit > 0) {
      returnTotalValue = netDepositCredit;
    }

    // Process Replacement Items (Outbound)
    let replacementTotalValue = 0;
    const processedReplacements: any[] = [];

    if (replacementItems && replacementItems.length > 0) {
      for (const repInput of replacementItems) {
        const product = await Product.findById(repInput.productId);
        if (!product) continue;

        const repQty = Math.max(1, Number(repInput.quantity || 1));
        const unitPrice = repInput.unitPrice || product.sellingPrice;
        const lineTotal = unitPrice * repQty;
        replacementTotalValue += lineTotal;

        const deductRes = await deductInventoryWithAverageCost(
          {
            productId: product._id,
            locationId: targetLocationId,
            condition: repInput.condition || "New",
            quantity: repQty,
          },
          isTxActive ? session : undefined
        );

        const movement = new InventoryMovement({
          product: product._id,
          productName: product.name,
          sku: product.sku,
          sourceLocation: targetLocationId,
          sourceName: location.name,
          destinationName: customerName || originalSale?.customerName || "Customer",
          type: "SALE_OUT",
          quantity: repQty,
          serialNumbers: repInput.serialNumbers || [],
          unitCost: deductRes.unitCost,
          totalCost: deductRes.totalCost,
          referenceType: action === "RENTAL_SWAP" ? "RENTAL_SWAP" : "RETURN_EXCHANGE",
          referenceId: returnTxNumber,
          reason: action === "RENTAL_SWAP"
            ? `Rental Swap Issue (${product.name})`
            : `Exchange Replacement Issue against Invoice ${originalSale?.saleNumber || ""}`,
          createdBy: processedBy || auth.user?.username || "system",
        });

        if (isTxActive) {
          await movement.save({ session });
        } else {
          await movement.save();
        }

        if (repInput.serialNumbers && repInput.serialNumbers.length > 0) {
          const snFilter = { serialNumber: { $in: repInput.serialNumbers } };
          const snUpdate = { $set: { status: "Sold", location: customerName || originalSale?.customerName || "Customer" } };
          if (isTxActive) {
            await SerialNumber.updateMany(snFilter, snUpdate, { session });
          } else {
            await SerialNumber.updateMany(snFilter, snUpdate);
          }
        }

        processedReplacements.push({
          product: product._id,
          productName: product.name,
          sku: product.sku,
          condition: repInput.condition || "New",
          quantity: repQty,
          unitPrice,
          lineTotal,
        });
      }
    }

    // Net Difference Calculation
    const netDifference = replacementTotalValue - returnTotalValue;
    let settlementStatus = "EVEN_EXCHANGE";
    if (netDifference > 0) {
      settlementStatus = "CUSTOMER_PAYS";
    } else if (netDifference < 0) {
      settlementStatus = "SHOP_PAYS";
    }

    // Customer Ledger Records
    const targetCustId = originalSale?.customer || body.customerId;
    if (targetCustId) {
      await recordCustomerLedgerEntry(
        {
          customerId: targetCustId.toString(),
          type: "RETURN_CREDIT",
          amount: returnTotalValue,
          referenceType: "Return",
          referenceId: returnTxNumber,
          notes: action === "RENTAL_SWAP"
            ? `Rental Return Deposit Credit (Deposit: Rs. ${secDepositPaid}, Rent Deducted: Rs. ${rentDeducted})`
            : `Returned items against Invoice ${originalSale?.saleNumber || ""}`,
          createdBy: processedBy || auth.user?.username || "system",
        },
        isTxActive ? session : undefined
      );

      if (replacementTotalValue > 0) {
        await recordCustomerLedgerEntry(
          {
            customerId: targetCustId.toString(),
            type: "INVOICE",
            amount: replacementTotalValue,
            referenceType: "Exchange",
            referenceId: returnTxNumber,
            notes: `Replacement items for ${returnTxNumber}`,
            createdBy: processedBy || auth.user?.username || "system",
          },
          isTxActive ? session : undefined
        );
      }
    }

    // Physical Cash Drawer Movements (Cash portion ONLY)
    const activeCashSession = await CashSession.findOne({
      location: targetLocationId,
      cashier: processedBy || auth.user?.username || "system",
      status: "OPEN",
    });

    const chosenPaymentMethod = paymentMethod || "CASH";
    const actualCashPortion = chosenPaymentMethod === "CASH"
      ? Math.abs(netDifference)
      : Number(cashAmount || 0);

    if (activeCashSession && actualCashPortion > 0) {
      if (netDifference > 0) {
        // Customer paid cash
        await recordCashMovement(
          {
            sessionId: activeCashSession._id.toString(),
            locationId: targetLocationId.toString(),
            cashier: processedBy || auth.user?.username || "system",
            type: "CASH_SALE",
            amount: actualCashPortion,
            direction: "IN",
            referenceType: "Return",
            referenceId: returnTxNumber,
            notes: `Exchange net cash collection`,
          },
          isTxActive ? session : undefined
        );
      } else if (netDifference < 0) {
        // Shop refunded cash
        await recordCashMovement(
          {
            sessionId: activeCashSession._id.toString(),
            locationId: targetLocationId.toString(),
            cashier: processedBy || auth.user?.username || "system",
            type: "CASH_REFUND",
            amount: actualCashPortion,
            direction: "OUT",
            referenceType: "Return",
            referenceId: returnTxNumber,
            notes: `Return cash refund paid to customer`,
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
        returnTxNumber,
        originalSaleNumber: originalSale.saleNumber,
        customerName: originalSale.customerName || "Walk-in Customer",
        returnTotalValue,
        replacementTotalValue,
        netDifference,
        settlementStatus,
        paymentMethod: chosenPaymentMethod,
        receiptData: {
          invoiceNumber: returnTxNumber,
          originalInvoiceNumber: originalSale.saleNumber,
          customerName: originalSale.customerName || "Walk-in Customer",
          returnTotalValue,
          replacementTotalValue,
          netDifference,
          settlementStatus,
          processedBy: processedBy || auth.user?.username || "system",
          returnedItems: processedReturns,
          replacementItems: processedReplacements,
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
      { success: false, error: error.message || "Failed to process return/exchange." },
      { status: 500 }
    );
  }
}
