import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { PurchaseInvoice } from "@/models/PurchaseInvoice";
import { Product } from "@/models/Product";
import "@/models/Supplier"; // Ensure Supplier model is registered
import { verifyRole } from "@/lib/auth/rbac";

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    // Allow Admin, Warehouse, Accountant, Branch, and Salesman to view history
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Branch", "Salesman"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const supplier = searchParams.get("supplier") || "";
    const status = searchParams.get("status") || "";

    const query: any = {};
    if (search.trim()) {
      query.invoiceNumber = new RegExp(search.trim(), "i");
    }
    if (supplier) {
      query.supplier = supplier;
    }
    if (status) {
      query.status = status;
    }

    const invoices = await PurchaseInvoice.find(query)
      .populate("supplier", "name code")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ success: true, data: invoices });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch purchase invoices." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    // Only Admin and Warehouse can create invoices
    const auth = await verifyRole(["Admin", "Warehouse"]);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));
    const { invoiceNumber, supplier, invoiceDate, items, notes } = body;

    // Field Validations
    if (!invoiceNumber || !invoiceNumber.trim()) {
      return NextResponse.json({ success: false, error: "Invoice Number is required." }, { status: 400 });
    }
    if (!supplier) {
      return NextResponse.json({ success: false, error: "Supplier is required." }, { status: 400 });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: "At least one product line item is required." }, { status: 400 });
    }

    // Check for duplicate invoiceNumber server-side
    const cleanInvoiceNumber = invoiceNumber.trim();
    const existingInvoice = await PurchaseInvoice.findOne({ invoiceNumber: cleanInvoiceNumber });
    if (existingInvoice) {
      return NextResponse.json(
        { success: false, error: `Invoice Number "${cleanInvoiceNumber}" already exists.` },
        { status: 400 }
      );
    }

    // Validate Items
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

      // Auto-compute line amount
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

    // Save Draft
    const invoice = await PurchaseInvoice.create({
      invoiceNumber: cleanInvoiceNumber,
      supplier,
      invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
      status: "Draft",
      items: validatedItems,
      subtotal: calculatedSubtotal,
      total: calculatedSubtotal, // No tax/discount/shipping at this stage (TBD)
      notes: notes?.trim() || undefined,
      createdBy: auth.user.username,
    });

    // Update baseline Product document prices if current baseline prices are placeholders (<= 1)
    for (const item of validatedItems) {
      await Product.updateOne(
        {
          _id: item.product,
          $or: [{ costPrice: { $lte: 1 } }, { sellingPrice: { $lte: 1 } }],
        },
        {
          $set: {
            costPrice: item.unitCost,
            sellingPrice: item.sellingPrice,
            minSellingPrice: item.minSellingPrice,
          },
        }
      );
    }

    return NextResponse.json({ success: true, data: invoice });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create purchase invoice." },
      { status: 500 }
    );
  }
}
