import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { SerialNumber } from "@/models/SerialNumber";
import { Product } from "@/models/Product";

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

    if (!body.serialNumbers || !Array.isArray(body.serialNumbers) || body.serialNumbers.length === 0) {
      return NextResponse.json(
        { success: false, error: "Serial numbers array is required." },
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

    // Validate serial tracking is enabled for product
    if (!product.serialTracking) {
      return NextResponse.json(
        { success: false, error: "Serial tracking is not enabled for this product." },
        { status: 400 }
      );
    }

    const serialNumbers = body.serialNumbers;
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
          status: body.status || "Available",
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
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create serial numbers" },
      { status: 500 }
    );
  }
}
