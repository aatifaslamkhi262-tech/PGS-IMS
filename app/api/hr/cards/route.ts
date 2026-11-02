import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Employee } from "@/models/Employee";
import { EmployeeCard } from "@/models/EmployeeCard";
import "@/models/Location";
import { verifyRole } from "@/lib/auth/rbac";
import { generateCardUid } from "@/lib/hr/crypto";
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
    const status = searchParams.get("status") || "";
    const employeeId = searchParams.get("employeeId") || "";

    const query: any = {};
    if (status) query.status = status;
    if (employeeId) query.employee = employeeId;

    const cards = await EmployeeCard.find(query)
      .populate({
        path: "employee",
        select:
          "name employeeCode designation photoUrl bloodGroup emergencyContactName emergencyContactPhone phone status location activeCardUid",
        populate: { path: "location", select: "name code" },
      })
      .sort({ createdAt: -1 })
      .lean();

    const filteredCards = cards.filter((c: any) => c.employee != null);

    const employees = await Employee.find({ status: "ACTIVE" })
      .select(
        "name employeeCode designation photoUrl bloodGroup emergencyContactName emergencyContactPhone phone activeCardUid location"
      )
      .populate("location", "name code")
      .sort({ name: 1 })
      .lean();

    return NextResponse.json({
      success: true,
      data: {
        cards: filteredCards,
        employees,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch cards." },
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
      action, // "ISSUE" | "REPLACE" | "BLOCK"
      employeeId,
      cardId,
      replacementReason = "INITIAL",
      replacementNotes = "",
      replacementFee = 0,
      feeSettlementMode = "NONE",
      expiryDate = null,
      blockReason = "Blocked by HR",
    } = body;

    const now = new Date();

    if (action === "BLOCK") {
      if (!cardId) {
        return NextResponse.json(
          { success: false, error: "Card ID is required to block a card." },
          { status: 400 }
        );
      }

      const card = await EmployeeCard.findById(cardId).populate("employee");
      if (!card) {
        return NextResponse.json(
          { success: false, error: "Card not found." },
          { status: 404 }
        );
      }

      const prevStatus = card.status;
      card.status =
        blockReason.toLowerCase().includes("lost") ? "REPLACED_LOST" : "BLOCKED";
      card.blockedAt = now;
      card.blockedBy = auth.user?.userId as any;
      card.blockedByName = auth.user?.username || "HR";
      card.blockReason = blockReason;
      await card.save();

      const empObj: any = card.employee;
      if (empObj?._id) {
        await Employee.updateOne(
          { _id: empObj._id, activeCardUid: card.cardUid },
          { $set: { activeCardUid: null } }
        );
      }

      await recordHRAuditLog({
        action: "CARD_BLOCKED",
        module: "HR_CARD",
        targetId: card.cardUid,
        targetLabel: `${empObj?.name || "Employee"} (${card.cardUid})`,
        valueBefore: { status: prevStatus },
        valueAfter: { status: card.status, blockedAt: now, blockReason },
        reason: blockReason,
        performedBy: auth.user?.userId,
        performedByName: auth.user?.username,
      });

      return NextResponse.json({
        success: true,
        message: `Card ${card.cardUid} has been blocked.`,
        data: card,
      });
    }

    // ISSUE or REPLACE card
    if (!employeeId) {
      return NextResponse.json(
        { success: false, error: "Employee ID is required." },
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

    // Generate unique unguessable cardUid
    let newCardUid = generateCardUid();
    while (await EmployeeCard.findOne({ cardUid: newCardUid })) {
      newCardUid = generateCardUid();
    }

    // Rule 1: Issuing a new card blocks all old active cards for this employee
    const oldActiveCards = await EmployeeCard.find({
      employee: employee._id,
      status: "ACTIVE",
    });

    const oldUids: string[] = [];
    for (const oldCard of oldActiveCards) {
      oldUids.push(oldCard.cardUid);
      oldCard.status =
        replacementReason === "LOST" ? "REPLACED_LOST" : "BLOCKED";
      oldCard.blockedAt = now;
      oldCard.blockedBy = auth.user?.userId as any;
      oldCard.blockedByName = auth.user?.username || "HR";
      oldCard.blockReason = `Auto-blocked due to new card issue (${replacementReason})`;
      oldCard.replacedByCardUid = newCardUid;
      await oldCard.save();
    }

    const newCard = await EmployeeCard.create({
      cardUid: newCardUid,
      employee: employee._id,
      status: "ACTIVE",
      issueDate: now,
      issuedBy: auth.user?.userId,
      issuedByName: auth.user?.username || "HR",
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      replacementReason:
        oldUids.length > 0 && replacementReason === "INITIAL"
          ? "OTHER"
          : replacementReason,
      replacementNotes: replacementNotes.trim(),
      replacementFee: Number(replacementFee) || 0,
      feeSettlementMode:
        Number(replacementFee) > 0 ? feeSettlementMode : "NONE",
    });

    employee.activeCardUid = newCardUid;
    await employee.save();

    await recordHRAuditLog({
      action: oldUids.length > 0 ? "CARD_REPLACED" : "CARD_ISSUED",
      module: "HR_CARD",
      targetId: newCardUid,
      targetLabel: `${employee.name} (${employee.employeeCode})`,
      valueBefore: { previousActiveCards: oldUids },
      valueAfter: {
        newCardUid,
        replacementReason: newCard.replacementReason,
        replacementFee: newCard.replacementFee,
        feeSettlementMode: newCard.feeSettlementMode,
      },
      reason:
        replacementNotes ||
        (oldUids.length > 0
          ? `Replaced card (${replacementReason})`
          : "Initial card issued"),
      performedBy: auth.user?.userId,
      performedByName: auth.user?.username,
    });

    return NextResponse.json(
      {
        success: true,
        message:
          oldUids.length > 0
            ? `Old card (${oldUids.join(", ")}) blocked and new card ${newCardUid} issued.`
            : `Card ${newCardUid} issued to ${employee.name}.`,
        data: newCard,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process card action." },
      { status: 500 }
    );
  }
}

