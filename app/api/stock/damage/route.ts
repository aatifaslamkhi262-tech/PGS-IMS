import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Product } from "@/models/Product";
import { SerialNumber } from "@/models/SerialNumber";

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const body = await req.json();

    // Field Validations
    if (!body.product || !body.product.trim()) {
      return NextResponse.json(
        { success: false, error: "Product ID is required." },
        { status: 400 }
      );
    }

    if (!body.damageType || !["Damaged", "Claim"].includes(body.damageType)) {
      return NextResponse.json(
        { success: false, error: "Damage type must be either 'Damaged' or 'Claim'." },
        { status: 400 }
      );
    }

    // Validate product exists
    const product = await Product.findById(body.product);
    if (!product) {
      return NextResponse.json(
        { success: false, error: "Product not found." },
        { status: 404 }
      );
    }

    const quantity = parseInt(body.quantity) || 1;
    const serialNumbers = body.serialNumbers || [];

    // If serial tracking is enabled, validate and process serial numbers
    if (product.serialTracking) {
      if (!serialNumbers || !Array.isArray(serialNumbers) || serialNumbers.length !== quantity) {
        return NextResponse.json(
          { success: false, error: `Serial tracking is enabled for this product. Please provide exactly ${quantity} serial numbers to mark as ${body.damageType}.` },
          { status: 400 }
        );
      }

      const results = {
        successful: [] as any[],
        failed: [] as { serialNumber: string; error: string }[],
      };

      for (const serialItem of serialNumbers) {
        try {
          const serialNumberValue = typeof serialItem === 'string' ? serialItem.trim() : serialItem.serialNumber?.trim();
          
          if (!serialNumberValue) {
            results.failed.push({ serialNumber: serialItem, error: "Empty serial number" });
            continue;
          }

          // Find the serial number
          const serial = await SerialNumber.findOne({
            product: body.product,
            serialNumber: serialNumberValue,
          });

          if (!serial) {
            results.failed.push({ serialNumber: serialNumberValue, error: "Serial number not found for this product" });
            continue;
          }

          // Check if serial is available (can only damage available items)
          if (serial.status !== "Available") {
            results.failed.push({ serialNumber: serialNumberValue, error: `Serial number is not available (current status: ${serial.status})` });
            continue;
          }

          // Update serial status to Damaged or Claim
          serial.status = body.damageType;
          serial.damageDate = new Date();
          serial.transactionReference = body.transactionReference || undefined;
          serial.notes = body.notes || undefined;
          await serial.save();

          results.successful.push(serial);
        } catch (error: any) {
          results.failed.push({ 
            serialNumber: typeof serialItem === 'string' ? serialItem : serialItem.serialNumber, 
            error: error.message 
          });
        }
      }

      return NextResponse.json({ 
        success: true, 
        data: results,
        summary: {
          total: serialNumbers.length,
          successful: results.successful.length,
          failed: results.failed.length,
          message: `${body.damageType} marked for product "${product.name}". ${results.successful.length} serial numbers updated successfully.`,
        }
      });
    } else {
      // Serial tracking is disabled - just return confirmation
      // In a full implementation, this would update inventory quantity in a separate inventory module
      return NextResponse.json({ 
        success: true, 
        data: {
          product: product._id,
          productName: product.name,
          quantity,
          damageType: body.damageType,
          serialTracking: false,
          message: `${body.damageType} recorded for product "${product.name}". Quantity: ${quantity}. Serial tracking is disabled - quantity-based inventory.`,
        }
      });
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to record damage/claim" },
      { status: 500 }
    );
  }
}
