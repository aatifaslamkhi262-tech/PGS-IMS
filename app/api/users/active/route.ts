import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { User } from "@/models/User";
import { verifyRole } from "@/lib/auth/rbac";

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Branch", "Salesman"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const activeUsers = await User.find({ active: true })
      .select("name username role assignedLocation")
      .populate("assignedLocation", "name code type")
      .sort({ name: 1 })
      .lean();

    return NextResponse.json({ success: true, data: activeUsers });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch active users." },
      { status: 500 }
    );
  }
}
