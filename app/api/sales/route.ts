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

    if (!body.quantity || body.quantity <= 0) {
      return NextResponse.json(
        { success: false, error: "Quantity must be greater than 0." },
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

    const quantity = parseInt(body.quantity);
    const serialNumbers = body.serialNumbers || [];

    // If serial tracking is enabled, validate and process serial numbers
    if (product.serialTracking) {
      if (!serialNumbers || !Array.isArray(serialNumbers) || serialNumbers.length !== quantity) {
        return NextResponse.json(
          { success: false, error: `Serial tracking is enabled for this product. Please select exactly ${quantity} serial numbers to sell.` },
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

          // Check if serial is available
          if (serial.status !== "Available") {
            results.failed.push({ serialNumber: serialNumberValue, error: `Serial number is not available (current status: ${serial.status})` });
            continue;
          }

          // Update serial status to Sold
          serial.status = "Sold";
          serial.saleDate = new Date();
          serial.transactionReference = body.transactionReference || undefined;
          serial.invoiceId = body.invoiceId || undefined;
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
          message: `Sale completed for product "${product.name}". ${results.successful.length} serial numbers marked as sold.`,
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
          serialTracking: false,
          message: `Sale completed for product "${product.name}". Quantity: ${quantity}. Serial tracking is disabled - quantity-based inventory.`,
        }
      });
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process sale" },
      { status: 500 }
    );
  }
}
