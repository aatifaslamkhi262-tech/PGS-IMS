import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Product } from "@/models/Product";

export async function generateSystemBarcode(prefix: string = "PGS"): Promise<string> {
  await dbConnect();
  let uniqueBarcode = "";
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const randomNum = Math.floor(100000000 + Math.random() * 900000000).toString();
    uniqueBarcode = `${prefix.toUpperCase()}-${randomNum}`;

    const existing = await Product.findOne({
      barcode: uniqueBarcode,
      isDeleted: false,
    });

    if (!existing) {
      break;
    }
    attempts++;
  }

  if (attempts >= maxAttempts) {
    throw new Error("Failed to generate unique system barcode after maximum attempts.");
  }

  return uniqueBarcode;
}

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const prefix = searchParams.get("prefix") || "PGS";

    const uniqueBarcode = await generateSystemBarcode(prefix);

    return NextResponse.json({ 
      success: true, 
      barcode: uniqueBarcode,
      message: "Barcode generated successfully. Note: This barcode identifies the product, not individual units."
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to generate barcode" },
      { status: 500 }
    );
  }
}
