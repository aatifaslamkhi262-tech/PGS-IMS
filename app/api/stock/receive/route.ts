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

    // If serial tracking is enabled, validate serial numbers
    if (product.serialTracking) {
      if (!serialNumbers || !Array.isArray(serialNumbers) || serialNumbers.length !== quantity) {
        return NextResponse.json(
          { success: false, error: `Serial tracking is enabled for this product. Please provide exactly ${quantity} serial numbers.` },
          { status: 400 }
        );
      }

      // Validate and create serial numbers
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

          // Validate serial number uniqueness globally
          const existingSerial = await SerialNumber.findOne({ serialNumber: serialNumberValue });
          if (existingSerial) {
            results.failed.push({ serialNumber: serialNumberValue, error: "Serial number already exists" });
            continue;
          }

          // Validate serial number uniqueness per product
          const existingProductSerial = await SerialNumber.findOne({
            product: body.product,
            serialNumber: serialNumberValue,
          });
          if (existingProductSerial) {
            results.failed.push({ serialNumber: serialNumberValue, error: "Serial number already exists for this product" });
            continue;
          }

          const serialNumber = await SerialNumber.create({
            product: body.product,
            serialNumber: serialNumberValue,
            status: "Available",
            location: body.location || undefined,
            transactionReference: body.transactionReference || undefined,
            notes: body.notes || undefined,
          });

          results.successful.push(serialNumber);
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
          message: `Stock receiving completed for product "${product.name}". ${results.successful.length} serial numbers added successfully.`,
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
          message: `Stock receiving completed for product "${product.name}". Quantity: ${quantity}. Serial tracking is disabled - no individual serial numbers required.`,
        }
      });
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to receive stock" },
      { status: 500 }
    );
  }
}
