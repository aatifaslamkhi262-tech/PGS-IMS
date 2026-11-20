import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Sale } from "@/models/Sale";
import { Invoice } from "@/models/Invoice";
import { Payment } from "@/models/Payment";
import { SerialNumber } from "@/models/SerialNumber";
import { Inventory } from "@/models/Inventory";
import { InventoryMovement } from "@/models/InventoryMovement";
import { Location } from "@/models/Location";
import { recordCustomerLedgerEntry } from "@/lib/customerLedgerEngine";
import { recordCashMovement, findOrAutoOpenCashSession } from "@/lib/cashSessionEngine";
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

    // If completed, revert stock and serials back to the actual fulfilling branch(es)
    if (sale.status === "COMPLETED") {
      const invoice = await Invoice.findOne({ sale: sale._id });
      const refTx = invoice ? invoice.invoiceNumber : sale.saleNumber;

      const [allLocations, outboundMovements] = await Promise.all([
        Location.find().select("_id name").lean(),
        InventoryMovement.find({
          referenceTransaction: refTx,
          type: "TRANSFER",
        })
          .select("_id product condition quantity serialNumbers sourceLocation sourceName")
          .lean(),
      ]);

      const locationNameById = new Map<string, string>(
        (allLocations as any[]).map((loc) => [loc._id.toString(), loc.name])
      );
      const consumedMovementIds = new Set<string>();
      const { isValidCost } = await import("@/lib/costing");

      for (const item of sale.items) {
        const defaultLocId = (item as any).fulfillmentLocation
          ? (item as any).fulfillmentLocation.toString()
          : sale.location.toString();
        const defaultLocName =
          (item as any).fulfillmentLocationName ||
          locationNameById.get(defaultLocId) ||
          sale.locationName ||
          "Warehouse";

        const restoreGroupsMap = new Map<
          string,
          { locId: string; locName: string; qty: number; serials: string[] }
        >();

        if (item.serialNumbers && item.serialNumbers.length > 0) {
          for (const rawSn of item.serialNumbers) {
            const sn = rawSn.trim();
            const matchingMove = (outboundMovements as any[]).find(
              (m) =>
                m.product?.toString() === item.product.toString() &&
                Array.isArray(m.serialNumbers) &&
                m.serialNumbers.includes(sn) &&
                m.sourceLocation
            );
            const locId = matchingMove?.sourceLocation
              ? matchingMove.sourceLocation.toString()
              : defaultLocId;
            const locName =
              matchingMove?.sourceName ||
              locationNameById.get(locId) ||
              defaultLocName;

            const existingGroup = restoreGroupsMap.get(locId);
            if (existingGroup) {
              existingGroup.qty += 1;
              existingGroup.serials.push(rawSn);
            } else {
              restoreGroupsMap.set(locId, {
                locId,
                locName,
                qty: 1,
                serials: [rawSn],
              });
            }
          }
        } else {
          let locId = defaultLocId;
          let locName = defaultLocName;

          if (!(item as any).fulfillmentLocation) {
            const matchingMove = (outboundMovements as any[]).find(
              (m) =>
                !consumedMovementIds.has(m._id.toString()) &&
                m.product?.toString() === item.product.toString() &&
                m.condition === item.condition &&
                m.quantity === item.quantity &&
                m.sourceLocation
            );
            if (matchingMove?.sourceLocation) {
              consumedMovementIds.add(matchingMove._id.toString());
              locId = matchingMove.sourceLocation.toString();
              locName =
                matchingMove.sourceName ||
                locationNameById.get(locId) ||
                defaultLocName;
            }
          }

          restoreGroupsMap.set(locId, {
            locId,
            locName,
            qty: item.quantity,
            serials: [],
          });
        }

        for (const group of restoreGroupsMap.values()) {
          let inv = await Inventory.findOne({
            product: item.product,
            location: group.locId,
            condition: item.condition,
          });

          const beforeQty = inv ? inv.quantity : 0;

          // Resolve accurate unit cost to restore
          let restoredCost = 0;
          if (isValidCost(item.unitCost)) {
            restoredCost = item.unitCost;
          } else if (inv && isValidCost(inv.averageCost)) {
            restoredCost = inv.averageCost;
          } else {
            const { Product } = await import("@/models/Product");
            const prodDoc = await Product.findById(item.product);
            if (prodDoc && isValidCost(prodDoc.costPrice)) {
              restoredCost = prodDoc.costPrice;
            }
          }

          if (!inv) {
            inv = new Inventory({
              product: item.product,
              location: group.locId,
              condition: item.condition,
              quantity: group.qty,
              averageCost: restoredCost,
              totalCostValue: Math.round(group.qty * restoredCost * 100) / 100,
              status: "In Stock",
            });
          } else {
            inv.quantity += group.qty;
            if (!isValidCost(inv.averageCost) && restoredCost > 0) {
              inv.averageCost = restoredCost;
            }
            const effCost =
              inv.averageCost && isValidCost(inv.averageCost)
                ? inv.averageCost
                : restoredCost;
            inv.totalCostValue = Math.round(inv.quantity * effCost * 100) / 100;
            inv.status = inv.quantity > 0 ? "In Stock" : "Out of Stock";
          }
          await inv.save();

          if (group.serials.length > 0) {
            for (const sn of group.serials) {
              const serialDoc = await SerialNumber.findOne({
                product: item.product,
                serialNumber: sn,
              });
              if (serialDoc) {
                serialDoc.status = "Available";
                serialDoc.location = group.locName;
                serialDoc.transactionReference = refTx;
                await serialDoc.save();
              }
            }
          }

          await InventoryMovement.create({
            product: item.product,
            quantity: group.qty,
            unitCost: restoredCost,
            totalCost: Math.round(group.qty * restoredCost * 100) / 100,
            serialNumbers: group.serials,
            sourceLocation: group.locId,
            sourceName: sale.customerName || "Customer",
            destinationLocation: group.locId,
            destinationName: group.locName,
            type: "TRANSFER",
            referenceTransaction: refTx,
            beforeQuantity: beforeQty,
            afterQuantity: inv.quantity,
            performedBy: auth.user.username,
            condition: item.condition,
            date: new Date(),
            notes: `Sale Cancelled: Reverted stock to ${group.locName}`,
          });
        }
      }

      if (invoice) {
        invoice.status = "CANCELLED";
        await invoice.save();
      }

      const allPaidPayments = await Payment.find({ sale: sale._id, status: "PAID" });
      const totalCashPaid = allPaidPayments
        .filter((p) => p.paymentMethod === "CASH")
        .reduce((sum, p) => sum + p.amount, 0);
      const totalOnlinePaid = allPaidPayments
        .filter((p) => p.paymentMethod === "BANK_TRANSFER" || p.paymentMethod === "ONLINE_GATEWAY")
        .reduce((sum, p) => sum + p.amount, 0);
      const totalRefundedAmount =
        allPaidPayments.length > 0
          ? allPaidPayments.reduce((sum, p) => sum + p.amount, 0)
          : sale.totalPaid !== undefined && sale.totalPaid !== null
          ? Number(sale.totalPaid)
          : sale.isAccrued
          ? 0
          : Number(sale.totalAmount || 0);

      await Payment.updateMany({ sale: sale._id }, { status: "REFUNDED" });

      if (totalCashPaid > 0 || totalOnlinePaid > 0) {
        const activeCashSession = await findOrAutoOpenCashSession(
          sale.location.toString(),
          auth.user.username
        );
        if (activeCashSession) {
          if (totalCashPaid > 0) {
            await recordCashMovement({
              sessionId: activeCashSession._id.toString(),
              locationId: sale.location.toString(),
              cashier: auth.user.username,
              type: "CASH_REFUND",
              amount: totalCashPaid,
              direction: "OUT",
              paymentMethod: "CASH",
              referenceType: "Sale",
              referenceId: refTx,
              notes: `Cash refund for cancelled sale ${sale.saleNumber}`,
            });
          }
          if (totalOnlinePaid > 0) {
            await recordCashMovement({
              sessionId: activeCashSession._id.toString(),
              locationId: sale.location.toString(),
              cashier: auth.user.username,
              type: "CASH_REFUND",
              amount: totalOnlinePaid,
              direction: "OUT",
              paymentMethod: "BANK_TRANSFER",
              referenceType: "Sale",
              referenceId: refTx,
              notes: `Online refund for cancelled sale ${sale.saleNumber}`,
            });
          }
        }
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

        if (totalRefundedAmount > 0) {
          await recordCustomerLedgerEntry({
            customerId: sale.customer.toString(),
            type: "ADVANCE_REFUND",
            amount: totalRefundedAmount,
            referenceType: "Refund",
            referenceId: refTx,
            notes: `Refund payout reversal for cancelled sale ${sale.saleNumber}`,
            createdBy: auth.user.username,
          });
        }
      }
    } else {
      // For non-COMPLETED sales (e.g. PAYMENT_PENDING / CHECKOUT / DRAFT advance bookings)
      // 1. Unreserve ONLY serial numbers that are actually Reserved (never revert already-Sold serials,
      // and preserve each serial's existing physical branch location)
      for (const item of sale.items) {
        if (item.serialNumbers && item.serialNumbers.length > 0) {
          await SerialNumber.updateMany(
            {
              product: item.product,
              serialNumber: { $in: item.serialNumbers },
              status: "Reserved",
            },
            { $set: { status: "Available" } }
          );
        }
      }

      // 2. Process payments recorded
      const allPaidPayments = await Payment.find({ sale: sale._id, status: "PAID" });
      const totalPaidSum = allPaidPayments.reduce((sum, p) => sum + Number(p.amount), 0);
      const cashPayments = allPaidPayments.filter((p) => p.paymentMethod === "CASH");
      const totalCashPaid = cashPayments.reduce((sum, p) => sum + Number(p.amount), 0);
      const totalOnlinePaid = allPaidPayments
        .filter((p) => p.paymentMethod === "BANK_TRANSFER" || p.paymentMethod === "ONLINE_GATEWAY")
        .reduce((sum, p) => sum + Number(p.amount), 0);

      if (forfeitAdvance) {
        // Mark payments as FORFEITED (non-refundable deposit retained by store)
        await Payment.updateMany({ sale: sale._id }, { status: "FORFEITED" });
      } else {
        await Payment.updateMany({ sale: sale._id }, { status: "REFUNDED" });

        if (totalCashPaid > 0 || totalOnlinePaid > 0) {
          const activeCashSession = await findOrAutoOpenCashSession(
            sale.location.toString(),
            auth.user.username
          );
          if (activeCashSession) {
            if (totalCashPaid > 0) {
              await recordCashMovement({
                sessionId: activeCashSession._id.toString(),
                locationId: sale.location.toString(),
                cashier: auth.user.username,
                type: "CASH_REFUND",
                amount: totalCashPaid,
                direction: "OUT",
                paymentMethod: "CASH",
                referenceType: "Sale",
                referenceId: sale.saleNumber,
                notes: `Cash refund for cancelled advance/pending sale ${sale.saleNumber}`,
              });
            }
            if (totalOnlinePaid > 0) {
              await recordCashMovement({
                sessionId: activeCashSession._id.toString(),
                locationId: sale.location.toString(),
                cashier: auth.user.username,
                type: "CASH_REFUND",
                amount: totalOnlinePaid,
                direction: "OUT",
                paymentMethod: "BANK_TRANSFER",
                referenceType: "Sale",
                referenceId: sale.saleNumber,
                notes: `Online refund for cancelled advance/pending sale ${sale.saleNumber}`,
              });
            }
          }
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
    const { salesmanId, locationId, action, isAccrued } = body;

    const sale = await Sale.findById(id);
    if (!sale) {
      return NextResponse.json({ success: false, error: "Sale not found." }, { status: 404 });
    }

    if (locationId) {
      if (sale.status === "COMPLETED") {
        return NextResponse.json({ success: false, error: "Cannot reassign fulfilling location on a completed sale." }, { status: 400 });
      }
      const LocationModule = (await import("@/models/Location")).Location;
      const targetLoc = await LocationModule.findById(locationId).lean();
      if (!targetLoc) {
        return NextResponse.json({ success: false, error: "Target location not found." }, { status: 400 });
      }
      sale.location = targetLoc._id as any;
      sale.locationName = targetLoc.name;
      await sale.save();

      return NextResponse.json({
        success: true,
        message: `Fulfilling location updated to '${targetLoc.name}' successfully.`,
        data: sale,
      });
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
      // Preserve special sources like ADVANCE_BOOKING / WEBSITE / EXCHANGE
      if (!sale.saleSource || sale.saleSource === "DIRECT_COUNTER") {
        sale.saleSource = "SALESMAN";
      }
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
      if (!sale.saleSource || sale.saleSource === "SALESMAN") {
        sale.saleSource = "DIRECT_COUNTER";
      }
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
