import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { CustomerLedger } from "@/models/CustomerLedger";
import { verifyRole } from "@/lib/auth/rbac";

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Salesman", "Branch"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get("customerId");

    if (!customerId) {
      return NextResponse.json({ success: false, error: "customerId query parameter is required." }, { status: 400 });
    }

    const entries = await CustomerLedger.find({ customer: customerId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return NextResponse.json({ success: true, data: entries });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch customer ledger entries." },
      { status: 500 }
    );
  }
}
