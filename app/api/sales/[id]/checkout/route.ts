import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { completeSale } from "@/lib/salesEngine";
import { verifyRole } from "@/lib/auth/rbac";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant"]);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const body = await req.json();
    const { paymentAllocations, notes } = body;

    if (!paymentAllocations || !Array.isArray(paymentAllocations) || paymentAllocations.length === 0) {
      return NextResponse.json({ success: false, error: "Payment allocations are required." }, { status: 400 });
    }

    const result = await completeSale({
      saleId: id,
      completedBy: auth.user.username,
      paymentAllocations,
      notes,
    });

    return NextResponse.json({
      success: true,
      message: result.alreadyCompleted
        ? "Sale was already completed."
        : "Sale completed and invoice finalized successfully.",
      data: result.sale,
      invoice: result.invoice,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to complete sale checkout." },
      { status: 500 }
    );
  }
}
