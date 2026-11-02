import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Employee } from "@/models/Employee";
import { EmployeeCard } from "@/models/EmployeeCard";
import { Holiday } from "@/models/Holiday";
import { User } from "@/models/User";
import "@/models/Location";
import "@/models/Shift";
import { verifyRole } from "@/lib/auth/rbac";
import {
  encryptCNIC,
  decryptCNIC,
  maskCNIC,
  hashPin,
  generateCardUid,
} from "@/lib/hr/crypto";
import { calculateMonthlyTargetHours, getPKTTimeParts } from "@/lib/hr/attendanceEngine";
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
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const locationId = searchParams.get("locationId") || "";

    const query: any = {};
    if (search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      query.$or = [
        { name: regex },
        { employeeCode: regex },
        { designation: regex },
        { phone: regex },
        { activeCardUid: regex },
      ];
    }
    if (status) query.status = status;
    if (locationId) query.location = locationId;

    const employees = await Employee.find(query)
      .select("-pinHash")
      .populate("location", "name code type")
      .populate("userId", "username name role")
      .populate("shift", "name code shiftType startTime endTime paidDailyHours")
      .sort({ createdAt: -1 })
      .lean();

    // Find all system User accounts to show linked status or allow 1-click import
    const allUsers = await User.find({ active: true })
      .select("name username role assignedLocation")
      .populate("assignedLocation", "name code type")
      .sort({ createdAt: -1 })
      .lean();

    const linkedUserIds = new Set(
      employees
        .map((e: any) => (e.userId?._id || e.userId)?.toString())
        .filter(Boolean)
    );

    const unlinkedUsers = allUsers.filter(
      (u: any) => !linkedUserIds.has(u._id.toString())
    );

    const pktNow = getPKTTimeParts();
    const monthPrefix = `${pktNow.year}-${String(pktNow.month).padStart(2, "0")}`;
    const holidays = await Holiday.find({
      date: { $regex: `^${monthPrefix}` },
    })
      .select("date")
      .lean();
    const holidayDates = holidays.map((h) => h.date);

    const isFullAccess =
      auth.user?.role === "Admin" ||
      auth.user?.role === "HR" ||
      auth.user?.role === "Warehouse";

    const enriched = employees.map((emp: any) => {
      const targetSummary = calculateMonthlyTargetHours(
        emp,
        pktNow.year,
        pktNow.month,
        holidayDates
      );

      return {
        ...emp,
        baseSalary: isFullAccess ? emp.baseSalary : undefined,
        cnicDecrypted: isFullAccess ? decryptCNIC(emp.cnicEncrypted) : undefined,
        cnicEncrypted: undefined,
        targetSummary,
      };
    });

    return NextResponse.json({
      success: true,
      data: enriched,
      unlinkedUsers,
      allUsers,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch employees." },
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

    // Handle 1-Click Bulk Import from System Users
    if (body.action === "IMPORT_USERS" && Array.isArray(body.userIds)) {
      const usersToImport = await User.find({ _id: { $in: body.userIds } }).lean();
      const imported: any[] = [];
      let totalCount = await Employee.countDocuments();

      const roleToDesignation: Record<string, string> = {
        Salesman: "Salesman",
        Branch: "Branch Staff",
        Warehouse: "Warehouse Manager",
        Accountant: "Accountant",
        HR: "HR Manager",
        Guard: "Gate Guard",
        Admin: "Administrator",
      };

      for (const u of usersToImport) {
        const existingLink = await Employee.findOne({ userId: u._id });
        if (existingLink) continue;

        totalCount++;
        let code = `EMP-${String(totalCount).padStart(3, "0")}`;
        while (await Employee.findOne({ employeeCode: code })) {
          totalCount++;
          code = `EMP-${String(totalCount).padStart(3, "0")}`;
        }

        const cardUid = generateCardUid();
        const emp = await Employee.create({
          employeeCode: code,
          name: (u.name || u.username).trim(),
          designation: roleToDesignation[u.role] || u.role || "Staff",
          location: u.assignedLocation || undefined,
          userId: u._id,
          phone: body.defaultPhone || "0300-0000000",
          bloodGroup: "Unknown",
          joiningDate: u.createdAt || new Date(),
          baseSalary: Number(body.defaultSalary) || 35000,
          status: "ACTIVE",
          dutyType: "FIXED_SHIFT",
          shiftStartTime: "10:00",
          shiftEndTime: "20:00",
          requiredDailyHours: Number(body.defaultDailyHours) || 10,
          graceMinutes: 15,
          halfDayMinutes: 90,
          offPolicy: "WEEKLY_FIXED",
          weeklyOffDays: [0],
          monthlyOffQuota: 4,
          activeCardUid: cardUid,
        });

        await EmployeeCard.create({
          cardUid,
          employee: emp._id,
          status: "ACTIVE",
          issueDate: new Date(),
          issuedBy: auth.user?.userId,
          issuedByName: auth.user?.username || "HR",
          replacementReason: "INITIAL",
          replacementNotes: `Imported from system user @${u.username}`,
        });

        await recordHRAuditLog({
          action: "EMPLOYEE_IMPORTED_FROM_USER",
          module: "HR_EMPLOYEE",
          targetId: emp._id.toString(),
          targetLabel: `${emp.name} (${emp.employeeCode}) ← @${u.username}`,
          valueBefore: null,
          valueAfter: {
            employeeCode: emp.employeeCode,
            linkedUser: u.username,
            cardUid,
          },
          reason: `Imported existing system user @${u.username} into HR Employees`,
          performedBy: auth.user?.userId,
          performedByName: auth.user?.username,
        });

        imported.push(emp);
      }

      return NextResponse.json({
        success: true,
        message: `${imported.length} user account(s) imported into HR Employees with active ID cards.`,
        data: imported,
      });
    }

    const {
      employeeCode,
      name,
      photoUrl,
      designation,
      location,
      userId,
      cnic,
      phone,
      emergencyContactName,
      emergencyContactPhone,
      bloodGroup,
      joiningDate,
      baseSalary,
      status,
      shift,
      dutyType,
      shiftStartTime,
      shiftEndTime,
      requiredDailyHours,
      breakMinutes,
      graceMinutes,
      halfDayMinutes,
      crossesMidnight,
      offPolicy,
      weeklyOffDays,
      monthlyOffQuota,
      monthlyHalfDayQuota,
      pin,
      autoIssueCard = true,
    } = body;

    if (!name || !designation || !phone) {
      return NextResponse.json(
        {
          success: false,
          error: "Name, designation, and phone number are required.",
        },
        { status: 400 }
      );
    }

    // Generate unique employeeCode if not provided
    let finalCode = employeeCode ? employeeCode.trim().toUpperCase() : "";
    if (!finalCode) {
      const total = await Employee.countDocuments();
      let candidateNum = total + 1;
      while (true) {
        const candidate = `EMP-${String(candidateNum).padStart(3, "0")}`;
        const exists = await Employee.findOne({ employeeCode: candidate });
        if (!exists) {
          finalCode = candidate;
          break;
        }
        candidateNum++;
      }
    } else {
      const exists = await Employee.findOne({ employeeCode: finalCode });
      if (exists) {
        return NextResponse.json(
          {
            success: false,
            error: `Employee code '${finalCode}' is already in use.`,
          },
          { status: 400 }
        );
      }
    }

    const cnicEncrypted = cnic ? encryptCNIC(cnic) : "";
    const cnicMasked = cnic ? maskCNIC(cnic) : "";

    let pinHash = "";
    let hasPin = false;
    if (pin && String(pin).trim().length === 4) {
      pinHash = hashPin(String(pin).trim());
      hasPin = true;
    }

    let initialCardUid: string | null = null;
    if (autoIssueCard) {
      initialCardUid = generateCardUid();
    }

    const created = await Employee.create({
      employeeCode: finalCode,
      name: name.trim(),
      photoUrl: photoUrl || "",
      designation: designation.trim(),
      location: location || undefined,
      userId: userId || undefined,
      cnicEncrypted,
      cnicMasked,
      phone: phone.trim(),
      emergencyContactName: emergencyContactName?.trim() || "",
      emergencyContactPhone: emergencyContactPhone?.trim() || "",
      bloodGroup: bloodGroup || "Unknown",
      joiningDate: joiningDate ? new Date(joiningDate) : new Date(),
      baseSalary: Number(baseSalary) || 0,
      status: status || "ACTIVE",
      shift: shift || undefined,
      dutyType: dutyType || "FIXED_SHIFT",
      shiftStartTime: shiftStartTime || "10:00",
      shiftEndTime: shiftEndTime || "20:00",
      requiredDailyHours: Number(requiredDailyHours) || 8,
      breakMinutes: Number(breakMinutes ?? 60),
      graceMinutes: Number(graceMinutes ?? 15),
      halfDayMinutes: Number(halfDayMinutes ?? 90),
      crossesMidnight: Boolean(crossesMidnight),
      offPolicy: offPolicy || "WEEKLY_FIXED",
      weeklyOffDays: Array.isArray(weeklyOffDays) ? weeklyOffDays : [0],
      monthlyOffQuota: Number(monthlyOffQuota ?? 4),
      monthlyHalfDayQuota: Number(monthlyHalfDayQuota ?? 0),
      pinHash,
      hasPin,
      activeCardUid: initialCardUid,
    });

    if (initialCardUid) {
      await EmployeeCard.create({
        cardUid: initialCardUid,
        employee: created._id,
        status: "ACTIVE",
        issueDate: new Date(),
        issuedBy: auth.user?.userId,
        issuedByName: auth.user?.username || "HR",
        replacementReason: "INITIAL",
        replacementNotes: "Auto-issued upon employee creation",
      });
    }

    await recordHRAuditLog({
      action: "EMPLOYEE_CREATED",
      module: "HR_EMPLOYEE",
      targetId: created._id.toString(),
      targetLabel: `${created.name} (${created.employeeCode})`,
      valueBefore: null,
      valueAfter: {
        employeeCode: created.employeeCode,
        name: created.name,
        designation: created.designation,
        dutyType: created.dutyType,
        requiredDailyHours: created.requiredDailyHours,
        offPolicy: created.offPolicy,
        weeklyOffDays: created.weeklyOffDays,
        monthlyOffQuota: created.monthlyOffQuota,
        activeCardUid: initialCardUid,
      },
      reason: "New staff member registered",
      performedBy: auth.user?.userId,
      performedByName: auth.user?.username,
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create employee." },
      { status: 500 }
    );
  }
}

