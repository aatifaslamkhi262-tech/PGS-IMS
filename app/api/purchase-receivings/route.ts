import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { PurchaseReceiving } from "@/models/PurchaseReceiving";
import { PurchaseInvoice } from "@/models/PurchaseInvoice";
import { Product } from "@/models/Product";
import { Location } from "@/models/Location";
import { verifyRole } from "@/lib/auth/rbac";

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    // Admin, Warehouse, and Accountant can query receivings
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Branch"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const invoiceId = searchParams.get("purchaseInvoice") || "";
    const status = searchParams.get("status") || "";
    const location = searchParams.get("location") || "";

    const query: any = {};
    if (invoiceId) query.purchaseInvoice = invoiceId;
    if (status) query.status = status;
    if (location) query.location = location;

    const receivings = await PurchaseReceiving.find(query)
      .populate("purchaseInvoice", "invoiceNumber")
      .populate("location", "name code")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ success: true, data: receivings });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch purchase receivings." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    // Only Admin and Warehouse can create receiving records
    const auth = await verifyRole(["Admin", "Warehouse"]);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));
    const { purchaseInvoice: invoiceId, location: locationId, items, notes, submitForApproval } = body;

    // 1. Basic field validations
    if (!invoiceId) {
      return NextResponse.json({ success: false, error: "Purchase Invoice reference is required." }, { status: 400 });
    }
    if (!locationId) {
      return NextResponse.json({ success: false, error: "Destination Location is required." }, { status: 400 });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: "At least one item is required for receiving." }, { status: 400 });
    }

    // Verify location exists
    const locationObj = await Location.findById(locationId);
    if (!locationObj || !locationObj.active) {
      return NextResponse.json({ success: false, error: "Invalid or inactive destination location." }, { status: 400 });
    }

    // Verify invoice exists and is approved
    const invoice = await PurchaseInvoice.findById(invoiceId);
    if (!invoice) {
      return NextResponse.json({ success: false, error: "Purchase Invoice not found." }, { status: 404 });
    }

    const allowedInvoiceStatuses = ["Approved", "Ready_For_Receiving", "Receiving", "Receiving_Pending_Approval", "Receiving_Approved"];
    if (!allowedInvoiceStatuses.includes(invoice.status)) {
      return NextResponse.json(
        { success: false, error: `Receiving can only be created for approved purchase invoices. Current status: ${invoice.status}` },
        { status: 400 }
      );
    }

    // Fetch all previously approved receiving records for this invoice
    const approvedReceivings = await PurchaseReceiving.find({
      purchaseInvoice: invoiceId,
      status: "Approved",
    }).lean();

    // Map previously received quantities by product ID string
    const previouslyReceived: Record<string, number> = {};
    for (const rec of approvedReceivings) {
      for (const item of rec.items) {
        const prodId = item.product.toString();
        previouslyReceived[prodId] = (previouslyReceived[prodId] || 0) + item.quantityReceived;
      }
    }

    // Validate Items
    const validatedItems = [];
    const globalSerialSet = new Set<string>();

    for (const item of items) {
      if (!item.product) {
        return NextResponse.json({ success: false, error: "Product ID is required for all lines." }, { status: 400 });
      }
      if (item.quantityReceived === undefined || item.quantityReceived <= 0) {
        return NextResponse.json({ success: false, error: "Quantity received must be greater than 0." }, { status: 400 });
      }

      // Check product belongs to the invoice
      const invoiceLine = invoice.items.find((line) => line.product.toString() === item.product);
      if (!invoiceLine) {
        return NextResponse.json(
          { success: false, error: `Product "${item.name || item.product}" does not belong to this purchase invoice.` },
          { status: 400 }
        );
      }

      // Check product details in database
      const productObj = await Product.findById(item.product);
      if (!productObj) {
        return NextResponse.json({ success: false, error: `Product not found in database: ${item.product}` }, { status: 404 });
      }

      // Calculate remaining outstanding quantity for this product line
      const prevQty = previouslyReceived[item.product] || 0;
      const outstandingQty = invoiceLine.quantity - prevQty;
      if (item.quantityReceived > outstandingQty) {
        return NextResponse.json(
          {
            success: false,
            error: `Cannot receive ${item.quantityReceived} units of "${productObj.name}". Remaining outstanding to receive is only ${outstandingQty} (Ordered: ${invoiceLine.quantity}, Already Received: ${prevQty}).`,
          },
          { status: 400 }
        );
      }

      const serialNumbers = item.serialNumbers || [];

      // Validate serials if product.serialTracking is true
      if (productObj.serialTracking) {
        if (!serialNumbers || !Array.isArray(serialNumbers) || serialNumbers.length !== item.quantityReceived) {
          return NextResponse.json(
            {
              success: false,
              error: `Serial tracking is enabled for "${productObj.name}". Please provide exactly ${item.quantityReceived} serial numbers.`,
            },
            { status: 400 }
          );
        }

        // Check for duplicates in the current receiving payload
        for (const sn of serialNumbers) {
          const cleanSn = sn.trim();
          if (!cleanSn) {
            return NextResponse.json({ success: false, error: `Serial number for "${productObj.name}" cannot be empty.` }, { status: 400 });
          }
          if (globalSerialSet.has(cleanSn)) {
            return NextResponse.json(
              { success: false, error: `Duplicate serial number "${cleanSn}" detected in the current receiving list.` },
              { status: 400 }
            );
          }
          globalSerialSet.add(cleanSn);
        }
      }

      validatedItems.push({
        product: item.product,
        name: productObj.name,
        sku: productObj.sku,
        barcode: productObj.barcode,
        condition: productObj.condition,
        quantityReceived: parseInt(item.quantityReceived, 10),
        serialNumbers: productObj.serialTracking ? serialNumbers.map((s: string) => s.trim()) : [],
      });
    }

    // Generate unique receivingNumber
    let receivingNumber = "";
    let isUnique = false;
    while (!isUnique) {
      const rand = Math.floor(1000 + Math.random() * 9000);
      const count = await PurchaseReceiving.countDocuments();
      receivingNumber = `REC-${String(count + 1).padStart(4, '0')}-${rand}`;
      const existing = await PurchaseReceiving.findOne({ receivingNumber });
      if (!existing) isUnique = true;
    }

    const receivingStatus = submitForApproval ? "Pending_Approval" : "Draft";

    const receiving = await PurchaseReceiving.create({
      receivingNumber,
      purchaseInvoice: invoiceId,
      location: locationId,
      status: receivingStatus,
      items: validatedItems,
      notes: notes?.trim() || undefined,
      createdBy: auth.user.username,
    });

    // If submitted, update the purchase invoice status
    if (submitForApproval) {
      if (invoice.status === "Approved" || invoice.status === "Ready_For_Receiving") {
        invoice.status = "Receiving";
      }
      await invoice.save();
    }

    return NextResponse.json({ success: true, data: receiving });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create physical receiving." },
      { status: 500 }
    );
  }
}
