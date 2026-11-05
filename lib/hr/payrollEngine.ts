import { IEmployee, Employee } from "@/models/Employee";
import { EmployeeCard } from "@/models/EmployeeCard";
import { Attendance } from "@/models/Attendance";
import { Holiday } from "@/models/Holiday";
import { LeaveRequest } from "@/models/LeaveRequest";
import { OvertimeRequest } from "@/models/OvertimeRequest";
import { SalaryAdvance } from "@/models/SalaryAdvance";
import { MonthlyPayroll, IMonthlyPayroll } from "@/models/MonthlyPayroll";
import {
  calculateMonthlyTargetHours,
  calculatePeriodTargetHours,
} from "./attendanceEngine";
import { recordHRAuditLog } from "./auditLog";
import { Types } from "mongoose";

export interface PayrollCalculationInput {
  baseSalary: number;
  requiredDailyHours: number;
  targetHours: number;
  scheduledWorkingDays: number;
  calendarDays: number;
  clockedWorkedMinutes: number;
  lateArrivalsCount: number;
  paidLeaveDays?: number;
  unpaidLeaveDays: number;
  approvedOvertimeMinutes: number;
  overtimeMultiplier?: number;
  advanceDeduction: number;
  bonus?: number;
  cardFeeDeduction?: number;
}

export interface PayrollCalculationResult {
  dailyRate: number;
  hourlyRate: number;
  clockedWorkedHours: number;
  latePenaltyDays: number;
  shortHours: number;
  shortHoursDeduction: number;
  lateDeduction: number;
  unpaidLeaveDeduction: number;
  overtimeHours: number;
  overtimePay: number;
  advanceDeduction: number;
  bonus: number;
  cardFeeDeduction: number;
  netSalary: number;
}

/**
 * Pure calculation helper for payroll formulas (Method A: Target Hours vs Clocked Hours).
 * Easily unit tested without database dependencies.
 */
export function calculatePayrollFigures(
  input: PayrollCalculationInput
): PayrollCalculationResult {
  const baseSalary = Math.max(0, input.baseSalary);
  const dailyHours = input.requiredDailyHours || 8;
  const dailyRate = Math.round((baseSalary / 30) * 100) / 100;
  const hourlyRate = Math.round((dailyRate / dailyHours) * 100) / 100;

  const clockedWorkedHours =
    Math.round((input.clockedWorkedMinutes / 60) * 10) / 10;

  const paidLeaveDays = Math.max(0, input.paidLeaveDays || 0);
  const unpaidLeaveDays = Math.max(0, input.unpaidLeaveDays || 0);

  // 1. Target Hours vs Clocked Hours (Method A):
  // - Approved Paid Leaves (or PAID_OFF days) reduce effective required hours with 0 deduction.
  // - Approved Unpaid Leaves are deducted via unpaidLeaveDeduction, so we exclude their hours
  //   from effectiveTargetHours to prevent double deduction in shortHoursDeduction.
  // - Any extra hours worked above effectiveTargetHours can also compensate for unpaid leave hours.
  const paidLeaveHours = paidLeaveDays * dailyHours;
  const unpaidLeaveHours = unpaidLeaveDays * dailyHours;

  const effectiveTargetHours = Math.max(
    0,
    Math.round((input.targetHours - paidLeaveHours - unpaidLeaveHours) * 10) / 10
  );

  let shortHours = 0;
  let shortHoursDeduction = 0;

  if (clockedWorkedHours < effectiveTargetHours) {
    shortHours = Math.round((effectiveTargetHours - clockedWorkedHours) * 10) / 10;
    shortHoursDeduction = Math.round(shortHours * hourlyRate);
  }

  // 2. Rule: 3 Late marks = 1 absent day salary deduction
  const latePenaltyDays = Math.floor(input.lateArrivalsCount / 3);
  const lateDeduction = Math.round(latePenaltyDays * dailyRate);

  // 3. Unpaid leaves (offset if employee worked surplus hours beyond effectiveTargetHours under Method A)
  const surplusHours = Math.max(0, clockedWorkedHours - effectiveTargetHours);
  const uncompensatedUnpaidHours = Math.max(0, unpaidLeaveHours - surplusHours);
  const unpaidLeaveDeduction = Math.round(
    (uncompensatedUnpaidHours / dailyHours) * dailyRate
  );

  // 4. Overtime
  const overtimeMultiplier = input.overtimeMultiplier || 1.0;
  const overtimeHours =
    Math.round((input.approvedOvertimeMinutes / 60) * 10) / 10;
  const overtimePay = Math.round(
    overtimeHours * hourlyRate * overtimeMultiplier
  );

  // 5. Deductions & Adjustments
  const advanceDeduction = Math.max(0, input.advanceDeduction);
  const bonus = Math.max(0, input.bonus || 0);
  const cardFeeDeduction = Math.max(0, input.cardFeeDeduction || 0);

  // 6. Net Salary
  const grossAdditions = baseSalary + bonus + overtimePay;
  const totalDeductions =
    shortHoursDeduction +
    lateDeduction +
    unpaidLeaveDeduction +
    advanceDeduction +
    cardFeeDeduction;

  const netSalary = Math.max(0, Math.round(grossAdditions - totalDeductions));

  return {
    dailyRate,
    hourlyRate,
    clockedWorkedHours,
    latePenaltyDays,
    shortHours,
    shortHoursDeduction,
    lateDeduction,
    unpaidLeaveDeduction,
    overtimeHours,
    overtimePay,
    advanceDeduction,
    bonus,
    cardFeeDeduction,
    netSalary,
  };
}

