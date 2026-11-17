import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { verifyRole } from "@/lib/auth/rbac";
import { Repair } from "@/models/Repair";
import { Payment } from "@/models/Payment";
import { recordCustomerLedgerEntry } from "@/lib/customerLedgerEngine";
import { generatePaymentNumber } from "@/lib/salesEngine";

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
    const { action, collectAmount, paymentMethod = "CASH", status } = body;

    // Action 1: Collect Remaining Balance & Settlement Adjustment
    if (action === "COLLECT_BALANCE") {
      const adjustment = Number(body.adjustment || 0); // Negative = Discount/Waiver, Positive = Extra Charge/Surcharge
      const adjustmentReason = String(body.adjustmentReason || "").trim();
      const amountToCollect = Math.max(0, Number(collectAmount !== undefined ? collectAmount : repair.balanceDue));

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
            // Discount / Settlement Waiver
            await recordCustomerLedgerEntry({
              customerId: repair.customer,
              type: "PAYMENT", // credits customer to offset discount
              amount: Math.abs(adjustment),
              referenceType: "Repair",
              referenceId: repair.repairNumber,
              notes: `Settlement Discount / Rounding Waiver of Rs. ${Math.abs(adjustment).toLocaleString()} for Repair ${repair.repairNumber}${adjustmentReason ? ` (${adjustmentReason})` : ""}`,
              createdBy: auth.user.username,
            });
          } else {
            // Surcharge / Extra Charges
            await recordCustomerLedgerEntry({
              customerId: repair.customer,
              type: "INVOICE", // debits customer for additional charge
              amount: adjustment,
              referenceType: "Repair",
              referenceId: repair.repairNumber,
              notes: `Extra Service / Surcharge of Rs. ${adjustment.toLocaleString()} for Repair ${repair.repairNumber}${adjustmentReason ? ` (${adjustmentReason})` : ""}`,
              createdBy: auth.user.username,
            });
          }
        }
      }

      // 2. Process Collected Payment (Cash/Card into Cash Drawer)
      if (amountToCollect > 0) {
        repair.paidAmount += amountToCollect;

        // Record in Customer Ledger
        if (repair.customer) {
          await recordCustomerLedgerEntry({
            customerId: repair.customer,
            type: "PAYMENT",
            amount: amountToCollect,
            referenceType: "Repair",
            referenceId: repair.repairNumber,
            notes: `Remaining balance collection for Repair ${repair.repairNumber} via ${paymentMethod}`,
            createdBy: auth.user.username,
          });
        }

        // Record in Payment for Cash Register / Daily Closing
        const paymentNumber = await generatePaymentNumber();
        const payment = new Payment({
          paymentNumber,
          customer: repair.customer,
          location: repair.location,
          paymentMethod,
          amount: amountToCollect,
          notes: `Repair Balance Collection ${repair.repairNumber} - ${repair.productName}${adjustment !== 0 ? ` (Adj: ${adjustment > 0 ? `+Rs. ${adjustment}` : `-Rs. ${Math.abs(adjustment)}`})` : ""}`,
          receivedBy: auth.user.username,
          status: "PAID",
        });
        await payment.save();
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

      // 3. Process Immediate Payment Collection (if any)
      const numCollect = Math.max(0, Number(collectAmount || 0));
      if (numCollect > 0) {
        repair.paidAmount += numCollect;

        if (repair.customer) {
          await recordCustomerLedgerEntry({
            customerId: repair.customer,
            type: "PAYMENT",
            amount: numCollect,
            referenceType: "Repair",
            referenceId: repair.repairNumber,
            notes: `Payment collection for Repair ${repair.repairNumber} via ${paymentMethod}`,
            createdBy: auth.user.username,
          });
        }

        const paymentNumber = await generatePaymentNumber();
        const payment = new Payment({
          paymentNumber,
          customer: repair.customer,
          location: repair.location,
          paymentMethod,
          amount: numCollect,
          notes: `Repair Collection ${repair.repairNumber} - ${repair.productName}${numAdjustment !== 0 ? ` (Adj: ${numAdjustment > 0 ? `+Rs. ${numAdjustment}` : `-Rs. ${Math.abs(numAdjustment)}`})` : ""}`,
          receivedBy: auth.user.username,
          status: "PAID",
        });
        await payment.save();
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
