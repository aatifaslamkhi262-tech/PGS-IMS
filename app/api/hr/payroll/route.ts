import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Employee } from "@/models/Employee";
import { MonthlyPayroll } from "@/models/MonthlyPayroll";
import { SalaryAdvance } from "@/models/SalaryAdvance";
import { verifyRole } from "@/lib/auth/rbac";
import { computeEmployeeMonthlyPayroll } from "@/lib/hr/payrollEngine";
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
    const month = searchParams.get("month") || "";
    const startDate = searchParams.get("startDate") || "";
    const endDate = searchParams.get("endDate") || "";
    const employeeId = searchParams.get("employeeId") || "";

    const periodKey =
      month || (startDate && endDate ? `${startDate}_to_${endDate}` : "");

    if (!periodKey) {
      return NextResponse.json(
        {
          success: false,
          error: "Month or Start/End date parameters are required.",
        },
        { status: 400 }
      );
    }

    const query: any = { month: periodKey };
    if (employeeId) query.employee = employeeId;

    const payrolls = await MonthlyPayroll.find(query)
      .populate(
        "employee",
        "name employeeCode designation location photoUrl baseSalary"
      )
      .populate("location", "name code")
      .sort({ employeeName: 1 })
      .lean();

    const isMonthLocked = payrolls.some(
      (p) => p.status === "LOCKED" || p.status === "RELEASED"
    );

    const totals = payrolls.reduce(
      (acc, p) => {
        acc.totalBaseSalary += p.baseSalary || 0;
        acc.totalBonus += p.bonus || 0;
        acc.totalOvertimePay += p.overtimePay || 0;
        acc.totalShortDeductions += p.shortHoursDeduction || 0;
        acc.totalLateDeductions += p.lateDeduction || 0;
        acc.totalUnpaidLeaveDeductions += p.unpaidLeaveDeduction || 0;
        acc.totalAdvanceDeductions += p.advanceDeduction || 0;
        acc.totalCardFeeDeductions += p.cardFeeDeduction || 0;
        acc.totalNetSalary += p.netSalary || 0;
        return acc;
      },
      {
        totalBaseSalary: 0,
        totalBonus: 0,
        totalOvertimePay: 0,
        totalShortDeductions: 0,
        totalLateDeductions: 0,
        totalUnpaidLeaveDeductions: 0,
        totalAdvanceDeductions: 0,
        totalCardFeeDeductions: 0,
        totalNetSalary: 0,
      }
    );

    return NextResponse.json({
      success: true,
      data: {
        month: periodKey,
        isMonthLocked,
        records: payrolls,
        totals,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch payroll." },
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
    const { month, startDate, endDate, periodLabel, adjustments } = body;

    const periodKey =
      month || (startDate && endDate ? `${startDate}_to_${endDate}` : "");

    if (!periodKey) {
      return NextResponse.json(
        {
          success: false,
          error: "Valid Month (YYYY-MM) or Start/End dates are required.",
        },
        { status: 400 }
      );
    }

    // Check if period is already locked
    const lockedCount = await MonthlyPayroll.countDocuments({
      month: periodKey,
      status: { $in: ["LOCKED", "RELEASED"] },
    });
    if (lockedCount > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Payroll for ${periodKey} is currently LOCKED. Reopen it before recalculating.`,
        },
        { status: 403 }
      );
    }

    const adjMap = new Map<string, any>();
    if (Array.isArray(adjustments)) {
      for (const adj of adjustments) {
        if (adj.employeeId) adjMap.set(adj.employeeId.toString(), adj);
      }
    }

    // Load existing draft adjustments so recalculating doesn't wipe out saved bonus/notes
    const existingDrafts = await MonthlyPayroll.find({
      month: periodKey,
      status: "DRAFT",
    }).lean();
    const existingDraftMap = new Map<string, any>();
    for (const d of existingDrafts) {
      existingDraftMap.set(d.employee.toString(), d);
    }

    // Fetch all active employees
    const employees = await Employee.find({ status: "ACTIVE" }).lean();
    const savedRecords: any[] = [];

    for (const emp of employees) {
      const empIdStr = emp._id.toString();
      const userAdj = adjMap.get(empIdStr);
      const prevDraft = existingDraftMap.get(empIdStr);

      const resolvedBonus =
        userAdj?.bonus !== undefined
          ? Number(userAdj.bonus)
          : prevDraft?.bonus || 0;
      const resolvedCardFee =
        userAdj?.cardFee !== undefined
          ? Number(userAdj.cardFee)
          : prevDraft?.cardFeeDeduction;
      const resolvedNotes =
        userAdj?.notes !== undefined
          ? String(userAdj.notes)
          : prevDraft?.notes || "";

      const figures = await computeEmployeeMonthlyPayroll(emp._id, periodKey, {
        startDate,
        endDate,
        periodLabel,
        manualBonus: resolvedBonus,
        manualCardFee: resolvedCardFee,
        userId: auth.user?.userId,
        username: auth.user?.username,
      });

      const updated = await MonthlyPayroll.findOneAndUpdate(
        { month: periodKey, employee: emp._id },
        {
          month: periodKey,
          startDate: figures.startDate,
          endDate: figures.endDate,
          periodLabel: figures.periodLabel,
          employee: emp._id,
          employeeCode: emp.employeeCode,
          employeeName: emp.name,
          designation: emp.designation,
          location: emp.location || null,
          baseSalary: figures.employee.baseSalary,
          dailyRate: figures.dailyRate,
          hourlyRate: figures.hourlyRate,
          calendarDays: figures.calendarDays,
          scheduledWorkingDays: figures.scheduledWorkingDays,
          targetHours: figures.targetHours,
          clockedWorkedHours: figures.clockedWorkedHours,
          presentDays: figures.presentDays,
          halfDays: figures.halfDays,
          absentDays: figures.absentDays,
          weeklyOffsCount: figures.weeklyOffsCount,
          holidaysCount: figures.holidaysCount,
          paidOffsCount: figures.paidOffsCount,
          workedOnDayOffCount: figures.workedOnDayOffCount,
          lateArrivalsCount: figures.lateArrivalsCount,
          latePenaltyDays: figures.latePenaltyDays,
          shortHours: figures.shortHours,
          overtimeHours: figures.overtimeHours,
          shortHoursDeduction: figures.shortHoursDeduction,
          lateDeduction: figures.lateDeduction,
          unpaidLeaveDeduction: figures.unpaidLeaveDeduction,
          overtimePay: figures.overtimePay,
          advanceDeduction: figures.advanceDeduction,
          bonus: figures.bonus,
          cardFeeDeduction: figures.cardFeeDeduction,
          netSalary: figures.netSalary,
          status: "DRAFT",
          calculatedAt: new Date(),
          calculatedBy: auth.user?.userId as any,
          calculatedByName: auth.user?.username || "HR",
          notes: resolvedNotes,
        },
        { upsert: true, returnDocument: "after" }
      );

      savedRecords.push(updated);
    }

    await recordHRAuditLog({
      action: "PAYROLL_DRAFT_CALCULATED",
      module: "HR_PAYROLL",
      targetId: periodKey,
      targetLabel: `Payroll Draft — ${periodLabel || periodKey} (${savedRecords.length} staff)`,
      valueAfter: { count: savedRecords.length, periodKey },
      reason: `Payroll draft calculated by ${auth.user?.username}`,
      performedBy: auth.user?.userId,
      performedByName: auth.user?.username || "HR",
    });

    return NextResponse.json({
      success: true,
      message: `Draft payroll calculated for ${savedRecords.length} employees.`,
      data: savedRecords,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to calculate payroll." },
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
        {
          success: false,
          error:
            "Only authorized roles can release, finalize lock, or reopen payroll.",
        },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { action, month, reason } = body; // action: "RELEASE_AND_LOCK" | "REOPEN"

    if (!month || !action) {
      return NextResponse.json(
        { success: false, error: "Month/Period and action are required." },
        { status: 400 }
      );
    }

    if (!reason || !reason.trim()) {
      return NextResponse.json(
        {
          success: false,
          error:
            "A mandatory written reason is required for payroll status change.",
        },
        { status: 400 }
      );
    }

    const now = new Date();

    if (action === "RELEASE_AND_LOCK") {
      // 1. Mark records as LOCKED
      const payrolls = await MonthlyPayroll.find({ month, status: "DRAFT" });
      if (payrolls.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: "No draft payroll found for this period to release.",
          },
          { status: 404 }
        );
      }

      for (const p of payrolls) {
        p.status = "LOCKED";
        p.releasedAt = now;
        p.releasedBy = auth.user?.userId as any;
        p.releasedByName = auth.user?.username || "Admin";
        await p.save();

        // If advance was deducted, update SalaryAdvance remaining balances (avoiding duplicate deduction for same period)
        if (p.advanceDeduction > 0) {
          const advances = await SalaryAdvance.find({
            employee: p.employee,
            status: "ACTIVE",
            remainingBalance: { $gt: 0 },
          }).sort({ createdAt: 1 });

          let remainingToDeduct = p.advanceDeduction;
          for (const adv of advances) {
            if (remainingToDeduct <= 0) break;
            const alreadyDeductedForPeriod = (adv.deductions || []).some(
              (d: any) => d.month === month
            );
            if (alreadyDeductedForPeriod) continue;

            const deductThis = Math.min(adv.remainingBalance, remainingToDeduct);
            adv.remainingBalance = Math.max(
              0,
              adv.remainingBalance - deductThis
            );
            if (adv.remainingBalance === 0) {
              adv.status = "PAID_OFF";
            }
            adv.deductions.push({
              month,
              amount: deductThis,
              payrollId: p._id,
              deductedAt: now,
              notes: `Auto-recovered via Payroll ${month}`,
            });
            await adv.save();
            remainingToDeduct -= deductThis;
          }
        }
      }

      await recordHRAuditLog({
        action: "PAYROLL_RELEASED_AND_LOCKED",
        module: "HR_PAYROLL",
        targetId: month,
        targetLabel: `Payroll Released & Period Locked — ${month}`,
        valueAfter: { month, status: "LOCKED", recordsCount: payrolls.length },
        reason: reason.trim(),
        performedBy: auth.user?.userId,
        performedByName: auth.user?.username || "Admin",
      });

      return NextResponse.json({
        success: true,
        message: `Payroll for ${month} released and locked successfully.`,
      });
    } else if (action === "REOPEN") {
      // Reverse any advance salary deductions that were recorded when this period was locked
      const advancesWithPeriodDeduction = await SalaryAdvance.find({
        "deductions.month": month,
      });

      for (const adv of advancesWithPeriodDeduction) {
        const matchingDeductions = (adv.deductions || []).filter(
          (d: any) => d.month === month
        );
        const restoredAmount = matchingDeductions.reduce(
          (sum: number, d: any) => sum + (d.amount || 0),
          0
        );
        if (restoredAmount > 0) {
          adv.remainingBalance = Math.min(
            adv.amount,
            (adv.remainingBalance || 0) + restoredAmount
          );
          if (adv.remainingBalance > 0 && adv.status === "PAID_OFF") {
            adv.status = "ACTIVE";
          }
          adv.deductions = (adv.deductions || []).filter(
            (d: any) => d.month !== month
          ) as any;
          await adv.save();
        }
      }

      await MonthlyPayroll.updateMany(
        { month },
        {
          $set: {
            status: "DRAFT",
            reopenReason: reason.trim(),
            reopenedAt: now,
            reopenedBy: auth.user?.userId as any,
            reopenedByName: auth.user?.username || "Admin",
          },
        }
      );

      await recordHRAuditLog({
        action: "PAYROLL_REOPENED",
        module: "HR_PAYROLL",
        targetId: month,
        targetLabel: `Payroll Reopened — ${month}`,
        valueAfter: { month, status: "DRAFT" },
        reason: reason.trim(),
        performedBy: auth.user?.userId,
        performedByName: auth.user?.username || "Admin",
      });

      return NextResponse.json({
        success: true,
        message: `Payroll for ${month} reopened back to DRAFT (advance balances restored).`,
      });
    }

    return NextResponse.json(
      { success: false, error: "Invalid action." },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to update payroll status.",
      },
      { status: 500 }
    );
  }
}
