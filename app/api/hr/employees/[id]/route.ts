import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Employee } from "@/models/Employee";
import { verifyRole } from "@/lib/auth/rbac";
import { encryptCNIC, maskCNIC, hashPin } from "@/lib/hr/crypto";
import { recordHRAuditLog } from "@/lib/hr/auditLog";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "HR", "Warehouse"]);
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    const { id } = await params;
    const existing = await Employee.findById(id);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Employee not found." },
        { status: 404 }
      );
    }

    const body = await req.json();
    const beforeSnapshot = {
      name: existing.name,
      designation: existing.designation,
      status: existing.status,
      baseSalary: existing.baseSalary,
      dutyType: existing.dutyType,
      shiftStartTime: existing.shiftStartTime,
      shiftEndTime: existing.shiftEndTime,
      requiredDailyHours: existing.requiredDailyHours,
      offPolicy: existing.offPolicy,
      weeklyOffDays: existing.weeklyOffDays,
      monthlyOffQuota: existing.monthlyOffQuota,
      monthlyHalfDayQuota: existing.monthlyHalfDayQuota,
      holidayOffAllowed: existing.holidayOffAllowed,
    };

    if (body.name !== undefined) existing.name = body.name.trim();
    if (body.photoUrl !== undefined) existing.photoUrl = body.photoUrl;
    if (body.designation !== undefined)
      existing.designation = body.designation.trim();
    if (body.location !== undefined)
      existing.location = body.location || undefined;
    if (body.userId !== undefined)
      existing.userId = body.userId || undefined;
    if (body.phone !== undefined) existing.phone = body.phone.trim();
    if (body.emergencyContactName !== undefined)
      existing.emergencyContactName = body.emergencyContactName.trim();
    if (body.emergencyContactPhone !== undefined)
      existing.emergencyContactPhone = body.emergencyContactPhone.trim();
    if (body.bloodGroup !== undefined) existing.bloodGroup = body.bloodGroup;
    if (body.joiningDate !== undefined && body.joiningDate)
      existing.joiningDate = new Date(body.joiningDate);
    if (body.baseSalary !== undefined)
      existing.baseSalary = Number(body.baseSalary) || 0;
    if (body.status !== undefined) existing.status = body.status;

    // Schedule & Off Policy updates
    if (body.shift !== undefined) existing.shift = body.shift || undefined;
    if (body.dutyType !== undefined) existing.dutyType = body.dutyType;
    if (body.shiftStartTime !== undefined)
      existing.shiftStartTime = body.shiftStartTime;
    if (body.shiftEndTime !== undefined)
      existing.shiftEndTime = body.shiftEndTime;
    if (body.requiredDailyHours !== undefined)
      existing.requiredDailyHours = Number(body.requiredDailyHours) || 8;
    if (body.breakMinutes !== undefined)
      existing.breakMinutes = Number(body.breakMinutes ?? 60);
    if (body.graceMinutes !== undefined)
      existing.graceMinutes = Number(body.graceMinutes ?? 15);
    if (body.halfDayMinutes !== undefined)
      existing.halfDayMinutes = Number(body.halfDayMinutes ?? 180);
    if (body.crossesMidnight !== undefined)
      existing.crossesMidnight = Boolean(body.crossesMidnight);
    if (body.offPolicy !== undefined) existing.offPolicy = body.offPolicy;
    if (Array.isArray(body.weeklyOffDays))
      existing.weeklyOffDays = body.weeklyOffDays;
    if (body.monthlyOffQuota !== undefined)
      existing.monthlyOffQuota = Number(body.monthlyOffQuota ?? 0);
    if (body.monthlyHalfDayQuota !== undefined)
      existing.monthlyHalfDayQuota = Number(body.monthlyHalfDayQuota ?? 0);
    if (body.holidayOffAllowed !== undefined)
      existing.holidayOffAllowed = Boolean(body.holidayOffAllowed);

    // CNIC encryption if provided
    if (body.cnic && String(body.cnic).trim()) {
      existing.cnicEncrypted = encryptCNIC(String(body.cnic));
      existing.cnicMasked = maskCNIC(String(body.cnic));
    }

    // Backup PIN update or unlock
    if (body.pin && String(body.pin).trim().length === 4) {
      existing.pinHash = hashPin(String(body.pin).trim());
      existing.hasPin = true;
      existing.pinFailedAttempts = 0;
      existing.pinLockedUntil = null;
    }
    if (body.unlockPin) {
      existing.pinFailedAttempts = 0;
      existing.pinLockedUntil = null;
    }

    await existing.save();

    const afterSnapshot = {
      name: existing.name,
      designation: existing.designation,
      status: existing.status,
      baseSalary: existing.baseSalary,
      dutyType: existing.dutyType,
      shiftStartTime: existing.shiftStartTime,
      shiftEndTime: existing.shiftEndTime,
      requiredDailyHours: existing.requiredDailyHours,
      offPolicy: existing.offPolicy,
      weeklyOffDays: existing.weeklyOffDays,
      monthlyOffQuota: existing.monthlyOffQuota,
      monthlyHalfDayQuota: existing.monthlyHalfDayQuota,
      holidayOffAllowed: existing.holidayOffAllowed,
    };

    await recordHRAuditLog({
      action: "EMPLOYEE_UPDATED",
      module: "HR_EMPLOYEE",
      targetId: existing._id.toString(),
      targetLabel: `${existing.name} (${existing.employeeCode})`,
      valueBefore: beforeSnapshot,
      valueAfter: afterSnapshot,
      reason: body.reason || "Updated employee profile / schedule settings",
      performedBy: auth.user?.userId,
      performedByName: auth.user?.username,
    });

    return NextResponse.json({ success: true, data: existing });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update employee." },
      { status: 500 }
    );
  }
}

