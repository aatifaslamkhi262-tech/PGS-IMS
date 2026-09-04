import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/lib/db";
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

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    // Opening stock is restricted to Admin only
    const auth = await verifyRole(["Admin"]);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));
    const { product: productId, location: locationId, quantity: rawQty, serialNumbers, notes } = body;

    // 1. Validations
    if (!productId) {
      return NextResponse.json({ success: false, error: "Product reference is required." }, { status: 400 });
    }
    if (!locationId) {
      return NextResponse.json({ success: false, error: "Destination Location is required." }, { status: 400 });
    }
    const quantity = parseInt(rawQty, 10);
    if (isNaN(quantity) || quantity <= 0) {
      return NextResponse.json({ success: false, error: "Quantity must be a positive integer greater than 0." }, { status: 400 });
    }

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
      // Verify product
      const productObj = await Product.findById(productId).session(session);
      if (!productObj || productObj.isDeleted) {
        throw new Error("Product not found or is deleted.");
      }

      // Verify location
      const locationObj = await Location.findById(locationId).session(session);
      if (!locationObj || !locationObj.active) {
        throw new Error("Destination location is invalid or inactive.");
      }

      // 2. Validate serials if serialized
      const cleanSerials: string[] = [];
      if (productObj.serialTracking) {
        if (!serialNumbers || !Array.isArray(serialNumbers) || serialNumbers.length !== quantity) {
          throw new Error(`Serial tracking is enabled for "${productObj.name}". Please provide exactly ${quantity} serial numbers.`);
        }

        const tempSet = new Set<string>();
        for (const sn of serialNumbers) {
          const cleanSn = sn.trim();
          if (!cleanSn) {
            throw new Error(`Serial numbers cannot be empty.`);
          }
          if (tempSet.has(cleanSn)) {
            throw new Error(`Duplicate serial number "${cleanSn}" detected in the list.`);
          }
          tempSet.add(cleanSn);

          const existingSerial = await SerialNumber.findOne({ serialNumber: cleanSn }).session(session);
          if (existingSerial) {
            throw new Error(`Serial number "${cleanSn}" already exists in the system (Product: ${existingSerial.product}).`);
          }
          cleanSerials.push(cleanSn);
        }
      }

      // 3. Update Inventory
      let inventory = await Inventory.findOne({
        product: productId,
        location: locationId,
        condition: productObj.condition,
      }).session(session);

      const beforeQuantity = inventory ? inventory.quantity : 0;

      if (!inventory) {
        inventory = new Inventory({
          product: productId,
          location: locationId,
          condition: productObj.condition,
          quantity: quantity,
          serialTracking: productObj.serialTracking,
        });
      } else {
        inventory.quantity += quantity;
      }

      await inventory.save({ session });
      const afterQuantity = inventory.quantity;

      // 4. Create serials if serialized
      if (productObj.serialTracking) {
        for (const sn of cleanSerials) {
          await SerialNumber.create(
            [
              {
                product: productId,
                serialNumber: sn,
                status: "Available",
                location: locationObj.name,
                transactionReference: "Opening Stock",
              },
            ],
            { session }
          );
        }
      }

      // 5. Create audit log movement record
      await InventoryMovement.create(
        [
          {
            product: productId,
            quantity: quantity,
            serialNumbers: cleanSerials,
            sourceName: "Opening Balance",
            destinationLocation: locationId,
            destinationName: locationObj.name,
            type: "OPENING_STOCK",
            referenceTransaction: "Opening Stock",
            beforeQuantity,
            afterQuantity,
            performedBy: auth.user.username,
            date: new Date(),
            notes: notes?.trim() || undefined,
          },
        ],
        { session }
      );

      await session.commitTransaction();
      await session.endSession();

      return NextResponse.json({
        success: true,
        message: `Successfully posted ${quantity} units of opening stock for "${productObj.name}".`,
        data: {
          product: productObj.name,
          location: locationObj.name,
          quantity,
          serialTracking: productObj.serialTracking,
        },
      });
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
      { success: false, error: error.message || "Failed to post opening stock." },
      { status: 500 }
    );
  }
}
