import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { HRAuditLog } from "@/models/HRAuditLog";
import { verifyRole } from "@/lib/auth/rbac";

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "HR", "Warehouse"]);
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    const { searchParams } = new URL(req.url);
    const moduleFilter = searchParams.get("module") || "";
    const search = searchParams.get("search") || "";
    const limit = Math.min(200, parseInt(searchParams.get("limit") || "100", 10));

    const query: any = {};
    if (moduleFilter) query.module = moduleFilter;
    if (search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      query.$or = [
        { action: regex },
        { targetLabel: regex },
        { reason: regex },
        { performedByName: regex },
      ];
    }

    const logs = await HRAuditLog.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .lean();

    // Verify hash-chain linkage across sequential logs
    const chronological = await HRAuditLog.find({})
      .sort({ createdAt: 1, _id: 1 })
      .select("previousHash entryHash")
      .limit(500)
      .lean();

    let chainValid = true;
    for (let i = 1; i < chronological.length; i++) {
      if (chronological[i].previousHash !== chronological[i - 1].entryHash) {
        chainValid = false;
        break;
      }
    }

    return NextResponse.json({
      success: true,
      chainValid,
      totalChecked: chronological.length,
      data: logs,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch audit logs." },
      { status: 500 }
    );
  }
}

