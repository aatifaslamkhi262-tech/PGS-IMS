import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/lib/db";
import { PurchaseReceiving } from "@/models/PurchaseReceiving";
import { PurchaseInvoice } from "@/models/PurchaseInvoice";
import { Product } from "@/models/Product";
import { Location } from "@/models/Location";
import { SerialNumber } from "@/models/SerialNumber";
import { Inventory } from "@/models/Inventory";
import { InventoryMovement } from "@/models/InventoryMovement";
import { verifyRole } from "@/lib/auth/rbac";

/**
 * Core receiving approval execution logic.
 * Can run either inside a MongoDB Session Transaction OR directly (fallback for standalone MongoDB).
 */
async function processReceivingApproval(id: string, approvedByUsername: string, session?: mongoose.ClientSession) {
  const sessionOptions = session ? { session } : {};

  // 1. Fetch receiving record
  const receiving = await PurchaseReceiving.findById(id, null, sessionOptions);
  if (!receiving) {
    throw new Error("Receiving record not found.");
  }

  if (receiving.status === "Approved") {
    return { alreadyApproved: true, receiving };
  }

  if (receiving.status !== "Pending_Approval") {
    throw new Error(`Only Pending Approval receiving documents can be approved. Current status: ${receiving.status}`);
  }

  // 2. Fetch destination location
  const locationObj = await Location.findById(receiving.location, null, sessionOptions);
  if (!locationObj || !locationObj.active) {
    throw new Error("Destination location is inactive or invalid.");
  }

  // 3. Update Inventory, SerialNumbers, and InventoryMovement for each item idempotently
  for (const item of receiving.items) {
    const productObj = await Product.findById(item.product, null, sessionOptions);
    if (!productObj) {
      throw new Error(`Product not found: ${item.product}`);
    }

    // Check if this item's movement was already applied for this receiving (Idempotency Guard)
    const existingMovement = await InventoryMovement.findOne(
      {
        referenceTransaction: receiving.receivingNumber,
        product: item.product,
        type: "PURCHASE_RECEIVING",
      },
      null,
      sessionOptions
    );

    let beforeQuantity = 0;
    let afterQuantity = 0;

    if (!existingMovement) {
      // a. Check/Update Inventory
      let inventory = await Inventory.findOne(
        {
          product: item.product,
          location: receiving.location,
          condition: item.condition,
        },
        null,
        sessionOptions
      );

      beforeQuantity = inventory ? inventory.quantity : 0;

      if (!inventory) {
        inventory = new Inventory({
          product: item.product,
          location: receiving.location,
          condition: item.condition,
          quantity: item.quantityReceived,
          serialTracking: productObj.serialTracking,
          status: "In Stock",
        });
      } else {
        inventory.quantity += item.quantityReceived;
        inventory.status = inventory.quantity > 0 ? "In Stock" : "Out of Stock";
      }

      await inventory.save(sessionOptions);
      afterQuantity = inventory.quantity;
    } else {
      // Stock was already applied in a previous/partial attempt - fetch current inventory
      const currentInv = await Inventory.findOne(
        {
          product: item.product,
          location: receiving.location,
          condition: item.condition,
        },
        null,
        sessionOptions
      );
      beforeQuantity = currentInv ? currentInv.quantity : 0;
      afterQuantity = beforeQuantity;
    }

    // b. If serialized, check and insert SerialNumbers idempotently
    if (productObj.serialTracking) {
      if (!item.serialNumbers || item.serialNumbers.length !== item.quantityReceived) {
        throw new Error(`Product "${productObj.name}" requires exact ${item.quantityReceived} serial numbers but they are missing or length mismatch.`);
      }

      for (const sn of item.serialNumbers) {
        const existingSerial = await SerialNumber.findOne({ serialNumber: sn }, null, sessionOptions);
        if (existingSerial) {
          if (existingSerial.transactionReference === receiving.receivingNumber) {
            // Already created during partial/previous attempt of this receiving - skip duplicate creation
            continue;
          }
          throw new Error(`Serial number "${sn}" already exists in the system (Product ID: ${existingSerial.product}). Duplicate serial rejected.`);
        }

        // Create serial number as Available with location name & transaction reference
        if (session) {
          await SerialNumber.create(
            [
              {
                product: item.product,
                serialNumber: sn,
                status: "Available",
                location: locationObj.name,
                transactionReference: receiving.receivingNumber,
              },
            ],
            { session }
          );
        } else {
          await SerialNumber.create({
            product: item.product,
            serialNumber: sn,
            status: "Available",
            location: locationObj.name,
            transactionReference: receiving.receivingNumber,
          });
        }
      }
    }

    // c. Create InventoryMovement record if not already created
    if (!existingMovement) {
      if (session) {
        await InventoryMovement.create(
          [
            {
              product: item.product,
              quantity: item.quantityReceived,
              serialNumbers: item.serialNumbers || [],
              sourceName: "Supplier",
              destinationLocation: receiving.location,
              destinationName: locationObj.name,
              type: "PURCHASE_RECEIVING",
              referenceTransaction: receiving.receivingNumber,
              beforeQuantity,
              afterQuantity,
              performedBy: receiving.createdBy,
              approvedBy: approvedByUsername,
              condition: item.condition,
              date: new Date(),
            },
          ],
          { session }
        );
      } else {
        await InventoryMovement.create({
          product: item.product,
          quantity: item.quantityReceived,
          serialNumbers: item.serialNumbers || [],
          sourceName: "Supplier",
          destinationLocation: receiving.location,
          destinationName: locationObj.name,
          type: "PURCHASE_RECEIVING",
          referenceTransaction: receiving.receivingNumber,
          beforeQuantity,
          afterQuantity,
          performedBy: receiving.createdBy,
          approvedBy: approvedByUsername,
          condition: item.condition,
          date: new Date(),
        });
      }
    }
  }

  // 4. Update Parent Purchase Invoice Status
  const invoice = await PurchaseInvoice.findById(receiving.purchaseInvoice, null, sessionOptions);
  if (invoice) {
    const otherApprovedReceivings = await PurchaseReceiving.find({
      purchaseInvoice: invoice._id,
      status: "Approved",
    }, null, sessionOptions);

    const totalReceivedMap: Record<string, number> = {};

    for (const rec of otherApprovedReceivings) {
      for (const item of rec.items) {
        const pStr = item.product.toString();
        totalReceivedMap[pStr] = (totalReceivedMap[pStr] || 0) + item.quantityReceived;
      }
    }

    for (const item of receiving.items) {
      const pStr = item.product.toString();
      totalReceivedMap[pStr] = (totalReceivedMap[pStr] || 0) + item.quantityReceived;
    }

    let allFullyReceived = true;
    for (const item of invoice.items) {
      const pStr = item.product.toString();
      const received = totalReceivedMap[pStr] || 0;
      if (received < item.quantity) {
        allFullyReceived = false;
        break;
      }
    }

    if (allFullyReceived) {
      invoice.status = "Inventory_Updated";
    } else {
      invoice.status = "Receiving";
    }
    await invoice.save(sessionOptions);
  }

  // 5. Update receiving status to Approved
  receiving.status = "Approved";
  receiving.approvedBy = approvedByUsername;
  receiving.approvedAt = new Date();
  await receiving.save(sessionOptions);

  return { alreadyApproved: false, receiving };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    // Only Admin and Accountant can approve receiving
    const auth = await verifyRole(["Admin", "Accountant"]);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;

    // Try executing inside a MongoDB Transaction Session first
    let session: mongoose.ClientSession | undefined;
    let useTransaction = true;

    try {
      session = await mongoose.startSession();
      session.startTransaction();
    } catch (sessionError) {
      // MongoDB environment does not support sessions/replica set
      useTransaction = false;
      session = undefined;
    }

    if (useTransaction && session) {
      try {
        const result = await processReceivingApproval(id, auth.user.username, session);
        await session.commitTransaction();
        await session.endSession();
        return NextResponse.json({
          success: true,
          message: "Receiving approved successfully.",
          data: result.receiving,
        });
      } catch (txnError: any) {
        // Abort session transaction
        try {
          if (session.inTransaction()) {
            await session.abortTransaction();
          }
          await session.endSession();
        } catch (e) {
          // ignore session cleanup error
        }

        // If the error was a MongoDB transaction error (standalone DB / aborted txn error), fallback to direct execution
        const errMsg = txnError.message || "";
        const isTxnIssue =
          errMsg.includes("Transaction with") ||
          errMsg.includes("aborted") ||
          errMsg.includes("replica set") ||
          errMsg.includes("Transaction numbers are only allowed");

        if (isTxnIssue) {
          // Fallback to direct non-transactional execution
          const fallbackResult = await processReceivingApproval(id, auth.user.username);
          return NextResponse.json({
            success: true,
            message: "Receiving approved successfully.",
            data: fallbackResult.receiving,
          });
        } else {
          // It was a real validation error (e.g. duplicate serial number or missing product)
          return NextResponse.json(
            { success: false, error: errMsg },
            { status: 400 }
          );
        }
      }
    } else {
      // Fallback direct execution for standalone MongoDB without replica set
      const result = await processReceivingApproval(id, auth.user.username);
      return NextResponse.json({
        success: true,
        message: "Receiving approved successfully.",
        data: result.receiving,
      });
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to approve receiving transaction." },
      { status: 500 }
    );
  }
}
