import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { PurchaseInvoice } from "@/models/PurchaseInvoice";
import { Product } from "@/models/Product";
import { User } from "@/models/User";
import { Location } from "@/models/Location";
import "@/models/Supplier"; // Ensure Supplier model is registered
import { verifyRole } from "@/lib/auth/rbac";

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    // Allow Admin, Warehouse, Accountant to view history
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const supplier = searchParams.get("supplier") || "";
    const status = searchParams.get("status") || "";
    const intakePurpose = searchParams.get("intakePurpose") || "";
    const salesman = searchParams.get("salesman") || "";
    const startDate = searchParams.get("startDate") || "";
    const endDate = searchParams.get("endDate") || "";
    const includeItems = searchParams.get("includeItems") === "true";
    const limitParam = searchParams.get("limit");
    const limit = limitParam === "all" ? 500 : Math.min(200, Math.max(10, parseInt(limitParam || "100", 10)));

    const query: any = {};
    if (search.trim()) {
      const cleanSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { invoiceNumber: new RegExp(cleanSearch, "i") },
        { customerName: new RegExp(cleanSearch, "i") },
      ];
    }
    if (supplier) {
      query.supplier = supplier;
    }
    if (status) {
      query.status = status;
    }
    if (salesman) {
      query.handledBySalesman = salesman;
    }
    if (intakePurpose === "PAID_PURCHASE") {
      query.intakePurpose = { $nin: ["EXCHANGE_INTAKE"] };
      query.receivingType = { $ne: "CUSTOMER_RETURN" };
    } else if (intakePurpose === "EXCHANGE_INTAKE") {
      query.$and = [
        ...(query.$and || []),
        {
          $or: [
            { intakePurpose: "EXCHANGE_INTAKE" },
            { receivingType: "CUSTOMER_RETURN" },
          ],
        },
      ];
    } else if (intakePurpose === "DIRECT_BUYBACK") {
      query.$and = [
        ...(query.$and || []),
        {
          $or: [
            { intakePurpose: "DIRECT_BUYBACK" },
            { receivingType: "CUSTOMER_BUYBACK", intakePurpose: { $ne: "EXCHANGE_INTAKE" } },
          ],
        },
      ];
    } else if (intakePurpose === "SUPPLIER_PURCHASE") {
      query.receivingType = { $in: ["SUPPLIER_PURCHASE", null, undefined] };
      query.intakePurpose = { $nin: ["DIRECT_BUYBACK", "EXCHANGE_INTAKE"] };
    }

    if (startDate || endDate) {
      query.invoiceDate = {};
      if (startDate) {
        query.invoiceDate.$gte = new Date(`${startDate}T00:00:00.000Z`);
      }
      if (endDate) {
        query.invoiceDate.$lte = new Date(`${endDate}T23:59:59.999Z`);
      }
    }

    let queryBuilder = PurchaseInvoice.find(query)
      .populate("supplier", "name code")
      .populate("handledBySalesman", "name username")
      .populate("location", "name code")
      .sort({ invoiceDate: -1, createdAt: -1 })
      .limit(limit);

    if (!includeItems) {
      queryBuilder = queryBuilder.select("-items -attachmentUrls");
    } else {
      queryBuilder = queryBuilder.select("-attachmentUrls");
    }

    const invoices = await queryBuilder.lean();

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
    const {
      invoiceNumber,
      receivingType,
      intakePurpose,
      supplier,
      customerName,
      customerPhone,
      handledBySalesman,
      handledBySalesmanName,
      location,
      locationName,
      attachmentUrls,
      drawerCashPaid,
      onlinePaid,
      invoiceDate,
      items,
      notes,
    } = body;

    const actualReceivingType = receivingType || "SUPPLIER_PURCHASE";
    const actualIntakePurpose =
      intakePurpose ||
      (actualReceivingType === "CUSTOMER_BUYBACK"
        ? "DIRECT_BUYBACK"
        : actualReceivingType === "CUSTOMER_RETURN"
        ? "EXCHANGE_INTAKE"
        : "SUPPLIER_PURCHASE");

    let resolvedSalesmanId = handledBySalesman || undefined;
    let resolvedSalesmanName = handledBySalesmanName || undefined;
    if (resolvedSalesmanId && !resolvedSalesmanName) {
      const staffDoc = await User.findById(resolvedSalesmanId).lean();
      if (staffDoc) {
        resolvedSalesmanName = staffDoc.name || staffDoc.username;
      }
    }

    let resolvedLocId = location || undefined;
    let resolvedLocName = locationName || undefined;
    if (resolvedLocId && !resolvedLocName) {
      const locDoc = await Location.findById(resolvedLocId).lean();
      if (locDoc) {
        resolvedLocName = locDoc.name;
      }
    }

    // Field Validations
    if (!invoiceNumber || !invoiceNumber.trim()) {
      return NextResponse.json({ success: false, error: "Invoice Number is required." }, { status: 400 });
    }
    if (actualReceivingType === "SUPPLIER_PURCHASE" && !supplier) {
      return NextResponse.json({ success: false, error: "Supplier is required for Supplier Purchase." }, { status: 400 });
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
      receivingType: actualReceivingType,
      intakePurpose: actualIntakePurpose,
      supplier: supplier || undefined,
      customerName: customerName?.trim() || undefined,
      customerPhone: customerPhone?.trim() || undefined,
      handledBySalesman: resolvedSalesmanId,
      handledBySalesmanName: resolvedSalesmanName,
      location: resolvedLocId,
      locationName: resolvedLocName,
      attachmentUrls: Array.isArray(attachmentUrls) ? attachmentUrls.filter(Boolean) : [],
      drawerCashPaid: Math.max(0, Number(drawerCashPaid || 0)),
      onlinePaid: Math.max(0, Number(onlinePaid || 0)),
      invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
      status: "Draft",
      items: validatedItems,
      subtotal: calculatedSubtotal,
      total: calculatedSubtotal, // No tax/discount/shipping at this stage (TBD)
      notes: notes?.trim() || undefined,
      createdBy: auth.user.username,
    });

    // Note: Baseline Product document prices are updated upon physical receiving approval (PurchaseReceiving), keeping unapproved draft invoices isolated.

    return NextResponse.json({ success: true, data: invoice });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create purchase invoice." },
      { status: 500 }
    );
  }
}
