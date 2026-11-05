import { IEmployee, Employee } from "@/models/Employee";
import { EmployeeCard } from "@/models/EmployeeCard";
import { Attendance, IAttendance } from "@/models/Attendance";
import { Holiday } from "@/models/Holiday";
import { verifyPin } from "./crypto";
import { recordHRAuditLog } from "./auditLog";
import { Types } from "mongoose";

/**
 * Formats a Date into YYYY-MM-DD in Pakistan Standard Time (UTC+5).
 */
export function toPKTDateString(date: Date = new Date()): string {
  const pktMs = date.getTime() + 5 * 60 * 60 * 1000;
  const pkt = new Date(pktMs);
  const y = pkt.getUTCFullYear();
  const m = String(pkt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(pkt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Returns hours and minutes in PKT (0-23, 0-59) and day of week (0=Sun..6=Sat).
 */
export function getPKTTimeParts(date: Date = new Date()) {
  const pktMs = date.getTime() + 5 * 60 * 60 * 1000;
  const pkt = new Date(pktMs);
  return {
    year: pkt.getUTCFullYear(),
    month: pkt.getUTCMonth() + 1,
    day: pkt.getUTCDate(),
    dayOfWeek: pkt.getUTCDay(),
    hours: pkt.getUTCHours(),
    minutes: pkt.getUTCMinutes(),
    totalMinutesOfDay: pkt.getUTCHours() * 60 + pkt.getUTCMinutes(),
  };
}

/**
 * Parses "HH:mm" into minutes from midnight.
 */
export function parseTimeToMinutes(timeStr?: string): number {
  if (!timeStr || !timeStr.includes(":")) return 10 * 60; // default 10:00 AM
  const [h, m] = timeStr.split(":").map((n) => parseInt(n, 10) || 0);
  return h * 60 + m;
}

/**
 * Calculates calendar-based working days and target hours for an employee in a given month.
 * Supports:
 * - WEEKLY_FIXED offs (e.g. 1 off/week on Sunday [0], or 2 offs/week [6,0])
 * - MONTHLY_QUOTA offs (e.g. 1, 2, or 4 floating offs in the month)
 * - NONE (no scheduled offs)
 * - Custom requiredDailyHours per employee (e.g. 3h, 8h, 10h)
 */
export function calculateMonthlyTargetHours(
  employee: Pick<
    IEmployee,
    "offPolicy" | "weeklyOffDays" | "monthlyOffQuota" | "requiredDailyHours"
  > & { monthlyHalfDayQuota?: number; holidayOffAllowed?: boolean },
  year: number,
  month: number, // 1-12
  holidayDates: string[] = []
) {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const effectiveHolidayDates =
    employee.holidayOffAllowed === false ? [] : holidayDates;
  const holidaySet = new Set(effectiveHolidayDates);

  let scheduledOffDays = 0;
  let effectiveHolidays = 0;
  const halfDays = Math.max(0, employee.monthlyHalfDayQuota || 0);

  if (employee.offPolicy === "WEEKLY_FIXED") {
    const offDaySet = new Set(employee.weeklyOffDays || [0]);
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(Date.UTC(year, month - 1, d));
      const dow = dt.getUTCDay();
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (offDaySet.has(dow)) {
        scheduledOffDays++;
      } else if (holidaySet.has(dateStr)) {
        effectiveHolidays++;
      }
    }
  } else if (employee.offPolicy === "MONTHLY_QUOTA") {
    scheduledOffDays = Math.min(daysInMonth, Math.max(0, employee.monthlyOffQuota || 0));
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (holidaySet.has(dateStr)) {
        effectiveHolidays++;
      }
    }
  } else {
    // NONE
    scheduledOffDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (holidaySet.has(dateStr)) {
        effectiveHolidays++;
      }
    }
  }

  const fullWorkingDays = Math.max(
    0,
    daysInMonth - scheduledOffDays - effectiveHolidays - halfDays
  );
  const dailyHours = employee.requiredDailyHours || 8;
  const targetHours = Number(
    ((fullWorkingDays * dailyHours) + (halfDays * dailyHours * 0.5)).toFixed(2)
  );

  return {
    daysInMonth,
    scheduledOffDays,
    effectiveHolidays,
    halfDays,
    workingDays: fullWorkingDays + (halfDays * 0.5),
    dailyHours,
    targetHours,
    targetMinutes: Math.round(targetHours * 60),
  };
}