/**
 * Helper to expand a date range [startStr, endStr] clipped to [periodStart, periodEnd] into YYYY-MM-DD strings.
 */
function expandDateRangeClipped(
  startStr: string,
  endStr: string,
  periodStart: string,
  periodEnd: string
): string[] {
  const effStart = startStr < periodStart ? periodStart : startStr;
  const effEnd = endStr > periodEnd ? periodEnd : endStr;
  if (effStart > effEnd) return [];

  const [sY, sM, sD] = effStart.split("-").map((n) => parseInt(n, 10));
  const [eY, eM, eD] = effEnd.split("-").map((n) => parseInt(n, 10));
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

/**
 * Computes payroll for a specific employee for a given month (YYYY-MM) or custom date range.
 */
export async function computeEmployeeMonthlyPayroll(
  employeeId: string | Types.ObjectId,
  periodKey: string, // YYYY-MM or YYYY-MM-DD_to_YYYY-MM-DD
  options: {
    startDate?: string;
    endDate?: string;
    periodLabel?: string;
    manualBonus?: number;
    manualCardFee?: number;
    userId?: string | Types.ObjectId;
    username?: string;
  } = {}
) {
  let startDate = options.startDate || "";
  let endDate = options.endDate || "";

  if (!startDate || !endDate) {
    if (periodKey.includes("_to_")) {
      const parts = periodKey.replace(/^custom_/, "").split("_to_");
      startDate = parts[0];
      endDate = parts[1];
    } else {
      const [yearNum, monthNum] = periodKey.split("-").map((n) => parseInt(n, 10));
      const daysInMonth = new Date(Date.UTC(yearNum, monthNum, 0)).getUTCDate();
      startDate = `${yearNum}-${String(monthNum).padStart(2, "0")}-01`;
      endDate = `${yearNum}-${String(monthNum).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
    }
  }

  const employee = await Employee.findById(employeeId).lean();
  if (!employee) throw new Error("Employee not found");

  // Fetch holidays for the period (only applied if employee has holidayOffAllowed === true)
  const holidaysInPeriod = employee.holidayOffAllowed
    ? await Holiday.find({
        date: { $gte: startDate, $lte: endDate },
      }).lean()
    : [];
  const holidayDates = holidaysInPeriod.map((h) => h.date);

  // Target hours calculation from calendar using period target calculation
  const targetMetrics = calculatePeriodTargetHours(
    employee,
    startDate,
    endDate,
    holidayDates
  );

  // Fetch all attendance records for this employee in this period
  const attendances = await Attendance.find({
    employee: employee._id,
    date: { $gte: startDate, $lte: endDate },
  }).lean();

  let clockedWorkedMinutes = 0;
  let presentDays = 0;
  let halfDays = 0;
  let absentDays = 0;
  let weeklyOffsCount = 0;
  let holidaysCount = 0;
  let paidOffsCount = 0;
  let workedOnDayOffCount = 0;
  let lateArrivalsCount = 0;

  const paidOffDateSet = new Set<string>();
  const clockedDateSet = new Set<string>();

  for (const att of attendances) {
    clockedWorkedMinutes += att.workedMinutes || 0;
    if ((att.workedMinutes || 0) > 0) {
      clockedDateSet.add(att.date);
    }

    if (
      att.status === "PRESENT" ||
      att.status === "LATE" ||
      att.status === "PRESENT_ON_OFF_DAY" ||
      att.status === "SHORT_HOURS"
    ) {
      presentDays++;
    } else if (att.status === "HALF_DAY") {
      halfDays++;
    } else if (att.status === "ABSENT" || att.status === "MISSING_CHECKOUT") {
      absentDays++;
    } else if (att.status === "WEEKLY_OFF") {
      weeklyOffsCount++;
    } else if (att.status === "HOLIDAY") {
      holidaysCount++;
    } else if (att.status === "PAID_OFF") {
      paidOffsCount++;
      if (!clockedDateSet.has(att.date)) {
        paidOffDateSet.add(att.date);
      }
    }

    if (
      att.status === "PRESENT_ON_OFF_DAY" ||
      att.flags?.includes("WORKED_ON_OFF_DAY")
    ) {
      workedOnDayOffCount++;
    }

    // Count as late mark only if not already penalized as HALF_DAY
    if (
      att.status !== "HALF_DAY" &&
      !att.flags?.includes("HALF_DAY_LATE") &&
      (att.status === "LATE" || att.flags?.includes("LATE_ARRIVAL"))
    ) {
      lateArrivalsCount++;
    }
  }

  // Approved Leaves in this period (both PAID and UNPAID)
  const approvedLeaves = await LeaveRequest.find({
    employee: employee._id,
    status: "APPROVED",
    startDate: { $lte: endDate },
    endDate: { $gte: startDate },
  }).lean();

  let unpaidLeaveDays = 0;
  for (const l of approvedLeaves) {
    if (l.leaveType === "UNPAID") {
      const clippedDates = expandDateRangeClipped(
        l.startDate,
        l.endDate,
        startDate,
        endDate
      );
      unpaidLeaveDays +=
        clippedDates.length > 0 ? clippedDates.length : l.totalDays || 1;
    } else {
      // Paid leave (CASUAL, SICK, ANNUAL, PAID)
      const clippedDates = expandDateRangeClipped(
        l.startDate,
        l.endDate,
        startDate,
        endDate
      );
      for (const dt of clippedDates) {
        if (!clockedDateSet.has(dt)) {
          paidOffDateSet.add(dt);
        }
      }
    }
  }

  const paidLeaveDays = paidOffDateSet.size;
  paidOffsCount = Math.max(paidOffsCount, paidLeaveDays);

  // Approved Overtime in this period
  const approvedOvertimes = await OvertimeRequest.find({
    employee: employee._id,
    date: { $gte: startDate, $lte: endDate },
    status: "APPROVED",
  }).lean();

  let approvedOvertimeMinutes = 0;
  let overtimeMultiplier = 1.0;
  for (const ot of approvedOvertimes) {
    approvedOvertimeMinutes += ot.approvedMinutes || 0;
    if (ot.rateMultiplier && ot.rateMultiplier > overtimeMultiplier) {
      overtimeMultiplier = ot.rateMultiplier;
    }
  }

  // Active Advance Salary auto-deduction
  const activeAdvances = await SalaryAdvance.find({
    employee: employee._id,
    status: "ACTIVE",
    remainingBalance: { $gt: 0 },
  }).lean();

  let advanceDeduction = 0;
  for (const adv of activeAdvances) {
    const toDeduct = Math.min(adv.monthlyDeduction, adv.remainingBalance);
    advanceDeduction += toDeduct;
  }

  // Auto-detect Card Replacement Fee (PAYROLL_DEDUCTION) issued during this period
  const startUtc = new Date(`${startDate}T00:00:00.000Z`);
  const endUtc = new Date(`${endDate}T23:59:59.999Z`);
  const salaryDeductCards = await EmployeeCard.find({
    employee: employee._id,
    feeSettlementMode: "PAYROLL_DEDUCTION",
    replacementFee: { $gt: 0 },
    issueDate: { $gte: startUtc, $lte: endUtc },
  }).lean();

  const autoCardFee = salaryDeductCards.reduce(
    (sum, c) => sum + (c.replacementFee || 0),
    0
  );
  const resolvedCardFee =
    options.manualCardFee !== undefined ? options.manualCardFee : autoCardFee;

  // Calculate figures
  const figures = calculatePayrollFigures({
    baseSalary: employee.baseSalary,
    requiredDailyHours: employee.requiredDailyHours || 8,
    targetHours: targetMetrics.targetHours,
    scheduledWorkingDays: targetMetrics.workingDays,
    calendarDays: targetMetrics.calendarDays,
    clockedWorkedMinutes,
    lateArrivalsCount,
    paidLeaveDays,
    unpaidLeaveDays,
    approvedOvertimeMinutes,
    overtimeMultiplier,
    advanceDeduction,
    bonus: options.manualBonus || 0,
    cardFeeDeduction: resolvedCardFee,
  });

  return {
    employee,
    month: periodKey,
    startDate,
    endDate,
    periodLabel: options.periodLabel || `${startDate} to ${endDate}`,
    calendarDays: targetMetrics.calendarDays,
    scheduledWorkingDays: targetMetrics.workingDays,
    targetHours: targetMetrics.targetHours,
    presentDays,
    halfDays,
    absentDays,
    weeklyOffsCount,
    holidaysCount,
    paidOffsCount,
    workedOnDayOffCount,
    lateArrivalsCount,
    ...figures,
  };
}
