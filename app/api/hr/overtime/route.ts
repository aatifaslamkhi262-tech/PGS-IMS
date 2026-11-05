import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { OvertimeRequest } from "@/models/OvertimeRequest";
import { Employee } from "@/models/Employee";
import { MonthlyPayroll } from "@/models/MonthlyPayroll";
import { verifyRole } from "@/lib/auth/rbac";
import { recordHRAuditLog } from "@/lib/hr/auditLog";

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
    const month = searchParams.get("month"); // YYYY-MM
    const date = searchParams.get("date"); // YYYY-MM-DD
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const query: any = {};
    if (status) query.status = status;
    if (employeeId) query.employee = employeeId;
    if (date) query.date = date;
    else if (startDate && endDate) query.date = { $gte: startDate, $lte: endDate };
    else if (month) query.date = { $regex: `^${month}` };

    const overtimes = await OvertimeRequest.find(query)
      .populate("employee", "name employeeCode designation location")
      .sort({ date: -1 })
      .lean();

    return NextResponse.json({ success: true, data: overtimes });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch overtime records.",
      },
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
      date,
      extraMinutes,
      approvedMinutes,
      rateMultiplier,
      reason,
      status, // "APPROVED" | "REJECTED" | "PENDING"
      rejectionReason,
    } = body;

    if (!employeeId || !date || !reason) {
      return NextResponse.json(
        {
          success: false,
          error: "Employee, date, and reason are required.",
        },
        { status: 400 }
      );
    }

    const lockedPeriod = await MonthlyPayroll.findOne({
      employee: employeeId,
      status: { $in: ["LOCKED", "RELEASED"] },
      $or: [
        { startDate: { $lte: date }, endDate: { $gte: date } },
        { month: date.slice(0, 7) },
      ],
    }).lean();

    if (lockedPeriod) {
      return NextResponse.json(
        {
          success: false,
          error: `Payroll period (${lockedPeriod.periodLabel || lockedPeriod.month}) is LOCKED. Reopen payroll before modifying overtime for ${date}.`,
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

    let ot = await OvertimeRequest.findOne({ employee: employee._id, date });

    const now = new Date();
    const beforeStatus = ot?.status || "NEW";

    if (!ot) {
      ot = new OvertimeRequest({
        employee: employee._id,
        date,
        extraMinutes: extraMinutes ?? approvedMinutes ?? 0,
        approvedMinutes: approvedMinutes ?? extraMinutes ?? 0,
        rateMultiplier: rateMultiplier || 1.0,
        reason: reason.trim(),
        status: status || "APPROVED",
      });
    } else {
      if (extraMinutes !== undefined) ot.extraMinutes = extraMinutes;
      if (approvedMinutes !== undefined) ot.approvedMinutes = approvedMinutes;
      if (rateMultiplier !== undefined) ot.rateMultiplier = rateMultiplier;
      if (reason) ot.reason = reason.trim();
      if (status) ot.status = status;
    }

    if (ot.status === "APPROVED") {
      ot.approvedBy = auth.user?.userId as any;
      ot.approvedByName = auth.user?.username || "HR";
      ot.approvedAt = now;
    } else if (ot.status === "REJECTED") {
      ot.rejectionReason = rejectionReason || "Rejected by Supervisor";
    }

    await ot.save();

    await recordHRAuditLog({
      action: `OVERTIME_${ot.status || "UPDATED"}`,
      module: "HR_ATTENDANCE",
      targetId: ot._id.toString(),
      targetLabel: `${employee.name} (${employee.employeeCode}) — ${date} (${ot.approvedMinutes} mins approved)`,
      valueBefore: { status: beforeStatus },
      valueAfter: {
        status: ot.status,
        approvedMinutes: ot.approvedMinutes,
        rateMultiplier: ot.rateMultiplier,
      },
      reason: reason.trim(),
      performedBy: auth.user?.userId,
      performedByName: auth.user?.username || "HR",
    });

    return NextResponse.json({
      success: true,
      message: "Overtime request processed successfully.",
      data: ot,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to process overtime.",
      },
      { status: 500 }
    );
  }
}