/**
 * Calculates calendar-based working days and target hours for any arbitrary date range (e.g. 11th to 10th, 13th to 12th).
 */
export function calculatePeriodTargetHours(
  employee: Pick<
    IEmployee,
    "offPolicy" | "weeklyOffDays" | "monthlyOffQuota" | "requiredDailyHours"
  > & { monthlyHalfDayQuota?: number; holidayOffAllowed?: boolean },
  startDateStr: string, // YYYY-MM-DD
  endDateStr: string,   // YYYY-MM-DD
  holidayDates: string[] = []
) {
  const [sY, sM, sD] = startDateStr.split("-").map((n) => parseInt(n, 10));
  const [eY, eM, eD] = endDateStr.split("-").map((n) => parseInt(n, 10));

  const startUtc = new Date(Date.UTC(sY, sM - 1, sD));
  const endUtc = new Date(Date.UTC(eY, eM - 1, eD));

  const effectiveHolidayDates =
    employee.holidayOffAllowed === false ? [] : holidayDates;
  const holidaySet = new Set(effectiveHolidayDates);
  let calendarDays = 0;
  let scheduledOffDays = 0;
  let effectiveHolidays = 0;
  const offDaySet = new Set(employee.weeklyOffDays || [0]);

  const curr = new Date(startUtc);
  while (curr <= endUtc) {
    calendarDays++;
    const y = curr.getUTCFullYear();
    const m = String(curr.getUTCMonth() + 1).padStart(2, "0");
    const d = String(curr.getUTCDate()).padStart(2, "0");
    const dateStr = `${y}-${m}-${d}`;
    const dow = curr.getUTCDay();

    if (employee.offPolicy === "WEEKLY_FIXED" && offDaySet.has(dow)) {
      scheduledOffDays++;
    } else if (holidaySet.has(dateStr)) {
      effectiveHolidays++;
    }

    curr.setUTCDate(curr.getUTCDate() + 1);
  }

  if (employee.offPolicy === "MONTHLY_QUOTA") {
    const approxMonths = Math.max(1, calendarDays / 30);
    scheduledOffDays = Math.round((employee.monthlyOffQuota || 4) * approxMonths);
  }

  const halfDays = Math.max(0, employee.monthlyHalfDayQuota || 0);
  const fullWorkingDays = Math.max(
    0,
    calendarDays - scheduledOffDays - effectiveHolidays - halfDays
  );
  const dailyHours = employee.requiredDailyHours || 8;
  const targetHours = Number(
    (fullWorkingDays * dailyHours + halfDays * dailyHours * 0.5).toFixed(2)
  );

  return {
    calendarDays,
    scheduledOffDays,
    effectiveHolidays,
    halfDays,
    workingDays: fullWorkingDays + halfDays * 0.5,
    dailyHours,
    targetHours,
    targetMinutes: Math.round(targetHours * 60),
  };
}

/**
 * Checks if a specific YYYY-MM-DD date is a fixed weekly off or gazetted holiday for the employee.
 */
export async function checkDayOffOrHoliday(
  employee: IEmployee,
  dateStr: string
): Promise<{ isWeeklyOff: boolean; isHoliday: boolean; holidayName?: string }> {
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();

  const isWeeklyOff =
    employee.offPolicy === "WEEKLY_FIXED" &&
    Array.isArray(employee.weeklyOffDays) &&
    employee.weeklyOffDays.includes(dow);

  const holiday = employee.holidayOffAllowed
    ? await Holiday.findOne({ date: dateStr }).lean()
    : null;

  return {
    isWeeklyOff,
    isHoliday: !!holiday,
    holidayName: holiday?.name,
  };
}

/**
 * Recomputes attendance metrics (lateMinutes, workedMinutes, shortMinutes, status, flags)
 * whenever a punch or HR correction occurs.
 */
