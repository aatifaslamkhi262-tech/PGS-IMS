import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Sale } from "@/models/Sale";
import { Invoice } from "@/models/Invoice";
import { Payment } from "@/models/Payment";
import { SerialNumber } from "@/models/SerialNumber";
import { Inventory } from "@/models/Inventory";
import { InventoryMovement } from "@/models/InventoryMovement";
import { recordCustomerLedgerEntry } from "@/lib/customerLedgerEngine";
import { recordCashMovement } from "@/lib/cashSessionEngine";
import { CashSession } from "@/models/CashSession";
import { verifyRole } from "@/lib/auth/rbac";

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
    const sale = await Sale.findById(id)
      .populate("location", "name")
      .populate("salesman", "name username")
      .populate("customer", "name phone email address")
      .lean();

    if (!sale) {
      return NextResponse.json({ success: false, error: "Sale not found." }, { status: 404 });
    }

    const invoice = await Invoice.findOne({ sale: sale._id }).lean();
    const payments = await Payment.find({ sale: sale._id }).lean();

    return NextResponse.json({
      success: true,
      data: {
        ...sale,
        invoice,
        payments,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch sale details." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant"]);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const sale = await Sale.findById(id);
    if (!sale) {
      return NextResponse.json({ success: false, error: "Sale not found." }, { status: 404 });
    }

    if (sale.status === "CANCELLED") {
      return NextResponse.json({ success: true, message: "Sale is already cancelled.", data: sale });
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const forfeitAdvance = Boolean(body.forfeitAdvance);
    const cancellationReason = body.cancellationReason?.trim() || "Cancelled by user";

    // If completed, revert stock and serials
    if (sale.status === "COMPLETED") {
      const invoice = await Invoice.findOne({ sale: sale._id });
      const refTx = invoice ? invoice.invoiceNumber : sale.saleNumber;

      for (const item of sale.items) {
        let inv = await Inventory.findOne({
          product: item.product,
          location: sale.location,
          condition: item.condition,
        });

        const beforeQty = inv ? inv.quantity : 0;
        if (!inv) {
          inv = new Inventory({
            product: item.product,
            location: sale.location,
            condition: item.condition,
            quantity: item.quantity,
            status: "In Stock",
          });
        } else {
          inv.quantity += item.quantity;
          inv.status = inv.quantity > 0 ? "In Stock" : "Out of Stock";
        }
        await inv.save();

        if (item.serialNumbers && item.serialNumbers.length > 0) {
          for (const sn of item.serialNumbers) {
            const serialDoc = await SerialNumber.findOne({
              product: item.product,
              serialNumber: sn,
            });
            if (serialDoc) {
              serialDoc.status = "Available";
              serialDoc.location = sale.locationName;
              serialDoc.transactionReference = refTx;
              await serialDoc.save();
            }
          }
        }

        await InventoryMovement.create({
          product: item.product,
          quantity: item.quantity,
          serialNumbers: item.serialNumbers || [],
          sourceLocation: sale.location,
          sourceName: sale.customerName || "Customer",
          destinationLocation: sale.location,
          destinationName: sale.locationName,
          type: "TRANSFER",
          referenceTransaction: refTx,
          beforeQuantity: beforeQty,
          afterQuantity: inv.quantity,
          performedBy: auth.user.username,
          condition: item.condition,
          date: new Date(),
          notes: `Sale Cancelled: Reverted stock to ${sale.locationName}`,
        });
      }

      if (invoice) {
        invoice.status = "CANCELLED";
        await invoice.save();
      }

      const cashPayments = await Payment.find({ sale: sale._id, paymentMethod: "CASH", status: "PAID" });
      const totalCashPaid = cashPayments.reduce((sum, p) => sum + p.amount, 0);

      await Payment.updateMany({ sale: sale._id }, { status: "REFUNDED" });

      const activeCashSession = await CashSession.findOne({
        location: sale.location,
        cashier: auth.user.username,
        status: "OPEN",
      });

      if (activeCashSession && totalCashPaid > 0) {
        await recordCashMovement({
          sessionId: activeCashSession._id.toString(),
          locationId: sale.location.toString(),
          cashier: auth.user.username,
          type: "CASH_REFUND",
          amount: totalCashPaid,
          direction: "OUT",
          referenceType: "Sale",
          referenceId: refTx,
          notes: `Cash refund for cancelled sale ${sale.saleNumber}`,
        });
      }

      if (sale.customer) {
        await recordCustomerLedgerEntry({
          customerId: sale.customer.toString(),
          type: "RETURN_CREDIT",
          amount: sale.totalAmount,
          referenceType: "Return",
          referenceId: refTx,
          notes: `Credit reversal for cancelled sale ${sale.saleNumber}`,
          createdBy: auth.user.username,
        });
      }
    } else {
      // For non-COMPLETED sales (e.g. PAYMENT_PENDING / CHECKOUT / DRAFT advance bookings)
      // 1. Unreserve any serial numbers marked Reserved/Available
      for (const item of sale.items) {
        if (item.serialNumbers && item.serialNumbers.length > 0) {
          await SerialNumber.updateMany(
            { serialNumber: { $in: item.serialNumbers } },
            { $set: { status: "Available", location: sale.locationName || "Warehouse" } }
          );
        }
      }

      // 2. Process payments recorded
      const allPaidPayments = await Payment.find({ sale: sale._id, status: "PAID" });
      const totalPaidSum = allPaidPayments.reduce((sum, p) => sum + Number(p.amount), 0);
      const cashPayments = allPaidPayments.filter((p) => p.paymentMethod === "CASH");
      const totalCashPaid = cashPayments.reduce((sum, p) => sum + Number(p.amount), 0);

      if (forfeitAdvance) {
        // Mark payments as FORFEITED (non-refundable deposit retained by store)
        await Payment.updateMany({ sale: sale._id }, { status: "FORFEITED" });
      } else {
        await Payment.updateMany({ sale: sale._id }, { status: "REFUNDED" });

        const activeCashSession = await CashSession.findOne({
          location: sale.location,
          cashier: auth.user.username,
          status: "OPEN",
        });

        if (activeCashSession && totalCashPaid > 0) {
          await recordCashMovement({
            sessionId: activeCashSession._id.toString(),
            locationId: sale.location.toString(),
            cashier: auth.user.username,
            type: "CASH_REFUND",
            amount: totalCashPaid,
            direction: "OUT",
            referenceType: "Sale",
            referenceId: sale.saleNumber,
            notes: `Cash refund for cancelled advance/pending sale ${sale.saleNumber}`,
          });
        }
      }

      if (sale.customer && totalPaidSum > 0) {
        await recordCustomerLedgerEntry({
          customerId: sale.customer.toString(),
          type: "ADVANCE_REFUND",
          amount: totalPaidSum,
          referenceType: "AdvanceBooking",
          referenceId: sale.saleNumber,
          notes: forfeitAdvance
            ? `Advance deposit forfeited (Non-refundable cancellation): ${cancellationReason}`
            : `Advance deposit refund for cancelled booking ${sale.saleNumber}`,
          createdBy: auth.user.username,
        });
      }
    }

    sale.status = "CANCELLED";
    sale.cancelledAt = new Date();
    sale.cancellationReason = cancellationReason;
    await sale.save();

    return NextResponse.json({
      success: true,
      message: forfeitAdvance
        ? "Sale cancelled and advance deposit forfeited as store income successfully."
        : "Sale cancelled, serials unreserved, and customer advance ledger updated successfully.",
      data: sale,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to cancel sale." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant"]);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const body = await req.json();
    const { salesmanId, action, isAccrued } = body;

    const sale = await Sale.findById(id);
    if (!sale) {
      return NextResponse.json({ success: false, error: "Sale not found." }, { status: 404 });
    }

    if (action === "TOGGLE_ACCRUED" || isAccrued !== undefined) {
      const newAccruedState = isAccrued !== undefined ? Boolean(isAccrued) : !sale.isAccrued;
      sale.isAccrued = newAccruedState;
      sale.accruedMarkedBy = auth.user.username;
      sale.accruedMarkedAt = new Date();
      await sale.save();

      return NextResponse.json({
        success: true,
        message: newAccruedState
          ? `Sale ${sale.saleNumber} marked as Accrued Sale.`
          : `Sale ${sale.saleNumber} unmarked from Accrued Sale (Realized).`,
        data: sale,
      });
    }

    if (salesmanId) {
      const UserModule = (await import("@/models/User")).User;
      const salesmanUser = await UserModule.findById(salesmanId).lean();
      if (!salesmanUser) {
        return NextResponse.json({ success: false, error: "Selected salesman not found." }, { status: 400 });
      }

      sale.salesman = salesmanUser._id as any;
      sale.salesmanName = (salesmanUser as any).name;
      sale.saleSource = "SALESMAN";
      await sale.save();

      // Update associated invoice if present
      await Invoice.updateOne(
        { sale: sale._id },
        { $set: { salesmanName: (salesmanUser as any).name } }
      );

      return NextResponse.json({
        success: true,
        message: `Sale attribution updated to salesman '${(salesmanUser as any).name}'`,
        data: sale,
      });
    } else {
      // Revert to Direct Counter
      sale.salesman = undefined;
      sale.salesmanName = undefined;
      sale.saleSource = "DIRECT_COUNTER";
      await sale.save();

      await Invoice.updateOne(
        { sale: sale._id },
        { $unset: { salesmanName: 1 } }
      );

      return NextResponse.json({
        success: true,
        message: "Sale attribution updated to Direct Counter / Self.",
        data: sale,
      });
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update sale attribution." },
      { status: 500 }
    );
  }
}
