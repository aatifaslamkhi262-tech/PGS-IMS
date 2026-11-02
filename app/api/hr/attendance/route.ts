import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Employee } from "@/models/Employee";
import { Attendance } from "@/models/Attendance";
import { Holiday } from "@/models/Holiday";
import "@/models/Location";
import { verifyRole } from "@/lib/auth/rbac";
import {
  toPKTDateString,
  checkDayOffOrHoliday,
  recomputeAttendanceRecord,
  calculateMonthlyTargetHours,
  flagStaleMissingCheckouts,
} from "@/lib/hr/attendanceEngine";
import { recordHRAuditLog } from "@/lib/hr/auditLog";

function buildPKTDateFromTimeStr(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  const [hh, mm] = timeStr.split(":").map((n) => parseInt(n, 10) || 0);
  const utcMs = Date.UTC(y, m - 1, d, hh, mm, 0) - 5 * 60 * 60 * 1000;
  return new Date(utcMs);
}

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

    const now = new Date();
    await flagStaleMissingCheckouts(now);

    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get("date") || toPKTDateString(now);
    const locationId = searchParams.get("locationId") || "";

    const [yearNum, monthNum, dayNum] = dateStr
      .split("-")
      .map((n) => parseInt(n, 10));
    const monthPrefix = `${yearNum}-${String(monthNum).padStart(2, "0")}`;

    const empQuery: any = { status: "ACTIVE" };
    if (locationId) empQuery.location = locationId;

    const employees = await Employee.find(empQuery)
      .select("-pinHash -cnicEncrypted")
      .populate("location", "name code type")
      .sort({ name: 1 })
      .lean();

    const holidaysInMonth = await Holiday.find({
      date: { $regex: `^${monthPrefix}` },
    }).lean();
    const holidayDates = holidaysInMonth.map((h) => h.date);
    const holidayToday = holidaysInMonth.find((h) => h.date === dateStr);

    // Fetch all attendance records for this month for monthly worked/target & off quota tracking
    const monthAttendances = await Attendance.find({
      date: { $regex: `^${monthPrefix}` },
    }).lean();

    // Also fetch any unresolved MISSING_CHECKOUT or PENDING early arrival claims across all dates
    const unresolvedAlerts = await Attendance.find({
      $or: [
        { status: "MISSING_CHECKOUT" },
        { claimedArrivalStatus: "PENDING" },
      ],
    })
      .populate("employee", "name employeeCode designation shiftStartTime shiftEndTime requiredDailyHours")
      .sort({ date: -1 })
      .limit(30)
      .lean();

    const dtObj = new Date(Date.UTC(yearNum, monthNum - 1, dayNum));
    const dayOfWeek = dtObj.getUTCDay();

    const rows = employees.map((emp: any) => {
      const empIdStr = emp._id.toString();
      const empMonthRecords = monthAttendances.filter(
        (r) => r.employee.toString() === empIdStr
      );
      const todayRec = empMonthRecords.find((r) => r.date === dateStr) || null;

      const isWeeklyOff =
        emp.offPolicy === "WEEKLY_FIXED" &&
        Array.isArray(emp.weeklyOffDays) &&
        emp.weeklyOffDays.includes(dayOfWeek);

      const targetSummary = calculateMonthlyTargetHours(
        emp,
        yearNum,
        monthNum,
        holidayDates
      );

      const monthWorkedMinutes = empMonthRecords.reduce(
        (acc, r) => acc + (r.workedMinutes || 0),
        0
      );
      const paidOffsUsedThisMonth = empMonthRecords.filter(
        (r) => r.status === "PAID_OFF" || r.status === "WEEKLY_OFF"
      ).length;

      let syntheticStatus = "ABSENT";
      if (holidayToday) {
        syntheticStatus = "HOLIDAY";
      } else if (isWeeklyOff) {
        syntheticStatus = "WEEKLY_OFF";
      }

      return {
        employee: emp,
        date: dateStr,
        isWeeklyOff,
        isHoliday: !!holidayToday,
        holidayName: holidayToday?.name || null,
        attendance: todayRec,
        effectiveStatus: todayRec ? todayRec.status : syntheticStatus,
        monthStats: {
          workedMinutes: monthWorkedMinutes,
          workedHours: Number((monthWorkedMinutes / 60).toFixed(1)),
          targetHours: targetSummary.targetHours,
          workingDays: targetSummary.workingDays,
          paidOffsUsed: paidOffsUsedThisMonth,
          monthlyOffQuota: emp.monthlyOffQuota,
        },
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        date: dateStr,
        holidayToday: holidayToday || null,
        rows,
        unresolvedAlerts,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch attendance." },
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
      action, // "APPROVE_EARLY_ARRIVAL" | "REJECT_EARLY_ARRIVAL" | "MANUAL_UPDATE"
      attendanceId,
      employeeId,
      date,
      checkInTime,  // HH:mm
      checkOutTime, // HH:mm
      statusOverride,
      reason,
      notes,
    } = body;

    if (!reason || !String(reason).trim()) {
      return NextResponse.json(
        {
          success: false,
          error: "A written reason is mandatory for all attendance modifications (Audit Policy).",
        },
        { status: 400 }
      );
    }

    const now = new Date();

    // 1. Handle 1-click Early Arrival Claim Approval / Rejection (Edge Case 1)
    if (
      action === "APPROVE_EARLY_ARRIVAL" ||
      action === "REJECT_EARLY_ARRIVAL"
    ) {
      const att = await Attendance.findById(attendanceId);
      if (!att) {
        return NextResponse.json(
          { success: false, error: "Attendance record not found." },
          { status: 404 }
        );
      }

      const employee = await Employee.findById(att.employee);
      if (!employee) {
        return NextResponse.json(
          { success: false, error: "Employee not found." },
          { status: 404 }
        );
      }

      const beforeVal = {
        checkIn: att.checkIn,
        claimedArrivalTime: att.claimedArrivalTime,
        claimedArrivalStatus: att.claimedArrivalStatus,
        status: att.status,
        lateMinutes: att.lateMinutes,
        workedMinutes: att.workedMinutes,
      };

      if (action === "APPROVE_EARLY_ARRIVAL") {
        att.claimedArrivalStatus = "APPROVED";
        if (att.claimedArrivalTime) {
          att.checkIn = att.claimedArrivalTime;
        }
        att.flags = att.flags.filter((f) => f !== "EARLY_ARRIVAL_CLAIMED");
        if (!att.flags.includes("EARLY_ARRIVAL_APPROVED")) {
          att.flags.push("EARLY_ARRIVAL_APPROVED");
        }
      } else {
        att.claimedArrivalStatus = "REJECTED";
        att.flags = att.flags.filter((f) => f !== "EARLY_ARRIVAL_CLAIMED");
      }

      att.correctedBy = auth.user?.userId as any;
      att.correctedByName = auth.user?.username || "HR";
      att.correctedAt = now;

      const dayInfo = await checkDayOffOrHoliday(employee, att.date);
      recomputeAttendanceRecord(employee, att, dayInfo);
      await att.save();

      await recordHRAuditLog({
        action,
        module: "HR_ATTENDANCE",
        targetId: att._id.toString(),
        targetLabel: `${employee.name} (${employee.employeeCode}) — ${att.date}`,
        valueBefore: beforeVal,
        valueAfter: {
          checkIn: att.checkIn,
          claimedArrivalStatus: att.claimedArrivalStatus,
          status: att.status,
          lateMinutes: att.lateMinutes,
          workedMinutes: att.workedMinutes,
        },
        reason: reason.trim(),
        performedBy: auth.user?.userId,
        performedByName: auth.user?.username,
      });

      return NextResponse.json({
        success: true,
        message:
          action === "APPROVE_EARLY_ARRIVAL"
            ? "Early arrival time approved and attendance recalculated."
            : "Early arrival claim rejected.",
        data: att,
      });
    }

    // 2. Standard Manual Correction / Fix Missing Checkout / Mark Paid Off
    const targetEmpId = employeeId;
    const targetDate = date;
    if (!targetEmpId || !targetDate) {
      return NextResponse.json(
        { success: false, error: "Employee ID and Date are required." },
        { status: 400 }
      );
    }

    const employee = await Employee.findById(targetEmpId);
    if (!employee) {
      return NextResponse.json(
        { success: false, error: "Employee not found." },
        { status: 404 }
      );
    }

    let att = await Attendance.findOne({
      employee: employee._id,
      date: targetDate,
    });

    const beforeSnapshot = att
      ? {
          status: att.status,
          checkIn: att.checkIn,
          checkOut: att.checkOut,
          workedMinutes: att.workedMinutes,
        }
      : { status: "NONE / ABSENT", checkIn: null, checkOut: null };

    if (!att) {
      att = new Attendance({
        employee: employee._id,
        date: targetDate,
        location: employee.location || null,
        punchMethod: "HR_MANUAL",
        flags: ["MANUAL_CORRECTION"],
      });
    } else if (!att.flags.includes("MANUAL_CORRECTION")) {
      att.flags.push("MANUAL_CORRECTION");
    }

    if (checkInTime !== undefined) {
      att.checkIn = checkInTime
        ? buildPKTDateFromTimeStr(targetDate, checkInTime)
        : null;
    }

    if (checkOutTime !== undefined) {
      if (checkOutTime) {
        let outDate = buildPKTDateFromTimeStr(targetDate, checkOutTime);
        // Handle midnight crossover if checkOutTime is earlier in clock value than checkInTime
        if (att.checkIn && outDate < new Date(att.checkIn)) {
          outDate = new Date(outDate.getTime() + 24 * 60 * 60 * 1000);
        }
        att.checkOut = outDate;
        att.flags = att.flags.filter((f) => f !== "MISSING_CHECKOUT");
      } else {
        att.checkOut = null;
      }
    }

    const dayInfo = await checkDayOffOrHoliday(employee, targetDate);
    recomputeAttendanceRecord(employee, att, dayInfo);

    if (statusOverride) {
      att.status = statusOverride;
    }

    if (notes !== undefined) {
      att.notes = notes.trim();
    }

    att.correctedBy = auth.user?.userId as any;
    att.correctedByName = auth.user?.username || "HR";
    att.correctedAt = now;

    await att.save();

    await recordHRAuditLog({
      action:
        beforeSnapshot.status === "MISSING_CHECKOUT"
          ? "MISSING_CHECKOUT_FIXED"
          : "ATTENDANCE_MANUAL_EDIT",
      module: "HR_ATTENDANCE",
      targetId: att._id.toString(),
      targetLabel: `${employee.name} (${employee.employeeCode}) — ${targetDate}`,
      valueBefore: beforeSnapshot,
      valueAfter: {
        status: att.status,
        checkIn: att.checkIn,
        checkOut: att.checkOut,
        workedMinutes: att.workedMinutes,
      },
      reason: reason.trim(),
      performedBy: auth.user?.userId,
      performedByName: auth.user?.username,
    });

    return NextResponse.json({
      success: true,
      message: "Attendance record updated and logged in Audit History.",
      data: att,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to update attendance.",
      },
      { status: 500 }
    );
  }
}

