import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { verifyRole } from "@/lib/auth/rbac";
import { StockAudit } from "@/models/StockAudit";

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
    const body = await req.json();
    const { reason } = body;

    const audit = await StockAudit.findById(id);
    if (!audit) {
      return NextResponse.json({ success: false, error: "Stock audit record not found" }, { status: 404 });
    }

    if (audit.status === "APPROVED") {
      return NextResponse.json({ success: false, error: "Cannot reject an already approved audit" }, { status: 400 });
    }

    audit.status = "REJECTED";
    audit.rejectedBy = auth.user.username;
    audit.rejectionReason = reason || "Rejected by administrator. Recount requested.";
    await audit.save();

    return NextResponse.json({
      success: true,
      message: `Stock Audit #${audit.auditNumber} rejected.`,
      data: audit,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to reject stock audit" },
      { status: 500 }
    );
  }
}
