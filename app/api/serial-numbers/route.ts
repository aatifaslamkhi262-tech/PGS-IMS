import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { SerialNumber } from "@/models/SerialNumber";
import { Product } from "@/models/Product";

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);

    const product = searchParams.get("product") || "";
    const status = searchParams.get("status") || "";
    const serialNumber = searchParams.get("serialNumber") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const query: any = {};

    if (product) query.product = product;
    if (status) query.status = status;
    if (serialNumber) {
      const searchRegex = new RegExp(serialNumber.trim(), "i");
      query.serialNumber = searchRegex;
    }

    const skip = (page - 1) * limit;

    const [serialNumbers, total] = await Promise.all([
      SerialNumber.find(query)
        .populate("product", "name sku barcode")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SerialNumber.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: serialNumbers,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch serial numbers" },
      { status: 500 }
    );
  }
}

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

    if (!body.serialNumber || !body.serialNumber.trim()) {
      return NextResponse.json(
        { success: false, error: "Serial Number is required." },
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

    const cleanSerialNumber = body.serialNumber.trim();

    // Validate serial number uniqueness globally
    const existingSerial = await SerialNumber.findOne({ serialNumber: cleanSerialNumber });
    if (existingSerial) {
      return NextResponse.json(
        { success: false, error: `Serial Number "${cleanSerialNumber}" already exists.` },
        { status: 400 }
      );
    }

    // Validate serial number uniqueness per product
    const existingProductSerial = await SerialNumber.findOne({
      product: body.product,
      serialNumber: cleanSerialNumber,
    });
    if (existingProductSerial) {
      return NextResponse.json(
        { success: false, error: `Serial Number "${cleanSerialNumber}" already exists for this product.` },
        { status: 400 }
      );
    }

    const serialNumber = await SerialNumber.create({
      product: body.product,
      serialNumber: cleanSerialNumber,
      status: body.status || "Available",
      location: body.location || undefined,
      transactionReference: body.transactionReference || undefined,
      invoiceId: body.invoiceId || undefined,
      notes: body.notes || undefined,
    });

    const populatedSerial = await SerialNumber.findById(serialNumber._id)
      .populate("product", "name sku barcode");

    return NextResponse.json({ success: true, data: populatedSerial }, { status: 201 });
  } catch (error: any) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0] || "Field";
      return NextResponse.json(
        { success: false, error: `Duplicate value error on field: ${field}.` },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: error.message || "Failed to create serial number" },
      { status: 500 }
    );
  }
}
