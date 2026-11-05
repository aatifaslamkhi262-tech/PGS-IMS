import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { SalaryAdvance } from "@/models/SalaryAdvance";
import { Employee } from "@/models/Employee";
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

    const query: any = {};
    if (status) query.status = status;
    if (employeeId) query.employee = employeeId;

    const advances = await SalaryAdvance.find(query)
      .populate("employee", "name employeeCode designation baseSalary photoUrl")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ success: true, data: advances });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch advances." },
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
    const { employeeId, amount, monthlyDeduction, issueDate, reason, notes } =
      body;

    if (!employeeId || !amount || !monthlyDeduction || !reason) {
      return NextResponse.json(
        {
          success: false,
          error: "Employee, amount, monthly deduction, and reason are required.",
        },
        { status: 400 }
      );
    }

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return NextResponse.json(
        { success: false, error: "Employee not found." },
        { status: 404 }
      );
    }

    const numAmount = Number(amount);
    const numMonthly = Number(monthlyDeduction);

    const advance = await SalaryAdvance.create({
      employee: employee._id,
      amount: numAmount,
      monthlyDeduction: numMonthly,
      remainingBalance: numAmount,
      issueDate: issueDate || new Date().toISOString().split("T")[0],
      reason: reason.trim(),
      notes: notes?.trim() || "",
      status: "ACTIVE",
      issuedBy: auth.user?.userId as any,
      issuedByName: auth.user?.username || "Admin",
    });

    await recordHRAuditLog({
      action: "SALARY_ADVANCE_ISSUED",
      module: "HR_PAYROLL",
      targetId: advance._id.toString(),
      targetLabel: `${employee.name} (${employee.employeeCode}) — PKR ${numAmount.toLocaleString()} (PKR ${numMonthly}/mo)`,
      valueAfter: {
        amount: numAmount,
        monthlyDeduction: numMonthly,
        remainingBalance: numAmount,
        reason,
      },
      reason: reason.trim(),
      performedBy: auth.user?.userId,
      performedByName: auth.user?.username || "Admin",
    });

    return NextResponse.json({
      success: true,
      message: "Salary advance recorded successfully.",
      data: advance,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to record advance." },
      { status: 500 }
    );
  }
}

