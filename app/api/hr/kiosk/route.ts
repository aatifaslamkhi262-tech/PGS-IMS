import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Attendance } from "@/models/Attendance";
import "@/models/Employee";
import "@/models/Location";
import { verifyRole } from "@/lib/auth/rbac";
import {
  processKioskScan,
  toPKTDateString,
  flagStaleMissingCheckouts,
} from "@/lib/hr/attendanceEngine";

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "HR", "Warehouse", "Guard"]);
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    const now = new Date();
    await flagStaleMissingCheckouts(now);
    const todayStr = toPKTDateString(now);

    const { searchParams } = new URL(req.url);
    const locationId = searchParams.get("locationId") || "";

    const query: any = { date: todayStr, checkIn: { $ne: null } };
    if (locationId) query.location = locationId;

    const recentPunches = await Attendance.find(query)
      .populate("employee", "name employeeCode designation photoUrl requiredDailyHours dutyType")
      .populate("location", "name code")
      .sort({ updatedAt: -1 })
      .limit(12)
      .lean();

    return NextResponse.json({
      success: true,
      serverTime: now.toISOString(),
      todayDate: todayStr,
      data: recentPunches,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load kiosk state." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "HR", "Warehouse", "Guard"]);
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    const body = await req.json();
    const forwardedFor = req.headers.get("x-forwarded-for");
    const ipAddress = forwardedFor ? forwardedFor.split(",")[0].trim() : "127.0.0.1";

    const result = await processKioskScan({
      cardUid: body.cardUid,
      employeeCode: body.employeeCode,
      pin: body.pin,
      locationId: body.locationId,
      action: body.action || "AUTO",
      claimedArrivalTimeStr: body.claimedArrivalTimeStr,
      claimedArrivalReason: body.claimedArrivalReason,
      performedByUserId: auth.user?.userId,
      performedByName: auth.user?.username,
      ipAddress,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        kioskState: "INVALID_CARD",
        title: "SYSTEM ERROR",
        message: error.message || "Failed to process scan.",
        serverTime: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

