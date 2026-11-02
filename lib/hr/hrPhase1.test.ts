import { describe, it, expect } from "vitest";
import {
  encryptCNIC,
  decryptCNIC,
  maskCNIC,
  hashPin,
  verifyPin,
  generateCardUid,
} from "./crypto";
import {
  calculateMonthlyTargetHours,
  recomputeAttendanceRecord,
} from "./attendanceEngine";

describe("HR Phase 1 — Foundation, Custom Schedules & Edge Cases", () => {
  it("encrypts, decrypts, and masks CNIC numbers accurately", () => {
    const raw = "61101-1234567-3";
    const encrypted = encryptCNIC(raw);
    expect(encrypted).not.toContain("1234567");
    const decrypted = decryptCNIC(encrypted);
    expect(decrypted).toBe("61101-1234567-3");
    expect(maskCNIC(raw)).toBe("*****-****567-3");
  });

  it("hashes and verifies 4-digit backup PINs and generates random Card UIDs", () => {
    const pinHash = hashPin("4829");
    expect(verifyPin("4829", pinHash)).toBe(true);
    expect(verifyPin("0000", pinHash)).toBe(false);

    const uid1 = generateCardUid();
    const uid2 = generateCardUid();
    expect(uid1).toMatch(/^CRD-[0-9A-F]{10}$/);
    expect(uid1).not.toBe(uid2);
  });

  it("calculates monthly target hours for 1 weekly off, 2 weekly offs, and monthly off quotas with custom daily hours", () => {
    // Case A: 31-day month (Oct 2026), 1 weekly off on Sunday (4 Sundays in Oct 2026), 1 holiday, 8h/day => 26 * 8 = 208h
    const empStandard = {
      offPolicy: "WEEKLY_FIXED" as const,
      weeklyOffDays: [0], // Sunday
      monthlyOffQuota: 0,
      requiredDailyHours: 8,
    };
    const resA = calculateMonthlyTargetHours(empStandard, 2026, 10, [
      "2026-10-15",
    ]);
    expect(resA.daysInMonth).toBe(31);
    expect(resA.scheduledOffDays).toBe(4);
    expect(resA.effectiveHolidays).toBe(1);
    expect(resA.workingDays).toBe(26);
    expect(resA.targetHours).toBe(208);

    // Case B: 2 offs per week (Saturday & Sunday — 5 Saturdays + 4 Sundays = 9 offs in Oct 2026), 10h/day
    const empTwoOffs = {
      offPolicy: "WEEKLY_FIXED" as const,
      weeklyOffDays: [0, 6],
      monthlyOffQuota: 0,
      requiredDailyHours: 10,
    };
    const resB = calculateMonthlyTargetHours(empTwoOffs, 2026, 10, []);
    expect(resB.scheduledOffDays).toBe(9);
    expect(resB.workingDays).toBe(22);
    expect(resB.targetHours).toBe(220);

    // Case C: Monthly Off Quota (only 1 off allowed in the whole month) + 3h/day part-time
    const empPartTimeMonthlyQuota = {
      offPolicy: "MONTHLY_QUOTA" as const,
      weeklyOffDays: [],
      monthlyOffQuota: 1,
      requiredDailyHours: 3,
    };
    const resC = calculateMonthlyTargetHours(
      empPartTimeMonthlyQuota,
      2026,
      10,
      ["2026-10-15"]
    );
    expect(resC.scheduledOffDays).toBe(1);
    expect(resC.effectiveHolidays).toBe(1);
    // Case D: Monthly Off Quota with Half-Days (e.g. Ahmed: 8.5h/day, 2 offs + 2 half-days in 30 days)
    // 30 days in month (Nov 2026), 2 offs, 2 half-days => 26 full days * 8.5 + 2 half-days * 4.25 = 221 + 8.5 = 229.5 hrs
    const empAhmed = {
      offPolicy: "MONTHLY_QUOTA" as const,
      weeklyOffDays: [],
      monthlyOffQuota: 2,
      monthlyHalfDayQuota: 2,
      requiredDailyHours: 8.5,
    };
    const resD = calculateMonthlyTargetHours(empAhmed, 2026, 11, []);
    expect(resD.daysInMonth).toBe(30);
    expect(resD.scheduledOffDays).toBe(2);
    expect(resD.halfDays).toBe(2);
    expect(resD.workingDays).toBe(27); // 26 full + 1 (from 2 * 0.5)
    expect(resD.targetHours).toBe(229.5);
  });

  it("handles Early Arrival Claim approval (System was off) and mid-day break deduction", () => {
    const employee: any = {
      dutyType: "FIXED_SHIFT",
      shiftStartTime: "10:00",
      shiftEndTime: "20:00",
      requiredDailyHours: 10,
      graceMinutes: 15,
      halfDayMinutes: 90,
    };

    // Staff scanned at 10:45 AM PKT (05:45 UTC) because PC was off, but claimed 09:55 AM PKT (04:55 UTC)
    // Checked out at 08:25 PM PKT (15:25 UTC) with a 30-min mid-day break
    const att: any = {
      date: "2026-10-29",
      checkIn: new Date("2026-10-29T05:45:00.000Z"), // 10:45 PKT (would be 45m late)
      claimedArrivalTime: new Date("2026-10-29T04:55:00.000Z"), // 09:55 PKT (on time)
      claimedArrivalStatus: "PENDING",
      checkOut: new Date("2026-10-29T15:25:00.000Z"), // 20:25 PKT
      breaks: [
        {
          outTime: new Date("2026-10-29T09:00:00.000Z"),
          inTime: new Date("2026-10-29T09:30:00.000Z"),
        },
      ],
      flags: ["EARLY_ARRIVAL_CLAIMED"],
    };

    // Before approval: marked LATE (45 mins)
    recomputeAttendanceRecord(employee, att, {
      isWeeklyOff: false,
      isHoliday: false,
    });
    expect(att.lateMinutes).toBe(45);
    expect(att.status).toBe("LATE");

    // After HR approves early arrival claim: on time (0m late) and 10h worked (630m gross - 30m break = 600m)
    att.claimedArrivalStatus = "APPROVED";
    recomputeAttendanceRecord(employee, att, {
      isWeeklyOff: false,
      isHoliday: false,
    });
    expect(att.lateMinutes).toBe(0);
    expect(att.totalBreakMinutes).toBe(30);
    expect(att.workedMinutes).toBe(600);
    expect(att.status).toBe("PRESENT");
  });

  it("evaluates FLEXIBLE_HOURS 3h part-time staff without false late flags", () => {
    const flexEmp: any = {
      dutyType: "FLEXIBLE_HOURS",
      requiredDailyHours: 3,
    };

    // Arrives at 3:00 PM PKT (10:00 UTC) and leaves at 6:10 PM PKT (13:10 UTC) => 190m worked vs 180m target
    const att: any = {
      date: "2026-10-29",
      checkIn: new Date("2026-10-29T10:00:00.000Z"),
      checkOut: new Date("2026-10-29T13:10:00.000Z"),
      claimedArrivalStatus: "NONE",
      breaks: [],
      flags: [],
    };

    recomputeAttendanceRecord(flexEmp, att, {
      isWeeklyOff: false,
      isHoliday: false,
    });
    expect(att.lateMinutes).toBe(0);
    expect(att.workedMinutes).toBe(190);
    expect(att.status).toBe("PRESENT");
  });
});

