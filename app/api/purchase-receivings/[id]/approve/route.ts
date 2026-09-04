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

const isTransactionUnsupported = (error: any) => {
  const msg = error.message || "";
  const code = error.code;
  return (
    code === 20 ||
    msg.includes("replica set") ||
    msg.includes("Transaction numbers are only allowed") ||
    msg.includes("sharded cluster") ||
    msg.includes("sessions are not supported") ||
    msg.includes("sessions")
  );
};

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

    // Start Session and Transaction
    let session;
    try {
      session = await mongoose.startSession();
    } catch (sessionError: any) {
      return NextResponse.json({
        success: false,
        error: "MongoDB transactions are required for inventory operations. Please configure MongoDB as a Replica Set to proceed.",
        debugError: sessionError.message
      }, { status: 500 });
    }

    session.startTransaction();

    try {
      // 1. Fetch receiving record
      const receiving = await PurchaseReceiving.findById(id).session(session);
      if (!receiving) {
        throw new Error("Receiving record not found.");
      }

      if (receiving.status === "Approved") {
        await session.commitTransaction();
        return NextResponse.json({ success: true, message: "Receiving is already approved.", data: receiving });
      }

      if (receiving.status !== "Pending_Approval") {
        throw new Error(`Only Pending Approval receiving documents can be approved. Current status: ${receiving.status}`);
      }

      // 2. Fetch destination location
      const locationObj = await Location.findById(receiving.location).session(session);
      if (!locationObj || !locationObj.active) {
        throw new Error("Destination location is inactive or invalid.");
      }

      // 3. Update Inventory, SerialNumbers, and InventoryMovement for each item
      for (const item of receiving.items) {
        const productObj = await Product.findById(item.product).session(session);
        if (!productObj) {
          throw new Error(`Product not found: ${item.product}`);
        }

        // a. Check/Update Inventory
        let inventory = await Inventory.findOne({
          product: item.product,
          location: receiving.location,
          condition: item.condition,
        }).session(session);

        const beforeQuantity = inventory ? inventory.quantity : 0;

        if (!inventory) {
          inventory = new Inventory({
            product: item.product,
            location: receiving.location,
            condition: item.condition,
            quantity: item.quantityReceived,
            serialTracking: productObj.serialTracking,
          });
        } else {
          inventory.quantity += item.quantityReceived;
        }

        await inventory.save({ session });
        const afterQuantity = inventory.quantity;

        // b. If serialized, check and insert SerialNumbers
        if (productObj.serialTracking) {
          if (!item.serialNumbers || item.serialNumbers.length !== item.quantityReceived) {
            throw new Error(`Product "${productObj.name}" requires serial numbers but they are missing or length mismatch.`);
          }

          for (const sn of item.serialNumbers) {
            const existingSerial = await SerialNumber.findOne({ serialNumber: sn }).session(session);
            if (existingSerial) {
              throw new Error(`Serial number "${sn}" already exists in the system (Product: ${existingSerial.product}). Duplicate registration rejected.`);
            }

            // Create serial number as Available
            await SerialNumber.create(
              [
                {
                  product: item.product,
                  serialNumber: sn,
                  status: "Available",
                  location: locationObj.name, // Store location name
                  transactionReference: receiving.receivingNumber,
                },
              ],
              { session }
            );
          }
        }

        // c. Create InventoryMovement record
        await InventoryMovement.create(
          [
            {
              product: item.product,
              quantity: item.quantityReceived,
              serialNumbers: item.serialNumbers || [],
              sourceName: "Supplier", // For purchase receiving
              destinationLocation: receiving.location,
              destinationName: locationObj.name,
              type: "PURCHASE_RECEIVING",
              referenceTransaction: receiving.receivingNumber,
              beforeQuantity,
              afterQuantity,
              performedBy: receiving.createdBy,
              approvedBy: auth.user.username,
              date: new Date(),
            },
          ],
          { session }
        );
      }

      // 4. Update Parent Purchase Invoice Status
      const invoice = await PurchaseInvoice.findById(receiving.purchaseInvoice).session(session);
      if (!invoice) {
        throw new Error("Associated Purchase Invoice not found.");
      }

      // Fetch other APPROVED receivings to calculate outstanding
      const otherApprovedReceivings = await PurchaseReceiving.find({
        purchaseInvoice: invoice._id,
        status: "Approved",
      }).session(session);

      // Aggregate total received including current session
      const totalReceivedMap: Record<string, number> = {};
      
      // 1. Add other approved receivings
      for (const rec of otherApprovedReceivings) {
        for (const item of rec.items) {
          const pStr = item.product.toString();
          totalReceivedMap[pStr] = (totalReceivedMap[pStr] || 0) + item.quantityReceived;
        }
      }

      // 2. Add current receiving items (since it's being approved now)
      for (const item of receiving.items) {
        const pStr = item.product.toString();
        totalReceivedMap[pStr] = (totalReceivedMap[pStr] || 0) + item.quantityReceived;
      }

      // 3. Compare with invoice ordered quantities
      let allFullyReceived = true;
      for (const item of invoice.items) {
        const pStr = item.product.toString();
        const received = totalReceivedMap[pStr] || 0;
        if (received < item.quantity) {
          allFullyReceived = false;
          break;
        }
      }

      // Transition Purchase Invoice status
      if (allFullyReceived) {
        invoice.status = "Inventory_Updated";
      } else {
        invoice.status = "Receiving";
      }
      await invoice.save({ session });

      // 5. Update receiving status to Approved
      receiving.status = "Approved";
      receiving.approvedBy = auth.user.username;
      receiving.approvedAt = new Date();
      await receiving.save({ session });

      // Commit transaction
      await session.commitTransaction();
      await session.endSession();

      return NextResponse.json({ success: true, data: receiving });
    } catch (error: any) {
      try {
        if (session && session.inTransaction()) {
          await session.abortTransaction();
        }
      } catch (abortError) {
        console.warn("Failed to abort transaction:", abortError);
      }
      try {
        if (session) {
          await session.endSession();
        }
      } catch (endError) {
        console.warn("Failed to end session:", endError);
      }
      throw error;
    }
  } catch (error: any) {
    if (isTransactionUnsupported(error)) {
      return NextResponse.json(
        {
          success: false,
          error: "MongoDB transactions are required for inventory operations. Please configure MongoDB as a Replica Set to proceed.",
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { success: false, error: error.message || "Failed to approve receiving transaction." },
      { status: 500 }
    );
  }
}
