import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { CostAdjustment } from "@/models/CostAdjustment";
import { verifyRole } from "@/lib/auth/rbac";
import "@/models/User"; // Ensure User model is registered

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Owner", "Accountant"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const productId = searchParams.get("productId");

    if (!productId) {
      return NextResponse.json(
        { success: false, error: "Product ID is required" },
        { status: 400 }
      );
    }

    const adjustments = await CostAdjustment.find({ product: productId })
      .populate("changedBy", "name email role")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ success: true, data: adjustments });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch cost adjustment history" },
      { status: 500 }
    );
  }
}
