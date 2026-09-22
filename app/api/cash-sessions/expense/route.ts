import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Expense } from "@/models/Expense";
import { CashSession } from "@/models/CashSession";
import { Location } from "@/models/Location";
import { recordCashMovement } from "@/lib/cashSessionEngine";
import { lockIdempotencyKey, completeIdempotencyKey, failIdempotencyKey } from "@/lib/idempotencyEngine";

export async function POST(request: Request) {
  let idempotencyKeyHeader = "";
  try {
    await dbConnect();
    const body = await request.json();
    idempotencyKeyHeader = request.headers.get("x-idempotency-key") || body.idempotencyKey || "";

    if (idempotencyKeyHeader) {
      const lockRes = await lockIdempotencyKey(idempotencyKeyHeader, body, "/api/cash-sessions/expense");
      if (lockRes.isDuplicate) {
        return NextResponse.json(
          lockRes.responseBody || { success: false, error: lockRes.error },
          { status: lockRes.statusCode || 409 }
        );
      }
    }

    const {
      sessionId,
      locationId,
      category,
      amount,
      recipient,
      reason,
      createdBy,
    } = body;

    const session = await CashSession.findById(sessionId);
    if (!session || session.status === "CLOSED") {
      if (idempotencyKeyHeader) await failIdempotencyKey(idempotencyKeyHeader);
      return NextResponse.json(
        { success: false, error: "Active open cash register session not found." },
        { status: 400 }
      );
    }

    const location = await Location.findById(locationId || session.location);
    if (!location) {
      if (idempotencyKeyHeader) await failIdempotencyKey(idempotencyKeyHeader);
      return NextResponse.json({ success: false, error: "Location not found." }, { status: 400 });
    }

    const expenseAmount = Number(amount);
    if (!expenseAmount || expenseAmount <= 0) {
      if (idempotencyKeyHeader) await failIdempotencyKey(idempotencyKeyHeader);
      return NextResponse.json({ success: false, error: "Expense amount must be greater than 0." }, { status: 400 });
    }

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const count = await Expense.countDocuments();
    const expenseNumber = `EXP-${dateStr}-${String(count + 1).padStart(3, "0")}`;

    const notes = `Recipient: ${recipient || "N/A"} • Reason: ${reason || "Petty Cash Payout"}`;

    const expense = new Expense({
      expenseNumber,
      location: location._id,
      locationName: location.name,
      category: category || "Other",
      amount: expenseAmount,
      paymentMethod: "CASH",
      notes,
      createdBy: createdBy || session.cashier,
      status: "APPROVED",
    });

    await expense.save();

    // Record explicit physical Cash Movement (OUT)
    await recordCashMovement({
      sessionId: session._id.toString(),
      locationId: location._id.toString(),
      cashier: createdBy || session.cashier,
      type: "PETTY_CASH",
      amount: expenseAmount,
      direction: "OUT",
      referenceType: "Expense",
      referenceId: expenseNumber,
      notes: `Petty cash payout to ${recipient || "N/A"}: ${reason || "Expense"}`,
    });

    session.totalExpenses += expenseAmount;
    session.expectedCash = Math.max(0, session.expectedCash - expenseAmount);
    await session.save();

    const responseData = {
      success: true,
      data: {
        expense,
        session,
      },
    };

    if (idempotencyKeyHeader) {
      await completeIdempotencyKey(idempotencyKeyHeader, 200, responseData);
    }

    return NextResponse.json(responseData);
  } catch (error: any) {
    if (idempotencyKeyHeader) await failIdempotencyKey(idempotencyKeyHeader);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to record petty cash expense." },
      { status: 500 }
    );
  }
}
