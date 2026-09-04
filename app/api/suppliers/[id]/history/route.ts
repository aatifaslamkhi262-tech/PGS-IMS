import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Supplier } from "@/models/Supplier";
import { PurchaseInvoice } from "@/models/PurchaseInvoice";
import { PurchaseReceiving } from "@/models/PurchaseReceiving";
import { verifyRole } from "@/lib/auth/rbac";
import mongoose from "mongoose";

/**
 * GET /api/suppliers/[id]/history
 *
 * Returns purchase invoice and product purchase history for a given supplier.
 *
 * RBAC (enforced server-side — never trust client headers):
 *   Admin / Warehouse / Accountant → full data including purchase costs
 *   Branch                         → invoice list + items, but unitCost/amount stripped
 *   Salesman                       → 403 Forbidden
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();

    // Salesman is explicitly excluded — supplier purchase history is restricted
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Branch"]);
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    const { id } = await params;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: "Invalid supplier ID." },
        { status: 400 }
      );
    }

    // 404 if supplier does not exist
    const supplier = await Supplier.findById(id).lean();
    if (!supplier) {
      return NextResponse.json(
        { success: false, error: "Supplier not found." },
        { status: 404 }
      );
    }

    // Determine if this role may see purchase cost data
    const canSeeCosts = ["Admin", "Warehouse", "Accountant"].includes(
      auth.user!.role
    );

    // Fetch all purchase invoices for this supplier, newest first
    const invoices = await PurchaseInvoice.find({ supplier: id })
      .sort({ invoiceDate: -1 })
      .lean();

    // Fetch all receiving records whose purchaseInvoice is in the set above
    const invoiceIds = invoices.map((inv) => inv._id);
    const allReceivings = await PurchaseReceiving.find({
      purchaseInvoice: { $in: invoiceIds },
    })
      .populate("location", "name code")
      .sort({ createdAt: -1 })
      .lean();

    // Build a fast lookup: invoiceId → receiving records
    const receivingsByInvoice: Record<string, typeof allReceivings> = {};
    for (const rec of allReceivings) {
      const key = rec.purchaseInvoice.toString();
      if (!receivingsByInvoice[key]) receivingsByInvoice[key] = [];
      receivingsByInvoice[key].push(rec);
    }

    // Build enriched invoice list
    const enrichedInvoices = invoices.map((inv) => {
      const invId = (inv._id as mongoose.Types.ObjectId).toString();
      const invReceivings = receivingsByInvoice[invId] || [];

      // Per-product received quantity aggregated across approved receivings
      const receivedQtyByProduct: Record<string, number> = {};
      const receivingRefsByProduct: Record<string, string[]> = {};

      for (const rec of invReceivings) {
        if (rec.status === "Approved") {
          for (const rItem of rec.items) {
            const pId = rItem.product.toString();
            receivedQtyByProduct[pId] =
              (receivedQtyByProduct[pId] || 0) + rItem.quantityReceived;
            if (!receivingRefsByProduct[pId]) receivingRefsByProduct[pId] = [];
            if (!receivingRefsByProduct[pId].includes(rec.receivingNumber)) {
              receivingRefsByProduct[pId].push(rec.receivingNumber);
            }
          }
        }
      }

      // Enrich each invoice line item
      const enrichedItems = inv.items.map((item) => {
        const pId = item.product.toString();
        const base: Record<string, unknown> = {
          product: item.product,
          name: item.name,
          sku: item.sku,
          barcode: item.barcode,
          condition: item.condition,
          quantity: item.quantity,
          sellingPrice: item.sellingPrice,
          minSellingPrice: item.minSellingPrice,
          quantityReceived: receivedQtyByProduct[pId] || 0,
          receivingRefs: receivingRefsByProduct[pId] || [],
        };

        // Cost data — only for authorised roles
        if (canSeeCosts) {
          base.unitCost = item.unitCost;
          base.amount = item.amount;
        }

        return base;
      });

      // Receiving summary for this invoice
      const receivingSummary = invReceivings.map((rec) => ({
        _id: rec._id,
        receivingNumber: rec.receivingNumber,
        status: rec.status,
        createdBy: rec.createdBy,
        createdAt: rec.createdAt,
        location: rec.location,
        itemCount: rec.items.length,
      }));

      const invoiceBase: Record<string, unknown> = {
        _id: inv._id,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        status: inv.status,
        items: enrichedItems,
        itemCount: inv.items.length,
        notes: inv.notes,
        createdBy: inv.createdBy,
        approvedBy: inv.approvedBy,
        approvedAt: inv.approvedAt,
        createdAt: inv.createdAt,
        updatedAt: inv.updatedAt,
        receivings: receivingSummary,
      };

      if (canSeeCosts) {
        invoiceBase.subtotal = inv.subtotal;
        invoiceBase.total = inv.total;
      }

      return invoiceBase;
    });

    // ── Aggregate Statistics ──────────────────────────────────────────────────
    const totalInvoices = invoices.length;
    const totalItems = invoices.reduce((sum, inv) => sum + inv.items.length, 0);
    const totalQtyOrdered = invoices.reduce(
      (sum, inv) => sum + inv.items.reduce((s, it) => s + it.quantity, 0),
      0
    );

    // Total received = sum of all approved receiving items across all invoices
    let totalQtyReceived = 0;
    for (const recs of Object.values(receivingsByInvoice)) {
      for (const rec of recs) {
        if (rec.status === "Approved") {
          for (const rItem of rec.items) {
            totalQtyReceived += rItem.quantityReceived;
          }
        }
      }
    }

    const stats: Record<string, unknown> = {
      totalInvoices,
      totalItems,
      totalQtyOrdered,
      totalQtyReceived,
    };

    if (canSeeCosts) {
      const totalPurchaseValue = invoices.reduce(
        (sum, inv) => sum + inv.total,
        0
      );
      stats.totalPurchaseValue = totalPurchaseValue;
    }

    return NextResponse.json({
      success: true,
      data: {
        supplier,
        invoices: enrichedInvoices,
        stats,
      },
    });
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "Failed to fetch supplier history.";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
