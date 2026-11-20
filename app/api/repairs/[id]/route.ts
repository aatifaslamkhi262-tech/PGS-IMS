import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { verifyRole } from "@/lib/auth/rbac";
import { Repair } from "@/models/Repair";
import { Payment } from "@/models/Payment";
import { recordCustomerLedgerEntry } from "@/lib/customerLedgerEngine";
import { nextSequentialPaymentNumber } from "@/lib/salesEngine";
import { findOrAutoOpenCashSession, recordCashMovement } from "@/lib/cashSessionEngine";

async function recordRepairCollections(params: {
  repair: any;
  allocations: Array<{ method: string; amount: number; referenceNumber?: string }>;
  actorUsername: string;
  notesPrefix: string;
}) {
  const { repair, allocations, actorUsername, notesPrefix } = params;
  const totalCollected = allocations.reduce((s, a) => s + a.amount, 0);
  if (totalCollected <= 0) return;

  repair.paidAmount += totalCollected;
  const summaryMethod =
    allocations.length > 1 ? "SPLIT" : allocations[0]?.method || "CASH";

  if (repair.customer) {
    await recordCustomerLedgerEntry({
      customerId: repair.customer,
      type: "PAYMENT",
      amount: totalCollected,
      referenceType: "Repair",
      referenceId: repair.repairNumber,
      notes: `${notesPrefix} (${repair.repairNumber}) via ${summaryMethod}`,
      createdBy: actorUsername,
    });
  }

  const usedPaymentNums = new Set<string>();
  for (const alloc of allocations) {
    const paymentNumber = await nextSequentialPaymentNumber(usedPaymentNums);
    const payment = new Payment({
      paymentNumber,
      customer: repair.customer,
      location: repair.location,
      paymentMethod: alloc.method,
      amount: alloc.amount,
      referenceNumber: alloc.referenceNumber,
      notes: `${notesPrefix} ${repair.repairNumber} - ${repair.productName}`,
      receivedBy: actorUsername,
      status: "PAID",
    });
    await payment.save();
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Salesman", "Branch"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const repair = await Repair.findById(id).populate("customer").populate("location").lean();

    if (!repair) {
      return NextResponse.json({ success: false, error: "Repair record not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: repair });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch repair details." },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Salesman", "Branch"]);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error || "Unauthorized" }, { status: auth.status || 401 });
    }

    const { id } = await params;
    const repair = await Repair.findById(id);

    if (!repair) {
      return NextResponse.json({ success: false, error: "Repair record not found." }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const { action, collectAmount, paymentMethod = "CASH", paymentAllocations, status } = body;

    const sanitizeAllocations = (fallbackAmount: number, fallbackMethod: string) => {
      if (Array.isArray(paymentAllocations) && paymentAllocations.length > 0) {
        return paymentAllocations
          .filter((a: any) => Number(a?.amount || 0) > 0)
          .map((a: any) => ({
            method: String(a.method || "CASH"),
            amount: Number(a.amount || 0),
            referenceNumber: a.referenceNumber ? String(a.referenceNumber) : undefined,
          }));
      }
      return fallbackAmount > 0
        ? [{ method: fallbackMethod || "CASH", amount: fallbackAmount, referenceNumber: undefined }]
        : [];
    };

    // Action 1: Collect Remaining Balance & Settlement Adjustment
    if (action === "COLLECT_BALANCE") {
      const adjustment = Number(body.adjustment || 0); // Negative = Discount/Waiver, Positive = Extra Charge/Surcharge
      const adjustmentReason = String(body.adjustmentReason || "").trim();
      const rawCollect = Math.max(0, Number(collectAmount !== undefined ? collectAmount : repair.balanceDue));
      const collectAllocs = sanitizeAllocations(rawCollect, paymentMethod);
      const amountToCollect = collectAllocs.reduce((s, a) => s + a.amount, 0);

      if (amountToCollect <= 0 && adjustment === 0) {
        return NextResponse.json(
          { success: false, error: "Please enter an amount to collect or a settlement adjustment." },
          { status: 400 }
        );
      }

      // 1. Process Settlement Adjustment (if any)
      if (adjustment !== 0) {
        repair.totalAmount = Math.max(0, repair.totalAmount + adjustment);
        repair.adjustmentAmount = (repair.adjustmentAmount || 0) + adjustment;
        if (adjustmentReason) {
          repair.adjustmentReason = repair.adjustmentReason
            ? `${repair.adjustmentReason} | ${adjustmentReason}`
            : adjustmentReason;
        }

        // Ledger record for adjustment (if customer linked)
        if (repair.customer) {
          if (adjustment < 0) {
            await recordCustomerLedgerEntry({
              customerId: repair.customer,
              type: "PAYMENT",
              amount: Math.abs(adjustment),
              referenceType: "Repair",
              referenceId: repair.repairNumber,
              notes: `Settlement Discount / Rounding Waiver of Rs. ${Math.abs(adjustment).toLocaleString()} for Repair ${repair.repairNumber}${adjustmentReason ? ` (${adjustmentReason})` : ""}`,
              createdBy: auth.user.username,
            });
          } else {
            await recordCustomerLedgerEntry({
              customerId: repair.customer,
              type: "INVOICE",
              amount: adjustment,
              referenceType: "Repair",
              referenceId: repair.repairNumber,
              notes: `Extra Service / Surcharge of Rs. ${adjustment.toLocaleString()} for Repair ${repair.repairNumber}${adjustmentReason ? ` (${adjustmentReason})` : ""}`,
              createdBy: auth.user.username,
            });
          }
        }
      }

      // 2. Process Collected Payment (Single or Split)
      if (amountToCollect > 0) {
        await recordRepairCollections({
          repair,
          allocations: collectAllocs,
          actorUsername: auth.user.username,
          notesPrefix: `Repair Balance Collection${adjustment !== 0 ? ` (Adj: ${adjustment > 0 ? `+Rs. ${adjustment}` : `-Rs. ${Math.abs(adjustment)}`})` : ""}`,
        });
      }

      // Recalculate balance due
      repair.balanceDue = Math.max(0, repair.totalAmount - repair.paidAmount);
      if (repair.balanceDue === 0) {
        repair.status = "DELIVERED";
      }
      await repair.save();

      return NextResponse.json({
        success: true,
        message: `Successfully collected Rs. ${amountToCollect.toLocaleString()} for Repair ${repair.repairNumber}${adjustment !== 0 ? ` (Adjustment: ${adjustment > 0 ? `+Rs. ${adjustment}` : `-Rs. ${Math.abs(adjustment)}`})` : ""}.`,
        data: repair,
      });
    }

    // Action 2: Unified Edit Repair Bill, Details & Settlement/Collection
    if (action === "EDIT_REPAIR") {
      const {
        customerName,
        customerPhone,
        productName,
        serialNumber,
        faultReason,
        repairedBy,
        status: newStatus,
        totalAmount,
        repairCost,
        adjustment = 0,
        adjustmentReason = "",
        collectAmount = 0,
        paymentMethod = "CASH",
        notes,
      } = body;

      if (customerName) repair.customerName = customerName.trim();
      if (customerPhone) repair.customerPhone = customerPhone.trim();
      if (productName) repair.productName = productName.trim();
      if (serialNumber !== undefined) repair.serialNumber = serialNumber.trim();
      if (faultReason) repair.faultReason = faultReason.trim();
      if (repairedBy) repair.repairedBy = repairedBy.trim();
      if (notes !== undefined) repair.notes = notes.trim();

      // 1. Update bill amount if edited
      const oldTotal = repair.totalAmount;
      if (totalAmount !== undefined && totalAmount !== null) {
        repair.totalAmount = Math.max(0, Number(totalAmount));
      }
      if (repairCost !== undefined && repairCost !== null) {
        repair.repairCost = Math.max(0, Number(repairCost));
      }

      // Customer Ledger adjustment if totalAmount was explicitly corrected
      if (repair.customer && totalAmount !== undefined && repair.totalAmount !== oldTotal) {
        const diff = repair.totalAmount - oldTotal;
        if (diff > 0) {
          await recordCustomerLedgerEntry({
            customerId: repair.customer,
            type: "INVOICE",
            amount: diff,
            referenceType: "Repair",
            referenceId: repair.repairNumber,
            notes: `Bill correction increase for Repair ${repair.repairNumber}`,
            createdBy: auth.user.username,
          });
        } else if (diff < 0) {
          await recordCustomerLedgerEntry({
            customerId: repair.customer,
            type: "PAYMENT",
            amount: Math.abs(diff),
            referenceType: "Repair",
            referenceId: repair.repairNumber,
            notes: `Bill correction decrease for Repair ${repair.repairNumber}`,
            createdBy: auth.user.username,
          });
        }
      }

      // 2. Process Settlement Adjustment (± PKR)
      const numAdjustment = Number(adjustment || 0);
      if (numAdjustment !== 0) {
        repair.totalAmount = Math.max(0, repair.totalAmount + numAdjustment);
        repair.adjustmentAmount = (repair.adjustmentAmount || 0) + numAdjustment;
        if (adjustmentReason) {
          repair.adjustmentReason = repair.adjustmentReason
            ? `${repair.adjustmentReason} | ${adjustmentReason.trim()}`
            : adjustmentReason.trim();
        }

        if (repair.customer) {
          if (numAdjustment < 0) {
            await recordCustomerLedgerEntry({
              customerId: repair.customer,
              type: "PAYMENT",
              amount: Math.abs(numAdjustment),
              referenceType: "Repair",
              referenceId: repair.repairNumber,
              notes: `Settlement Discount / Rounding Waiver of Rs. ${Math.abs(numAdjustment).toLocaleString()} for Repair ${repair.repairNumber}${adjustmentReason ? ` (${adjustmentReason})` : ""}`,
              createdBy: auth.user.username,
            });
          } else {
            await recordCustomerLedgerEntry({
              customerId: repair.customer,
              type: "INVOICE",
              amount: numAdjustment,
              referenceType: "Repair",
              referenceId: repair.repairNumber,
              notes: `Extra Service / Surcharge of Rs. ${numAdjustment.toLocaleString()} for Repair ${repair.repairNumber}${adjustmentReason ? ` (${adjustmentReason})` : ""}`,
              createdBy: auth.user.username,
            });
          }
        }
      }

      // 3. Process Payment Refund (if paidAmount was reduced) or Immediate Collection
      const oldPaid = Number(repair.paidAmount || 0);
      const requestedPaid =
        body.paidAmount !== undefined && body.paidAmount !== null
          ? Math.max(0, Number(body.paidAmount))
          : oldPaid;

      if (requestedPaid < oldPaid) {
        const refundDiff = Math.round((oldPaid - requestedPaid) * 100) / 100;
        const refundMethod = String(body.refundPaymentMethod || paymentMethod || "CASH");
        repair.paidAmount = requestedPaid;

        if (repair.customer) {
          await recordCustomerLedgerEntry({
            customerId: repair.customer,
            type: "ADVANCE_REFUND",
            amount: refundDiff,
            referenceType: "Refund",
            referenceId: repair.repairNumber,
            notes: `Repair payment refund / edit adjustment for ${repair.repairNumber} via ${refundMethod}`,
            createdBy: auth.user.username,
          });
        }

        const activeCashSession = await findOrAutoOpenCashSession(
          repair.location.toString(),
          auth.user.username
        );
        if (activeCashSession) {
          await recordCashMovement({
            sessionId: activeCashSession._id.toString(),
            locationId: repair.location.toString(),
            cashier: auth.user.username,
            type: "CASH_REFUND",
            amount: refundDiff,
            direction: "OUT",
            paymentMethod: refundMethod,
            referenceType: "Return",
            referenceId: repair.repairNumber,
            notes: `Repair Refund (${repair.repairNumber} - ${repair.productName}) [${refundMethod}]`,
          });
        }
      }

      const collectAllocs = sanitizeAllocations(Math.max(0, Number(collectAmount || 0)), paymentMethod);
      const numCollect = collectAllocs.reduce((s, a) => s + a.amount, 0);
      if (numCollect > 0) {
        await recordRepairCollections({
          repair,
          allocations: collectAllocs,
          actorUsername: auth.user.username,
          notesPrefix: `Repair Collection${numAdjustment !== 0 ? ` (Adj: ${numAdjustment > 0 ? `+Rs. ${numAdjustment}` : `-Rs. ${Math.abs(numAdjustment)}`})` : ""}`,
        });
      }

      // 4. Update Status and Balance Due
      repair.balanceDue = Math.max(0, repair.totalAmount - repair.paidAmount);
      if (newStatus) {
        repair.status = newStatus;
      } else if (repair.balanceDue === 0 && numCollect > 0) {
        repair.status = "DELIVERED";
      }

      await repair.save();

      return NextResponse.json({
        success: true,
        message: `Repair ${repair.repairNumber} updated successfully.`,
        data: repair,
      });
    }

    // Action 3: Status update
    if (status) {
      repair.status = status;
      await repair.save();
      return NextResponse.json({
        success: true,
        message: `Repair status updated to ${status}.`,
        data: repair,
      });
    }

    return NextResponse.json({ success: false, error: "No valid action specified." }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update repair." },
      { status: 500 }
    );
  }
}
