import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { verifyRole } from "@/lib/auth/rbac";
import { StockAudit } from "@/models/StockAudit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Owner"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const audit = await StockAudit.findById(id).lean();
    if (!audit) {
      return NextResponse.json({ success: false, error: "Stock audit not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: audit });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch stock audit details" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Owner"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const audit = await StockAudit.findById(id);
    if (!audit) {
      return NextResponse.json({ success: false, error: "Stock audit not found" }, { status: 404 });
    }

    if (audit.status !== "DRAFT") {
      return NextResponse.json(
        { success: false, error: "Only draft audits can be discarded or deleted" },
        { status: 400 }
      );
    }

    await StockAudit.findByIdAndDelete(id);

    return NextResponse.json({
      success: true,
      message: `Draft Audit #${audit.auditNumber} successfully discarded.`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete draft audit" },
      { status: 500 }
    );
  }
}

