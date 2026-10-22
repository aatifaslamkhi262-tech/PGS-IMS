import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/lib/db";
import { verifyRole } from "@/lib/auth/rbac";
import { StockAudit } from "@/models/StockAudit";
import { executeStockAuditReconciliation } from "@/lib/stockAuditEngine";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Owner"]);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const audit = await StockAudit.findById(id);
    if (!audit) {
      return NextResponse.json({ success: false, error: "Stock audit record not found" }, { status: 404 });
    }

    if (audit.status === "APPROVED") {
      return NextResponse.json({ success: false, error: "Audit is already approved" }, { status: 400 });
    }
    if (audit.status === "REJECTED") {
      return NextResponse.json({ success: false, error: "Cannot approve a rejected audit" }, { status: 400 });
    }

    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      await executeStockAuditReconciliation(audit._id.toString(), auth.user.username, session);
      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }

    const updated = await StockAudit.findById(id).lean();

    return NextResponse.json({
      success: true,
      message: `Stock Audit #${audit.auditNumber} approved and physical stock reconciled!`,
      data: updated,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to approve stock audit" },
      { status: 500 }
    );
  }
}
