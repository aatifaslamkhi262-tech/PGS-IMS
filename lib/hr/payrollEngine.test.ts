import { describe, it, expect } from "vitest";
import { calculatePayrollFigures } from "./payrollEngine";

describe("Payroll Engine - Method A & Attendance Business Rules", () => {
  it("Rule 1: 3 Late arrivals = 1 day salary cut", () => {
    const result3Lates = calculatePayrollFigures({
      baseSalary: 60000,
      requiredDailyHours: 8,
      targetHours: 208,
      scheduledWorkingDays: 26,
      calendarDays: 31,
      clockedWorkedMinutes: 208 * 60,
      lateArrivalsCount: 3,
      unpaidLeaveDays: 0,
      approvedOvertimeMinutes: 0,
      advanceDeduction: 0,
    });

    expect(result3Lates.dailyRate).toBe(2000);
    expect(result3Lates.latePenaltyDays).toBe(1);
    expect(result3Lates.lateDeduction).toBe(2000);
    expect(result3Lates.netSalary).toBe(58000);

    const result5Lates = calculatePayrollFigures({
      baseSalary: 60000,
      requiredDailyHours: 8,
      targetHours: 208,
      scheduledWorkingDays: 26,
      calendarDays: 31,
      clockedWorkedMinutes: 208 * 60,
      lateArrivalsCount: 5,
      unpaidLeaveDays: 0,
      approvedOvertimeMinutes: 0,
      advanceDeduction: 0,
    });
    expect(result5Lates.latePenaltyDays).toBe(1);
    expect(result5Lates.lateDeduction).toBe(2000);

    const result6Lates = calculatePayrollFigures({
      baseSalary: 60000,
      requiredDailyHours: 8,
      targetHours: 208,
      scheduledWorkingDays: 26,
      calendarDays: 31,
      clockedWorkedMinutes: 208 * 60,
      lateArrivalsCount: 6,
      unpaidLeaveDays: 0,
      approvedOvertimeMinutes: 0,
      advanceDeduction: 0,
    });
    expect(result6Lates.latePenaltyDays).toBe(2);
    expect(result6Lates.lateDeduction).toBe(4000);
  });

  it("Rule 2 & 3 (Method A): Extra time on other days / off-day duty compensates for short hours/half days", () => {
    const compensatedResult = calculatePayrollFigures({
      baseSalary: 60000,
      requiredDailyHours: 8,
      targetHours: 208,
      scheduledWorkingDays: 26,
      calendarDays: 31,
      clockedWorkedMinutes: 210 * 60,
      lateArrivalsCount: 0,
      unpaidLeaveDays: 0,
      approvedOvertimeMinutes: 0,
      advanceDeduction: 0,
    });

    expect(compensatedResult.shortHours).toBe(0);
    expect(compensatedResult.shortHoursDeduction).toBe(0);
    expect(compensatedResult.netSalary).toBe(60000);
  });

  it("Hour-based short hours deduction when clocked hours are below target hours", () => {
    const shortResult = calculatePayrollFigures({
      baseSalary: 60000,
      requiredDailyHours: 8,
      targetHours: 208,
      scheduledWorkingDays: 26,
      calendarDays: 31,
      clockedWorkedMinutes: 200 * 60,
      lateArrivalsCount: 0,
      unpaidLeaveDays: 0,
      approvedOvertimeMinutes: 0,
      advanceDeduction: 0,
    });

    expect(shortResult.shortHours).toBe(8);
    expect(shortResult.hourlyRate).toBe(250);
    expect(shortResult.shortHoursDeduction).toBe(2000);
    expect(shortResult.netSalary).toBe(58000);
  });

  it("Approved Paid Leave does not deduct salary as short hours", () => {
    // 26 scheduled days (208h), 1 day approved Paid Leave (8h), worked 25 days (200h)
    const paidLeaveResult = calculatePayrollFigures({
      baseSalary: 60000,
      requiredDailyHours: 8,
      targetHours: 208,
      scheduledWorkingDays: 26,
      calendarDays: 31,
      clockedWorkedMinutes: 200 * 60,
      lateArrivalsCount: 0,
      paidLeaveDays: 1,
      unpaidLeaveDays: 0,
      approvedOvertimeMinutes: 0,
      advanceDeduction: 0,
    });

    expect(paidLeaveResult.shortHours).toBe(0);
    expect(paidLeaveResult.shortHoursDeduction).toBe(0);
    expect(paidLeaveResult.netSalary).toBe(60000);
  });

  it("Approved Unpaid Leave deducts exactly 1 day without double-deducting in short hours", () => {
    // 26 scheduled days (208h), 1 day Unpaid Leave (8h), worked 25 days (200h)
    const unpaidLeaveResult = calculatePayrollFigures({
      baseSalary: 60000,
      requiredDailyHours: 8,
      targetHours: 208,
      scheduledWorkingDays: 26,
      calendarDays: 31,
      clockedWorkedMinutes: 200 * 60,
      lateArrivalsCount: 0,
      paidLeaveDays: 0,
      unpaidLeaveDays: 1,
      approvedOvertimeMinutes: 0,
      advanceDeduction: 0,
    });

    expect(unpaidLeaveResult.shortHours).toBe(0);
    expect(unpaidLeaveResult.shortHoursDeduction).toBe(0);
    expect(unpaidLeaveResult.unpaidLeaveDeduction).toBe(2000);
    expect(unpaidLeaveResult.netSalary).toBe(58000);
  });

  it("Calculates comprehensive net salary with Overtime, Bonus, and Advance Recovery", () => {
    const fullResult = calculatePayrollFigures({
      baseSalary: 50000,
      requiredDailyHours: 8,
      targetHours: 208,
      scheduledWorkingDays: 26,
      calendarDays: 30,
      clockedWorkedMinutes: 208 * 60,
      lateArrivalsCount: 0,
      unpaidLeaveDays: 0,
      approvedOvertimeMinutes: 600,
      overtimeMultiplier: 1.5,
      advanceDeduction: 10000,
      bonus: 5000,
    });

    expect(fullResult.overtimeHours).toBe(10);
    expect(fullResult.overtimePay).toBe(3125);
    expect(fullResult.bonus).toBe(5000);
    expect(fullResult.advanceDeduction).toBe(10000);
    expect(fullResult.netSalary).toBe(48125);
  });
});
