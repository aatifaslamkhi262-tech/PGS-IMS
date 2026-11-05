import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Shift } from "@/models/Shift";
import { verifyRole } from "@/lib/auth/rbac";
import { recordHRAuditLog } from "@/lib/hr/auditLog";

export async function GET() {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "HR", "Warehouse", "Accountant"]);
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    const count = await Shift.countDocuments();
    if (count === 0) {
      await Shift.insertMany([
        {
          name: "Standard Shop Shift (10h)",
          code: "SHOP-10H",
          shiftType: "FIXED",
          startTime: "10:00",
          endTime: "20:00",
          paidDailyHours: 10,
          breakMinutes: 60,
          graceMinutes: 15,
          halfDayThresholdMinutes: 90,
          crossesMidnight: false,
          weeklyOffDays: [0],
          active: true,
        },
        {
          name: "Standard Warehouse Shift (8h)",
          code: "WH-8H",
          shiftType: "FIXED",
          startTime: "09:00",
          endTime: "17:00",
          paidDailyHours: 8,
          breakMinutes: 60,
          graceMinutes: 15,
          halfDayThresholdMinutes: 90,
          crossesMidnight: false,
          weeklyOffDays: [0],
          active: true,
        },
        {
          name: "Part-Time Flexible (3h)",
          code: "FLEX-3H",
          shiftType: "FLEXIBLE_HOURS",
          startTime: "00:00",
          endTime: "23:59",
          paidDailyHours: 3,
          breakMinutes: 0,
          graceMinutes: 0,
          halfDayThresholdMinutes: 90,
          crossesMidnight: false,
          weeklyOffDays: [0],
          active: true,
        },
      ]);
    }

    const shifts = await Shift.find({}).sort({ createdAt: 1 }).lean();
    return NextResponse.json({ success: true, data: shifts });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch shifts." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "HR", "Warehouse"]);
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    const body = await req.json();
    const {
      name,
      code,
      shiftType,
      startTime,
      endTime,
      paidDailyHours,
      breakMinutes,
      graceMinutes,
      halfDayThresholdMinutes,
      crossesMidnight,
      weeklyOffDays,
    } = body;

    if (!name || !code) {
      return NextResponse.json(
        { success: false, error: "Shift name and code are required." },
        { status: 400 }
      );
    }

    const created = await Shift.create({
      name: name.trim(),
      code: code.trim().toUpperCase(),
      shiftType: shiftType || "FIXED",
      startTime: startTime || "10:00",
      endTime: endTime || "20:00",
      paidDailyHours: Number(paidDailyHours) || 8,
      breakMinutes: Number(breakMinutes ?? 60),
      graceMinutes: Number(graceMinutes ?? 15),
      halfDayThresholdMinutes: Number(halfDayThresholdMinutes ?? 90),
      crossesMidnight: Boolean(crossesMidnight),
      weeklyOffDays: Array.isArray(weeklyOffDays) ? weeklyOffDays : [0],
      active: true,
    });

    await recordHRAuditLog({
      action: "SHIFT_CREATED",
      module: "HR_SHIFT_HOLIDAY",
      targetId: created._id.toString(),
      targetLabel: `${created.name} (${created.code})`,
      valueBefore: null,
      valueAfter: {
        shiftType: created.shiftType,
        startTime: created.startTime,
        endTime: created.endTime,
        paidDailyHours: created.paidDailyHours,
        graceMinutes: created.graceMinutes,
      },
      reason: "Created new shift template",
      performedBy: auth.user?.userId,
      performedByName: auth.user?.username,
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create shift." },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "HR", "Warehouse"]);
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    const body = await req.json();
    const { _id, reason, ...updates } = body;
    if (!_id) {
      return NextResponse.json(
        { success: false, error: "Shift ID is required." },
        { status: 400 }
      );
    }

    const existing = await Shift.findById(_id).lean();
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Shift not found." },
        { status: 404 }
      );
    }

    const updated = await Shift.findByIdAndUpdate(
      _id,
      { $set: updates },
      { returnDocument: "after" }
    ).lean();

    await recordHRAuditLog({
      action: "SHIFT_UPDATED",
      module: "HR_SHIFT_HOLIDAY",
      targetId: _id.toString(),
      targetLabel: `${existing.name} (${existing.code})`,
      valueBefore: {
        startTime: existing.startTime,
        endTime: existing.endTime,
        paidDailyHours: existing.paidDailyHours,
        graceMinutes: existing.graceMinutes,
      },
      valueAfter: {
        startTime: updated?.startTime,
        endTime: updated?.endTime,
        paidDailyHours: updated?.paidDailyHours,
        graceMinutes: updated?.graceMinutes,
      },
      reason: reason || "Updated shift settings",
      performedBy: auth.user?.userId,
      performedByName: auth.user?.username,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update shift." },
      { status: 500 }
    );
  }
}