export function recomputeAttendanceRecord(
  employee: IEmployee,
  att: IAttendance,
  dayInfo: { isWeeklyOff: boolean; isHoliday: boolean }
) {
  const targetMinutes = Math.round((employee.requiredDailyHours || 8) * 60);
  att.targetMinutes = targetMinutes;

  // Calculate total breaks
  let totalBreakMins = 0;
  for (const brk of att.breaks || []) {
    if (brk.outTime && brk.inTime) {
      const diff = Math.max(
        0,
        Math.round(
          (new Date(brk.inTime).getTime() - new Date(brk.outTime).getTime()) /
            60000
        )
      );
      brk.durationMinutes = diff;
      totalBreakMins += diff;
    }
  }
  att.totalBreakMinutes = totalBreakMins;

  const flagSet = new Set<string>(att.flags || []);

  // Determine effective arrival time (if early arrival claim was approved by HR, use claimedArrivalTime)
  const effectiveCheckIn =
    att.claimedArrivalStatus === "APPROVED" && att.claimedArrivalTime
      ? new Date(att.claimedArrivalTime)
      : att.checkIn
      ? new Date(att.checkIn)
      : null;

  if (!effectiveCheckIn) {
    att.workedMinutes = 0;
    att.shortMinutes = 0;
    att.extraMinutes = 0;
    att.lateMinutes = 0;
    if (dayInfo.isHoliday) {
      att.status = "HOLIDAY";
    } else if (dayInfo.isWeeklyOff) {
      att.status = "WEEKLY_OFF";
    }
    att.flags = Array.from(flagSet);
    return att;
  }

  // Evaluate late arrival for FIXED_SHIFT employees (FLEXIBLE_HOURS has no fixed arrival time)
  let lateMinutes = 0;
  let isHalfDayByLate = false;

  if (employee.dutyType === "FIXED_SHIFT") {
    const shiftStartMins = parseTimeToMinutes(employee.shiftStartTime || "10:00");
    const checkInParts = getPKTTimeParts(effectiveCheckIn);
    const arrivalMins = checkInParts.totalMinutesOfDay;
    const grace = employee.graceMinutes ?? 15;
    const halfDayThreshold = employee.halfDayMinutes ?? 180; // 3 Hours (180 mins) late = Half Day

    if (arrivalMins > shiftStartMins + grace) {
      lateMinutes = arrivalMins - shiftStartMins;
      if (lateMinutes > halfDayThreshold) {
        isHalfDayByLate = true;
        flagSet.add("HALF_DAY_LATE");
        flagSet.delete("LATE_ARRIVAL");
      } else {
        flagSet.add("LATE_ARRIVAL");
        flagSet.delete("HALF_DAY_LATE");
      }
    } else {
      flagSet.delete("LATE_ARRIVAL");
      flagSet.delete("HALF_DAY_LATE");
    }
  } else {
    flagSet.delete("LATE_ARRIVAL");
    flagSet.delete("HALF_DAY_LATE");
  }

  att.lateMinutes = lateMinutes;

  if (dayInfo.isWeeklyOff || dayInfo.isHoliday) {
    flagSet.add("WORKED_ON_OFF_DAY");
  }

  // Calculate worked minutes if checkOut exists
  if (att.checkOut) {
    const checkOutDate = new Date(att.checkOut);
    const grossMinutes = Math.max(
      0,
      Math.round((checkOutDate.getTime() - effectiveCheckIn.getTime()) / 60000)
    );
    const netWorked = Math.max(0, grossMinutes - totalBreakMins);
    att.workedMinutes = netWorked;

    if (netWorked < targetMinutes) {
      att.shortMinutes = targetMinutes - netWorked;
      att.extraMinutes = 0;
      // Allow 10 minute tolerance before flagging short hours
      if (att.shortMinutes > 10) {
        flagSet.add("SHORT_HOURS");
      } else {
        flagSet.delete("SHORT_HOURS");
      }
    } else {
      att.shortMinutes = 0;
      att.extraMinutes = netWorked - targetMinutes;
      flagSet.delete("SHORT_HOURS");
    }

    // Status resolution on completed day
    if (dayInfo.isWeeklyOff || dayInfo.isHoliday) {
      att.status = "PRESENT_ON_OFF_DAY";
    } else if (isHalfDayByLate || netWorked < targetMinutes * 0.55) {
      att.status = "HALF_DAY";
    } else if (lateMinutes > 0) {
      att.status = "LATE";
    } else if (att.shortMinutes > 15) {
      att.status = "SHORT_HOURS";
    } else {
      att.status = "PRESENT";
    }
  } else {
    // Still checked in (no final checkOut yet)
    att.workedMinutes = 0;
    att.shortMinutes = 0;
    att.extraMinutes = 0;
    if (dayInfo.isWeeklyOff || dayInfo.isHoliday) {
      att.status = "PRESENT_ON_OFF_DAY";
    } else if (isHalfDayByLate) {
      att.status = "HALF_DAY";
    } else if (lateMinutes > 0) {
      att.status = "LATE";
    } else {
      att.status = "PRESENT";
    }
  }

  att.flags = Array.from(flagSet);
  return att;
}

