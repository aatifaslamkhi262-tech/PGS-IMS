import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Product } from "@/models/Product";
import { SerialNumber } from "@/models/SerialNumber";
import { verifyRole } from "@/lib/auth/rbac";

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    // Verify user is logged in
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const serialNumber = searchParams.get("serialNumber") || "";

    if (!serialNumber.trim()) {
      return NextResponse.json({ success: false, error: "Serial number parameter is required." }, { status: 400 });
    }

    const existing = await SerialNumber.findOne({ serialNumber: serialNumber.trim() })
      .populate("product", "name sku condition")
      .lean();

    const isAvailable = existing?.status === "Available";
    const isSold = existing?.status === "Sold";

    return NextResponse.json({
      success: true,
      exists: !!existing,
      status: existing?.status || null,
      isAvailable,
      isSold,
      productName: (existing?.product as any)?.name || null,
      message: existing
        ? isSold
          ? `Serial previously sold on "${(existing?.product as any)?.name || "product"}". Can be re-acquired into inventory.`
          : `Serial number already exists with status "${existing.status}".`
        : "Serial number is unique.",
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to verify serial number." },
      { status: 500 }
    );
  }
}
