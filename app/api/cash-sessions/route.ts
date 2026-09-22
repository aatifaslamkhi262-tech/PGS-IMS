import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { CashSession } from "@/models/CashSession";
import { openCashSession, closeCashSession } from "@/lib/cashSessionEngine";
import { verifyRole } from "@/lib/auth/rbac";

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Branch"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const locationId = searchParams.get("locationId");
    const status = searchParams.get("status");

    const query: any = {};
    if (locationId) query.location = locationId;
    if (status) query.status = status;

    const sessions = await CashSession.find(query).sort({ openedAt: -1 }).limit(50).lean();
    return NextResponse.json({ success: true, data: sessions });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch cash sessions." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Branch"]);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const { action, locationId, openingCash, sessionId, actualCashCount, varianceReason, notes } = body;

    if (action === "OPEN") {
      if (!locationId) {
        return NextResponse.json({ success: false, error: "Location ID is required to open session." }, { status: 400 });
      }
      const openResult = await openCashSession({
        locationId,
        cashierUsername: auth.user.username,
        openingCash: Number(openingCash || 0),
        notes,
      });

      return NextResponse.json({
        success: true,
        message: openResult.isNew ? "Cash register session opened." : "Active session already open.",
        data: openResult.session,
      });
    }

    if (action === "CLOSE") {
      if (!sessionId) {
        return NextResponse.json({ success: false, error: "Session ID is required to close register." }, { status: 400 });
      }
      const closedSession = await closeCashSession({
        sessionId,
        cashierUsername: auth.user.username,
        actualCashCount: Number(actualCashCount || 0),
        varianceReason,
        notes,
      });

      return NextResponse.json({
        success: true,
        message: "Cash register session closed (Z-Report generated).",
        data: closedSession,
      });
    }

    return NextResponse.json({ success: false, error: "Invalid action. Use 'OPEN' or 'CLOSE'." }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process cash session operation." },
      { status: 500 }
    );
  }
}