/**
 * Marks any unclosed attendance records from previous days as MISSING_CHECKOUT
 * (excluding active midnight-crossover shifts within the last 15 hours).
 */
export async function flagStaleMissingCheckouts(now: Date = new Date()) {
  const todayStr = toPKTDateString(now);
  const cutoffTime = new Date(now.getTime() - 15 * 60 * 60 * 1000);

  const openRecords = await Attendance.find({
    date: { $lt: todayStr },
    checkIn: { $ne: null, $lt: cutoffTime },
    checkOut: null,
    status: { $nin: ["MISSING_CHECKOUT", "ABSENT", "WEEKLY_OFF", "HOLIDAY"] },
  });

  for (const rec of openRecords) {
    rec.status = "MISSING_CHECKOUT";
    if (!rec.flags.includes("MISSING_CHECKOUT")) {
      rec.flags.push("MISSING_CHECKOUT");
    }
    await rec.save();
  }
}

export interface KioskScanInput {
  cardUid?: string;
  employeeCode?: string;
  pin?: string;
  locationId?: string;
  action?: "AUTO" | "START_BREAK" | "CLAIM_EARLY_ARRIVAL";
  claimedArrivalTimeStr?: string; // e.g. "09:30"
  claimedArrivalReason?: string;
  performedByUserId?: string;
  performedByName?: string;
  ipAddress?: string;
}

/**
 * Processes a gate kiosk scan or backup PIN entry with full anti-fraud and edge-case handling.
 */
