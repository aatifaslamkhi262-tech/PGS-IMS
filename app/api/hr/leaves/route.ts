import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { LeaveRequest } from "@/models/LeaveRequest";
import { Employee } from "@/models/Employee";
import { Attendance } from "@/models/Attendance";
import { MonthlyPayroll } from "@/models/MonthlyPayroll";
import { verifyRole } from "@/lib/auth/rbac";
import { recordHRAuditLog } from "@/lib/hr/auditLog";

function getDatesBetween(startDateStr: string, endDateStr: string): string[] {
  const [sY, sM, sD] = startDateStr.split("-").map((n) => parseInt(n, 10));
  const [eY, eM, eD] = endDateStr.split("-").map((n) => parseInt(n, 10));
  const curr = new Date(Date.UTC(sY, sM - 1, sD));
  const endUtc = new Date(Date.UTC(eY, eM - 1, eD));
  const dates: string[] = [];

  while (curr <= endUtc) {
    const y = curr.getUTCFullYear();
    const m = String(curr.getUTCMonth() + 1).padStart(2, "0");
    const d = String(curr.getUTCDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
    curr.setUTCDate(curr.getUTCDate() + 1);
  }
  return dates;
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

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const employeeId = searchParams.get("employeeId");
    const month = searchParams.get("month"); // e.g. "2026-10"

    const query: any = {};
    if (status) query.status = status;
    if (employeeId) query.employee = employeeId;
    if (month) {
      query.$or = [
        { startDate: { $regex: `^${month}` } },
        { endDate: { $regex: `^${month}` } },
      ];
    }

    const leaves = await LeaveRequest.find(query)
      .populate("employee", "name employeeCode designation location photoUrl")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ success: true, data: leaves });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch leaves." },
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
      employeeId,
      leaveType,
      startDate,
      endDate,
      totalDays,
      reason,
      notes,
    } = body;

    if (!employeeId || !startDate || !endDate || !reason) {
      return NextResponse.json(
        {
          success: false,
          error: "Employee, start date, end date, and reason are required.",
        },
        { status: 400 }
      );
    }

    // Check if period is locked in MonthlyPayroll
    const lockedPeriod = await MonthlyPayroll.findOne({
      employee: employeeId,
      status: { $in: ["LOCKED", "RELEASED"] },
      $or: [
        { startDate: { $lte: endDate }, endDate: { $gte: startDate } },
        { month: startDate.slice(0, 7) },
      ],
    }).lean();

    if (lockedPeriod) {
      return NextResponse.json(
        {
          success: false,
          error: `Payroll period (${lockedPeriod.periodLabel || lockedPeriod.month}) is LOCKED. Reopen payroll before adding leaves for these dates.`,
        },
        { status: 403 }
      );
    }

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return NextResponse.json(
        { success: false, error: "Employee not found." },
        { status: 404 }
      );
    }

    const days = totalDays ? Number(totalDays) : 1;

    const leave = await LeaveRequest.create({
      employee: employee._id,
      leaveType: leaveType || "CASUAL",
      startDate,
      endDate,
      totalDays: days,
      reason: reason.trim(),
      notes: notes?.trim() || "",
      status: "PENDING",
      appliedAt: new Date(),
    });

    await recordHRAuditLog({
      action: "LEAVE_REQUESTED",
      module: "HR_EMPLOYEE",
      targetId: leave._id.toString(),
      targetLabel: `${employee.name} (${employee.employeeCode}) — ${leaveType} (${startDate} to ${endDate})`,
      valueAfter: {
        leaveType,
        startDate,
        endDate,
        totalDays: days,
        reason,
      },
      reason: "Employee applied for leave",
      performedBy: auth.user?.userId,
      performedByName: auth.user?.username || "HR",
    });

    return NextResponse.json({
      success: true,
      message: "Leave application submitted successfully.",
      data: leave,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to apply leave." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
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
    const { leaveId, action, rejectionReason } = body;

    if (!leaveId || !action) {
      return NextResponse.json(
        { success: false, error: "Leave ID and action are required." },
        { status: 400 }
      );
    }

    const leave = await LeaveRequest.findById(leaveId).populate(
      "employee",
      "name employeeCode location requiredDailyHours"
    );
    if (!leave) {
      return NextResponse.json(
        { success: false, error: "Leave request not found." },
        { status: 404 }
      );
    }

    const empObj: any = leave.employee;

    // Check if period is locked in MonthlyPayroll
    const lockedPeriod = await MonthlyPayroll.findOne({
      employee: empObj?._id || leave.employee,
      status: { $in: ["LOCKED", "RELEASED"] },
      $or: [
        {
          startDate: { $lte: leave.endDate },
          endDate: { $gte: leave.startDate },
        },
        { month: leave.startDate.slice(0, 7) },
      ],
    }).lean();

    if (lockedPeriod) {
      return NextResponse.json(
        {
          success: false,
          error: `Payroll period (${lockedPeriod.periodLabel || lockedPeriod.month}) is LOCKED. Reopen payroll before modifying leave status.`,
        },
        { status: 403 }
      );
    }

    const beforeStatus = leave.status;
    const now = new Date();

    if (action === "RECOMMEND") {
      leave.status = "RECOMMENDED";
      leave.recommendedBy = auth.user?.userId as any;
      leave.recommendedByName = auth.user?.username || "Lead";
      leave.recommendedAt = now;
    } else if (action === "APPROVE") {
      if (
        auth.user?.role !== "Admin" &&
        auth.user?.role !== "HR" &&
        auth.user?.role !== "Warehouse"
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "Only Admin, HR, or Warehouse can approve leaves.",
          },
          { status: 403 }
        );
      }
      leave.status = "APPROVED";
      leave.approvedBy = auth.user?.userId as any;
      leave.approvedByName = auth.user?.username || "HR";
      leave.approvedAt = now;

      // Auto-sync Approved Leave dates to Attendance records so Daily Attendance reflects PAID_OFF / ABSENT
      const leaveDates = getDatesBetween(leave.startDate, leave.endDate);
      const targetStatus =
        leave.leaveType === "UNPAID" ? "ABSENT" : "PAID_OFF";

      for (const dt of leaveDates) {
        const existingAtt = await Attendance.findOne({
          employee: empObj?._id || leave.employee,
          date: dt,
        });

        if (!existingAtt) {
          await Attendance.create({
            employee: empObj?._id || leave.employee,
            date: dt,
            location: empObj?.location || null,
            status: targetStatus,
            punchMethod: "HR_MANUAL",
            targetMinutes: Math.round(
              (empObj?.requiredDailyHours || 8) * 60
            ),
            workedMinutes: 0,
            flags: ["MANUAL_CORRECTION"],
            notes: `Approved ${leave.leaveType} Leave: ${leave.reason}`,
            correctedBy: auth.user?.userId as any,
            correctedByName: auth.user?.username || "HR",
            correctedAt: now,
          });
        } else if (!existingAtt.checkIn) {
          existingAtt.status = targetStatus as any;
          existingAtt.notes = `Approved ${leave.leaveType} Leave: ${leave.reason}`;
          existingAtt.correctedBy = auth.user?.userId as any;
          existingAtt.correctedByName = auth.user?.username || "HR";
          existingAtt.correctedAt = now;
          await existingAtt.save();
        }
      }
    } else if (action === "REJECT") {
      if (
        auth.user?.role !== "Admin" &&
        auth.user?.role !== "HR" &&
        auth.user?.role !== "Warehouse"
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "Only Admin, HR, or Warehouse can reject leaves.",
          },
          { status: 403 }
        );
      }
      leave.status = "REJECTED";
      leave.rejectionReason = rejectionReason || "Rejected by HR/Admin";
    } else if (action === "CANCEL") {
      leave.status = "CANCELLED";
    }

    await leave.save();

    const empName = empObj?.name || "Employee";
    const empCode = empObj?.employeeCode || "";

    await recordHRAuditLog({
      action: `LEAVE_${action}`,
      module: "HR_EMPLOYEE",
      targetId: leave._id.toString(),
      targetLabel: `${empName} (${empCode}) — ${leave.leaveType} (${leave.startDate} to ${leave.endDate})`,
      valueBefore: { status: beforeStatus },
      valueAfter: { status: leave.status, rejectionReason },
      reason: rejectionReason || `Leave ${action.toLowerCase()} by ${auth.user?.username}`,
      performedBy: auth.user?.userId,
      performedByName: auth.user?.username || "HR",
    });

    return NextResponse.json({
      success: true,
      message: `Leave request marked as ${leave.status}.`,
      data: leave,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update leave." },
      { status: 500 }
    );
  }
}
