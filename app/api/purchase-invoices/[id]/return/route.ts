import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/lib/db";
import { PurchaseInvoice } from "@/models/PurchaseInvoice";
import { Product } from "@/models/Product";
import { Inventory } from "@/models/Inventory";
import { InventoryMovement } from "@/models/InventoryMovement";
import { SerialNumber } from "@/models/SerialNumber";
import { Location } from "@/models/Location";
import "@/models/Supplier";
import { verifyRole } from "@/lib/auth/rbac";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Branch"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { locationId, items, returnReason, notes } = body;

    const invoice = await PurchaseInvoice.findById(id)
      .populate("supplier", "name code contactPerson phone email")
      .populate("items.product", "name sku barcode condition model serialTracking")
      .lean();

    if (!invoice) {
      return NextResponse.json({ success: false, error: "Purchase Invoice not found." }, { status: 404 });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: "At least one return item is required." }, { status: 400 });
    }

    // Default location to primary location or first active location
    let targetLocation = null;
    if (locationId) {
      targetLocation = await Location.findById(locationId);
    }
    if (!targetLocation) {
      targetLocation = await Location.findOne({ active: true });
    }
    if (!targetLocation) {
      return NextResponse.json({ success: false, error: "No active location found for return." }, { status: 400 });
    }

    const session = await mongoose.startSession();
    try {
      session.startTransaction();
    } catch {
      session.endSession();
    }
    const isTxActive = session.inTransaction();

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const returnTxNumber = `PRETN-${dateStr}-${Math.floor(100 + Math.random() * 900)}`;

    let totalReturnedCost = 0;
    let totalReturnedQty = 0;
    const processedItems: any[] = [];

    for (const rItem of items) {
      const { productId, condition, quantity, serialNumbers } = rItem;
      const returnQty = Math.max(1, Number(quantity || 1));

      const origItem = invoice.items.find(
        (it: any) => it.product._id?.toString() === productId || it.product.toString() === productId
      );

      if (!origItem) continue;

      const unitCost = Number(origItem.unitCost || 0);
      const lineCost = unitCost * returnQty;
      totalReturnedCost += lineCost;
      totalReturnedQty += returnQty;

      const itemCondition = condition || origItem.condition || "New";

      // 1. Deduct Inventory Stock
      const invFilter = {
        product: origItem.product._id || origItem.product,
        location: targetLocation._id,
        condition: itemCondition,
      };

      const existingInv = await Inventory.findOne(invFilter);
      const beforeQty = existingInv ? existingInv.quantity : 0;
      const afterQty = Math.max(0, beforeQty - returnQty);

      const poolCost = existingInv?.averageCost || unitCost || 0;
      const newTotalCostValue = Math.round(afterQty * poolCost * 100) / 100;

      if (isTxActive) {
        await Inventory.findOneAndUpdate(
          invFilter,
          { $set: { quantity: afterQty, totalCostValue: newTotalCostValue, status: afterQty > 0 ? "In Stock" : "Out of Stock" } },
          { upsert: true, session }
        );
      } else {
        await Inventory.findOneAndUpdate(
          invFilter,
          { $set: { quantity: afterQty, totalCostValue: newTotalCostValue, status: afterQty > 0 ? "In Stock" : "Out of Stock" } },
          { upsert: true }
        );
      }

      // 2. HARD REMOVE / DELETE Serial Numbers from DB (Clean re-intake friendly!)
      const cleanSerials: string[] = Array.isArray(serialNumbers)
        ? serialNumbers.map((s: string) => s.trim()).filter(Boolean)
        : [];

      if (cleanSerials.length > 0) {
        if (isTxActive) {
          await SerialNumber.deleteMany({ serialNumber: { $in: cleanSerials } }, { session });
        } else {
          await SerialNumber.deleteMany({ serialNumber: { $in: cleanSerials } });
        }
      }

      // 3. Log Inventory Movement
      const movement = new InventoryMovement({
        product: origItem.product._id || origItem.product,
        productName: origItem.name,
        sku: origItem.sku,
        sourceLocation: targetLocation._id,
        sourceName: targetLocation.name,
        destinationName: (invoice.supplier as any)?.name || "Supplier",
        type: "STOCK_OUT",
        quantity: returnQty,
        serialNumbers: cleanSerials,
        unitCost,
        totalCost: lineCost,
        referenceType: "PURCHASE",
        referenceId: returnTxNumber,
        reason: returnReason || `Supplier Purchase Return against Invoice ${invoice.invoiceNumber}`,
        createdBy: auth.user?.username || "system",
        condition: itemCondition,
        date: new Date(),
        notes: notes?.trim() || `Returned to Supplier (${(invoice.supplier as any)?.name})`,
      });

      if (isTxActive) {
        await movement.save({ session });
      } else {
        await movement.save();
      }

      processedItems.push({
        productName: origItem.name,
        condition: itemCondition,
        quantity: returnQty,
        unitCost,
        lineTotal: lineCost,
        serialNumbers: cleanSerials,
        reason: returnReason || "Defective / Revert",
      });
    }

    if (isTxActive) {
      await session.commitTransaction();
      session.endSession();
    }

    const receiptData = {
      returnTxNumber,
      invoiceNumber: invoice.invoiceNumber,
      date: new Date(),
      locationName: targetLocation.name,
      processedBy: auth.user?.username || "system",
      supplierName: (invoice.supplier as any)?.name || "Supplier",
      supplierCode: (invoice.supplier as any)?.code || "SUP-VND",
      items: processedItems,
      totalReturnedQty,
      totalReturnedCost,
      returnReason: returnReason || "Vendor Return / Revert",
      notes: notes?.trim() || "",
    };

    return NextResponse.json({
      success: true,
      message: `Purchase return ${returnTxNumber} completed cleanly. Stock deducted and ${totalReturnedQty} unit(s) serials removed.`,
      data: {
        returnTxNumber,
        totalReturnedQty,
        totalReturnedCost,
        receiptData,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process purchase return." },
      { status: 500 }
    );
  }
}