export async function processKioskScan(input: KioskScanInput) {
  const now = new Date();
  await flagStaleMissingCheckouts(now);

  let employee: any = null;
  let punchMethod: "CARD_SCAN" | "PIN_BACKUP" = "CARD_SCAN";
  let cardUidUsed: string | null = null;

  // 1. Authenticate by Card UID or Employee Code + PIN
  if (input.cardUid) {
    const cleanUid = input.cardUid.trim().toUpperCase();
    const card = await EmployeeCard.findOne({ cardUid: cleanUid })
      .populate("employee")
      .lean();

    if (!card) {
      return {
        success: false,
        kioskState: "INVALID_CARD",
        title: "UNRECOGNIZED CARD",
        message: `Card code "${cleanUid}" is not registered in the system.`,
        serverTime: now.toISOString(),
      };
    }

    // Rule 2: Blocked or lost card scanned at kiosk shows RED SCREEN + ALARM with block date
    if (card.status !== "ACTIVE") {
      const empObj: any = card.employee;
      await recordHRAuditLog({
        action: "BLOCKED_CARD_SCAN_ATTEMPT",
        module: "HR_CARD",
        targetId: card.cardUid,
        targetLabel: `${empObj?.name || "Unknown"} (${card.cardUid})`,
        valueBefore: { status: card.status, blockedAt: card.blockedAt },
        valueAfter: { attemptedAt: now.toISOString() },
        reason: `Blocked/Lost card (${card.status}) scanned at Gate Kiosk`,
        performedBy: input.performedByUserId,
        performedByName: input.performedByName || "Gate Kiosk",
        ipAddress: input.ipAddress,
      });

      return {
        success: false,
        kioskState: "BLOCKED_CARD",
        title: `ALERT: ${card.status.replace("_", " ")} CARD`,
        message: "CONFISCATE THIS CARD IMMEDIATELY! Do not return to bearer.",
        cardInfo: {
          cardUid: card.cardUid,
          status: card.status,
          blockedAt: card.blockedAt || card.updatedAt,
          blockReason: card.blockReason || card.replacementReason,
          employeeName: empObj?.name || "Unknown Staff",
          employeeCode: empObj?.employeeCode || "",
          designation: empObj?.designation || "",
          photoUrl: empObj?.photoUrl || "",
        },
        serverTime: now.toISOString(),
      };
    }

    // Check expiryDate if set
    if (card.expiryDate && new Date(card.expiryDate) < now) {
      await EmployeeCard.updateOne(
        { _id: card._id },
        { $set: { status: "EXPIRED" } }
      );
      return {
        success: false,
        kioskState: "BLOCKED_CARD",
        title: "EXPIRED EMPLOYEE CARD",
        message: "This card has expired. Please ask HR to renew or replace it.",
        cardInfo: {
          cardUid: card.cardUid,
          status: "EXPIRED",
          blockedAt: card.expiryDate,
          employeeName: (card.employee as any)?.name || "Staff",
        },
        serverTime: now.toISOString(),
      };
    }

    employee = await Employee.findById((card.employee as any)?._id || card.employee);
    cardUidUsed = card.cardUid;
  } else if (input.employeeCode && input.pin) {
    // Edge Case 4: Forgot card at home -> Backup 4-digit PIN
    punchMethod = "PIN_BACKUP";
    const cleanCode = input.employeeCode.trim().toUpperCase();
    employee = await Employee.findOne({ employeeCode: cleanCode });

    if (!employee) {
      return {
        success: false,
        kioskState: "INVALID_CARD",
        title: "EMPLOYEE NOT FOUND",
        message: `No employee found with code "${cleanCode}".`,
        serverTime: now.toISOString(),
      };
    }

    // Check 15-minute PIN lockout
    if (employee.pinLockedUntil && new Date(employee.pinLockedUntil) > now) {
      const minsLeft = Math.ceil(
        (new Date(employee.pinLockedUntil).getTime() - now.getTime()) / 60000
      );
      return {
        success: false,
        kioskState: "PIN_LOCKED",
        title: "PIN TEMPORARILY LOCKED",
        message: `Too many wrong attempts. Try again in ${minsLeft} minute(s) or contact HR.`,
        serverTime: now.toISOString(),
      };
    }

    if (!employee.hasPin || !employee.pinHash) {
      return {
        success: false,
        kioskState: "INVALID_CARD",
        title: "PIN NOT SET",
        message: `${employee.name} does not have a backup PIN configured. Ask HR for manual check-in.`,
        serverTime: now.toISOString(),
      };
    }

    const pinValid = verifyPin(input.pin, employee.pinHash);
    if (!pinValid) {
      employee.pinFailedAttempts = (employee.pinFailedAttempts || 0) + 1;
      if (employee.pinFailedAttempts >= 3) {
        employee.pinLockedUntil = new Date(now.getTime() + 15 * 60 * 1000);
        await employee.save();
        return {
          success: false,
          kioskState: "PIN_LOCKED",
          title: "PIN LOCKED FOR 15 MINUTES",
          message: "3 incorrect PIN attempts recorded.",
          serverTime: now.toISOString(),
        };
      }
      await employee.save();
      return {
        success: false,
        kioskState: "INVALID_CARD",
        title: "INCORRECT PIN",
        message: `Invalid PIN. ${3 - employee.pinFailedAttempts} attempt(s) remaining before 15m lock.`,
        serverTime: now.toISOString(),
      };
    }

    // Reset failed attempts on valid PIN
    employee.pinFailedAttempts = 0;
    employee.pinLockedUntil = null;
    await employee.save();
  } else {
    return {
      success: false,
      kioskState: "INVALID_CARD",
      title: "MISSING SCAN DATA",
      message: "Please scan an employee card or enter Employee Code + 4-digit PIN.",
      serverTime: now.toISOString(),
    };
  }

  if (!employee || employee.status !== "ACTIVE") {
    return {
      success: false,
      kioskState: "BLOCKED_CARD",
      title: "INACTIVE STAFF ACCOUNT",
      message: `${employee?.name || "Employee"} is currently marked as ${
        employee?.status || "INACTIVE"
      }. Gate entry denied.`,
      serverTime: now.toISOString(),
    };
  }

  // 2. Determine shift date (Edge Case 6: Night shifts / Midnight crossover before 06:00 AM)
  const pktNow = getPKTTimeParts(now);
  let targetDateStr = toPKTDateString(now);

  if (pktNow.hours < 6) {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayStr = toPKTDateString(yesterday);
    const yesterdayOpen = await Attendance.findOne({
      employee: employee._id,
      date: yesterdayStr,
      checkIn: { $ne: null },
      checkOut: null,
    });
    if (yesterdayOpen) {
      targetDateStr = yesterdayStr;
    }
  }

  const dayInfo = await checkDayOffOrHoliday(employee, targetDateStr);
  let attendance = await Attendance.findOne({
    employee: employee._id,
    date: targetDateStr,
  });

  // Handle Explicit Action: CLAIM_EARLY_ARRIVAL (Edge Case 1: System/Kiosk was off when salesman arrived)
  if (input.action === "CLAIM_EARLY_ARRIVAL" && input.claimedArrivalTimeStr) {
    if (!attendance) {
      attendance = new Attendance({
        employee: employee._id,
        date: targetDateStr,
        location: input.locationId
          ? new Types.ObjectId(input.locationId)
          : employee.location || null,
        checkIn: now,
        punchMethod,
        cardUidUsed,
        flags: punchMethod === "PIN_BACKUP" ? ["PIN_USED_NO_CARD"] : [],
      });
    }

    const [claimH, claimM] = input.claimedArrivalTimeStr
      .split(":")
      .map((n) => parseInt(n, 10) || 0);
    const [y, m, d] = targetDateStr.split("-").map((n) => parseInt(n, 10));
    // Construct UTC timestamp from PKT YYYY-MM-DD HH:mm
    const claimedUtcMs =
      Date.UTC(y, m - 1, d, claimH, claimM, 0) - 5 * 60 * 60 * 1000;
    attendance.claimedArrivalTime = new Date(claimedUtcMs);
    attendance.claimedArrivalReason =
      input.claimedArrivalReason || "System / Gate PC was off at arrival time";
    attendance.claimedArrivalStatus = "PENDING";
    if (!attendance.flags.includes("EARLY_ARRIVAL_CLAIMED")) {
      attendance.flags.push("EARLY_ARRIVAL_CLAIMED");
    }

    recomputeAttendanceRecord(employee, attendance, dayInfo);
    await attendance.save();

    return {
      success: true,
      kioskState: "CHECK_IN",
      title: "EARLY ARRIVAL CLAIM RECORDED",
      message: `Check-in logged & actual arrival claim (${input.claimedArrivalTimeStr}) sent to HR for 1-click approval.`,
      employee: {
        _id: employee._id,
        name: employee.name,
        employeeCode: employee.employeeCode,
        designation: employee.designation,
        photoUrl: employee.photoUrl,
        dutyType: employee.dutyType,
        requiredDailyHours: employee.requiredDailyHours,
      },
      attendance,
      serverTime: now.toISOString(),
    };
  }

  // Handle Explicit Action: START_BREAK (Edge Case 2: Going out for bank/market/lunch)
  if (input.action === "START_BREAK" && attendance && attendance.checkIn) {
    // If just checked out within the last 2 minutes, convert that check-out into an active break!
    if (attendance.checkOut) {
      const breakStart = attendance.checkOut;
      attendance.checkOut = null;
      attendance.breaks.push({
        outTime: breakStart,
        inTime: null,
        reason: "Short Out / Duty Break",
        durationMinutes: 0,
      });
    } else {
      const openBreak = attendance.breaks.find((b) => !b.inTime);
      if (!openBreak) {
        attendance.breaks.push({
          outTime: now,
          inTime: null,
          reason: "Short Out / Duty Break",
          durationMinutes: 0,
        });
      }
    }
    if (!attendance.flags.includes("ON_BREAK")) {
      attendance.flags.push("ON_BREAK");
    }
    recomputeAttendanceRecord(employee, attendance, dayInfo);
    await attendance.save();

    return {
      success: true,
      kioskState: "BREAK_OUT",
      title: "SHORT OUT / BREAK STARTED",
      message: `${employee.name} marked on Short Out. Scan card again when returning to shop.`,
      employee: {
        _id: employee._id,
        name: employee.name,
        employeeCode: employee.employeeCode,
        designation: employee.designation,
        photoUrl: employee.photoUrl,
        dutyType: employee.dutyType,
        requiredDailyHours: employee.requiredDailyHours,
      },
      attendance,
      serverTime: now.toISOString(),
    };
  }

  // 3. First Scan of the Day -> CHECK_IN (Green Screen)
  if (!attendance || !attendance.checkIn) {
    if (!attendance) {
      attendance = new Attendance({
        employee: employee._id,
        date: targetDateStr,
        location: input.locationId
          ? new Types.ObjectId(input.locationId)
          : employee.location || null,
        checkIn: now,
        punchMethod,
        cardUidUsed,
        flags: [],
      });
    } else {
      attendance.checkIn = now;
      attendance.punchMethod = punchMethod;
      attendance.cardUidUsed = cardUidUsed;
    }

    if (punchMethod === "PIN_BACKUP" && !attendance.flags.includes("PIN_USED_NO_CARD")) {
      attendance.flags.push("PIN_USED_NO_CARD");
    }

    recomputeAttendanceRecord(employee, attendance, dayInfo);
    await attendance.save();

    const statusNote =
      dayInfo.isWeeklyOff || dayInfo.isHoliday
        ? "Worked on Off-Day / Holiday"
        : attendance.lateMinutes > 0
        ? `Late by ${attendance.lateMinutes} min`
        : "On Time";

    return {
      success: true,
      kioskState: "CHECK_IN",
      title: `ASSALAM-O-ALAIKUM, ${employee.name.toUpperCase()}`,
      message: `Clock-In recorded (${statusNote}). Target Duty: ${employee.requiredDailyHours}h`,
      employee: {
        _id: employee._id,
        name: employee.name,
        employeeCode: employee.employeeCode,
        designation: employee.designation,
        photoUrl: employee.photoUrl,
        dutyType: employee.dutyType,
        requiredDailyHours: employee.requiredDailyHours,
        shiftStartTime: employee.shiftStartTime,
        shiftEndTime: employee.shiftEndTime,
      },
      attendance,
      serverTime: now.toISOString(),
    };
  }

  // 4. If employee is currently on an open break -> close break (BREAK_IN)
  const openBreakIdx = attendance.breaks.findIndex((b) => !b.inTime);
  if (openBreakIdx !== -1) {
    const openBreak = attendance.breaks[openBreakIdx];
    const diffSeconds = (now.getTime() - new Date(openBreak.outTime).getTime()) / 1000;
    if (diffSeconds < 60) {
      return {
        success: true,
        kioskState: "BOUNCE_IGNORED",
        title: "ALREADY ON BREAK",
        message: `${employee.name} just started a break ${Math.round(diffSeconds)}s ago. Scan ignored.`,
        employee: {
          _id: employee._id,
          name: employee.name,
          employeeCode: employee.employeeCode,
          designation: employee.designation,
          photoUrl: employee.photoUrl,
        },
        attendance,
        serverTime: now.toISOString(),
      };
    }

    attendance.breaks[openBreakIdx].inTime = now;
    attendance.flags = attendance.flags.filter((f) => f !== "ON_BREAK");
    recomputeAttendanceRecord(employee, attendance, dayInfo);
    await attendance.save();

    return {
      success: true,
      kioskState: "BREAK_IN",
      title: `WELCOME BACK, ${employee.name.toUpperCase()}`,
      message: `Break ended (${attendance.breaks[openBreakIdx].durationMinutes}m). Duty resumed.`,
      employee: {
        _id: employee._id,
        name: employee.name,
        employeeCode: employee.employeeCode,
        designation: employee.designation,
        photoUrl: employee.photoUrl,
        dutyType: employee.dutyType,
        requiredDailyHours: employee.requiredDailyHours,
      },
      attendance,
      serverTime: now.toISOString(),
    };
  }

  // 5. Anti-Bounce Check: 2nd scan within 5 minutes of Check-In or Check-Out
  const lastPunchTime = attendance.checkOut
    ? new Date(attendance.checkOut)
    : new Date(attendance.checkIn);
  const minutesSinceLastPunch =
    (now.getTime() - lastPunchTime.getTime()) / 60000;

  if (minutesSinceLastPunch < 5) {
    return {
      success: true,
      kioskState: "BOUNCE_IGNORED",
      title: "SCAN IGNORED (5-MIN ANTI-BOUNCE)",
      message: `${employee.name} already scanned ${Math.max(
        1,
        Math.round(minutesSinceLastPunch)
      )} minute(s) ago. Duplicate scan prevented.`,
      canClaimEarlyArrival: !attendance.checkOut,
      canStartBreak: true,
      employee: {
        _id: employee._id,
        name: employee.name,
        employeeCode: employee.employeeCode,
        designation: employee.designation,
        photoUrl: employee.photoUrl,
        dutyType: employee.dutyType,
        requiredDailyHours: employee.requiredDailyHours,
      },
      attendance,
      serverTime: now.toISOString(),
    };
  }

  // 6. Edge Case 2: If already checked out earlier today and scanning back in at gate ->
  // Convert the earlier checkOut into a mid-day break and resume duty!
  if (attendance.checkOut) {
    const previousOut = new Date(attendance.checkOut);
    attendance.breaks.push({
      outTime: previousOut,
      inTime: now,
      reason: "Mid-day Out (Auto-converted on return scan)",
      durationMinutes: Math.max(
        0,
        Math.round((now.getTime() - previousOut.getTime()) / 60000)
      ),
    });
    attendance.checkOut = null;
    recomputeAttendanceRecord(employee, attendance, dayInfo);
    await attendance.save();

    return {
      success: true,
      kioskState: "BREAK_IN",
      title: `DUTY RESUMED: ${employee.name.toUpperCase()}`,
      message: `Earlier check-out converted to a break (${
        attendance.breaks[attendance.breaks.length - 1].durationMinutes
      }m). You are clocked back in!`,
      employee: {
        _id: employee._id,
        name: employee.name,
        employeeCode: employee.employeeCode,
        designation: employee.designation,
        photoUrl: employee.photoUrl,
        dutyType: employee.dutyType,
        requiredDailyHours: employee.requiredDailyHours,
      },
      attendance,
      serverTime: now.toISOString(),
    };
  }

  // 7. Standard Second Scan of the Day -> CHECK_OUT (Blue Screen)
  attendance.checkOut = now;
  recomputeAttendanceRecord(employee, attendance, dayInfo);
  await attendance.save();

  const hrs = Math.floor(attendance.workedMinutes / 60);
  const mins = attendance.workedMinutes % 60;

  return {
    success: true,
    kioskState: "CHECK_OUT",
    title: `KHUDA HAFIZ, ${employee.name.toUpperCase()}`,
    message: `Clock-Out complete. Duty Today: ${hrs}h ${mins}m / Target: ${employee.requiredDailyHours}h`,
    canConvertToBreak: true,
    employee: {
      _id: employee._id,
      name: employee.name,
      employeeCode: employee.employeeCode,
      designation: employee.designation,
      photoUrl: employee.photoUrl,
      dutyType: employee.dutyType,
      requiredDailyHours: employee.requiredDailyHours,
    },
    attendance,
    serverTime: now.toISOString(),
  };
}

