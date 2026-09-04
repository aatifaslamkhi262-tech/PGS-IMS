import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { PurchaseInvoice } from "@/models/PurchaseInvoice";
import "@/models/Supplier"; // Ensure Supplier model is registered
import { verifyRole } from "@/lib/auth/rbac";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Branch", "Salesman"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const invoice = await PurchaseInvoice.findById(id)
      .populate("supplier", "name code contactPerson phone email address active")
      .populate("items.product", "name sku barcode condition model serialTracking")
      .lean();

    if (!invoice) {
      return NextResponse.json({ success: false, error: "Purchase Invoice not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: invoice });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch purchase invoice." },
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
    // Admin, Warehouse, and Accountant can edit
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { invoiceNumber, supplier, invoiceDate, items, notes } = body;

    const invoice = await PurchaseInvoice.findById(id);
    if (!invoice) {
      return NextResponse.json({ success: false, error: "Purchase Invoice not found." }, { status: 404 });
    }

    // Business rule: Once approved, edits are strictly blocked.
    if (invoice.status === "Approved") {
      return NextResponse.json(
        { success: false, error: "Approved invoices cannot be modified." },
        { status: 400 }
      );
    }

    // Name / invoiceNumber validation
    if (invoiceNumber !== undefined) {
      const cleanInvoiceNumber = invoiceNumber.trim();
      if (!cleanInvoiceNumber) {
        return NextResponse.json({ success: false, error: "Invoice Number cannot be empty." }, { status: 400 });
      }

      if (cleanInvoiceNumber !== invoice.invoiceNumber) {
        const existingInvoice = await PurchaseInvoice.findOne({
          invoiceNumber: cleanInvoiceNumber,
          _id: { $ne: id },
        });
        if (existingInvoice) {
          return NextResponse.json(
            { success: false, error: `Invoice Number "${cleanInvoiceNumber}" already exists.` },
            { status: 400 }
          );
        }
        invoice.invoiceNumber = cleanInvoiceNumber;
      }
    }

    if (supplier !== undefined) {
      if (!supplier) {
        return NextResponse.json({ success: false, error: "Supplier reference cannot be empty." }, { status: 400 });
      }
      invoice.supplier = supplier;
    }

    if (invoiceDate !== undefined) {
      invoice.invoiceDate = new Date(invoiceDate);
    }

    if (notes !== undefined) {
      invoice.notes = notes ? notes.trim() : undefined;
    }

    if (items !== undefined) {
      if (!Array.isArray(items) || items.length === 0) {
        return NextResponse.json({ success: false, error: "Invoice must have at least one product line item." }, { status: 400 });
      }

      const validatedItems = [];
      let calculatedSubtotal = 0;

      for (const item of items) {
        if (!item.product) {
          return NextResponse.json({ success: false, error: "Product reference is required for all lines." }, { status: 400 });
        }
        if (item.quantity === undefined || item.quantity <= 0) {
          return NextResponse.json({ success: false, error: "Quantity must be greater than 0." }, { status: 400 });
        }
        if (item.unitCost === undefined || item.unitCost < 0) {
          return NextResponse.json({ success: false, error: "Unit Cost cannot be negative." }, { status: 400 });
        }
        if (item.sellingPrice === undefined || item.sellingPrice <= 0) {
          return NextResponse.json({ success: false, error: "Selling Price must be greater than 0." }, { status: 400 });
        }
        if (item.minSellingPrice === undefined || item.minSellingPrice <= 0) {
          return NextResponse.json({ success: false, error: "Minimum Selling Price must be greater than 0." }, { status: 400 });
        }
        if (Number(item.minSellingPrice) > Number(item.sellingPrice)) {
          return NextResponse.json({ success: false, error: "Minimum Selling Price cannot exceed Selling Price." }, { status: 400 });
        }

        const amount = item.quantity * item.unitCost;
        calculatedSubtotal += amount;

        validatedItems.push({
          product: item.product,
          name: item.name || "Unknown Product",
          sku: item.sku || "",
          barcode: item.barcode || "",
          condition: item.condition || "New",
          quantity: parseInt(item.quantity, 10),
          unitCost: Number(item.unitCost),
          sellingPrice: Number(item.sellingPrice),
          minSellingPrice: Number(item.minSellingPrice),
          amount,
        });
      }

      invoice.items = validatedItems;
      invoice.subtotal = calculatedSubtotal;
      invoice.total = calculatedSubtotal;
    }

    await invoice.save();

    return NextResponse.json({ success: true, data: invoice });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update purchase invoice." },
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
    // Accountant, Branch, and Salesman are blocked from deleting invoices (only Admin and Warehouse)
    const auth = await verifyRole(["Admin", "Warehouse"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const invoice = await PurchaseInvoice.findById(id);

    if (!invoice) {
      return NextResponse.json({ success: false, error: "Purchase Invoice not found." }, { status: 404 });
    }

    // Business rule: Once approved, deletion is blocked to protect transaction history
    if (invoice.status === "Approved") {
      return NextResponse.json(
        { success: false, error: "Approved purchase invoices cannot be deleted." },
        { status: 400 }
      );
    }

    await PurchaseInvoice.deleteOne({ _id: id });

    return NextResponse.json({
      success: true,
      message: "Purchase Invoice deleted successfully.",
      id,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete purchase invoice." },
      { status: 500 }
    );
  }
}
