import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { PurchaseReceiving } from "@/models/PurchaseReceiving";
import { PurchaseInvoice } from "@/models/PurchaseInvoice";
import { Product } from "@/models/Product";
import { Location } from "@/models/Location";
import { verifyRole } from "@/lib/auth/rbac";

export async function GET(
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
    const receiving = await PurchaseReceiving.findById(id)
      .populate("purchaseInvoice", "invoiceNumber status items")
      .populate("location", "name code type active")
      .lean();

    if (!receiving) {
      return NextResponse.json({ success: false, error: "Physical receiving record not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: receiving });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch receiving details." },
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
    const auth = await verifyRole(["Admin", "Warehouse"]);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { location: locationId, items, notes, submitForApproval } = body;

    const receiving = await PurchaseReceiving.findById(id);
    if (!receiving) {
      return NextResponse.json({ success: false, error: "Receiving record not found." }, { status: 404 });
    }

    // Only Draft and Rejected receivings can be modified
    if (receiving.status !== "Draft" && receiving.status !== "Rejected") {
      return NextResponse.json(
        { success: false, error: `Only Draft or Rejected receiving documents can be updated. Current status: ${receiving.status}` },
        { status: 400 }
      );
    }

    // Validate location if provided
    if (locationId) {
      const locationObj = await Location.findById(locationId);
      if (!locationObj || !locationObj.active) {
        return NextResponse.json({ success: false, error: "Invalid or inactive destination location." }, { status: 400 });
      }
      receiving.location = locationId;
    }

    const invoice = await PurchaseInvoice.findById(receiving.purchaseInvoice);
    if (!invoice) {
      return NextResponse.json({ success: false, error: "Associated Purchase Invoice not found." }, { status: 404 });
    }

    // Load other APPROVED receiving documents for this invoice, excluding the current one (if it was somehow approved - not possible here)
    const approvedReceivings = await PurchaseReceiving.find({
      purchaseInvoice: receiving.purchaseInvoice,
      status: "Approved",
      _id: { $ne: id },
    }).lean();

    const previouslyReceived: Record<string, number> = {};
    for (const rec of approvedReceivings) {
      for (const item of rec.items) {
        const prodId = item.product.toString();
        previouslyReceived[prodId] = (previouslyReceived[prodId] || 0) + item.quantityReceived;
      }
    }

    // Validate items
    if (items) {
      if (!Array.isArray(items) || items.length === 0) {
        return NextResponse.json({ success: false, error: "At least one item is required." }, { status: 400 });
      }

      const validatedItems = [];
      const globalSerialSet = new Set<string>();

      for (const item of items) {
        if (!item.product) {
          return NextResponse.json({ success: false, error: "Product reference is required for all lines." }, { status: 400 });
        }
        if (item.quantityReceived === undefined || item.quantityReceived <= 0) {
          return NextResponse.json({ success: false, error: "Quantity received must be greater than 0." }, { status: 400 });
        }

        const invoiceLine = invoice.items.find((line) => line.product.toString() === item.product);
        if (!invoiceLine) {
          return NextResponse.json(
            { success: false, error: `Product "${item.name || item.product}" does not belong to the associated invoice.` },
            { status: 400 }
          );
        }

        const productObj = await Product.findById(item.product);
        if (!productObj) {
          return NextResponse.json({ success: false, error: `Product not found: ${item.product}` }, { status: 404 });
        }

        const prevQty = previouslyReceived[item.product] || 0;
        const outstandingQty = invoiceLine.quantity - prevQty;
        if (item.quantityReceived > outstandingQty) {
          return NextResponse.json(
            {
              success: false,
              error: `Cannot receive ${item.quantityReceived} units of "${productObj.name}". Remaining outstanding to receive is only ${outstandingQty}.`,
            },
            { status: 400 }
          );
        }

        const serialNumbers = item.serialNumbers || [];
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

          for (const sn of serialNumbers) {
            const cleanSn = sn.trim();
            if (!cleanSn) {
              return NextResponse.json({ success: false, error: `Serial number for "${productObj.name}" cannot be empty.` }, { status: 400 });
            }
            if (globalSerialSet.has(cleanSn)) {
              return NextResponse.json(
                { success: false, error: `Duplicate serial number "${cleanSn}" detected in the edit payload.` },
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

      receiving.items = validatedItems as any;
    }

    if (notes !== undefined) {
      receiving.notes = notes.trim() || undefined;
    }

    if (submitForApproval) {
      receiving.status = "Pending_Approval";
      
      // Reset rejection fields
      receiving.rejectedBy = undefined;
      receiving.rejectedAt = undefined;
      receiving.rejectionReason = undefined;

      // Update parent invoice status
      if (invoice.status === "Approved" || invoice.status === "Ready_For_Receiving") {
        invoice.status = "Receiving";
      }
      await invoice.save();
    }

    await receiving.save();

    return NextResponse.json({ success: true, data: receiving });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update receiving record." },
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
    const auth = await verifyRole(["Admin", "Warehouse"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const receiving = await PurchaseReceiving.findById(id);

    if (!receiving) {
      return NextResponse.json({ success: false, error: "Receiving record not found." }, { status: 404 });
    }

    if (receiving.status !== "Draft") {
      return NextResponse.json(
        { success: false, error: `Only Draft receiving documents can be deleted. Current status: ${receiving.status}` },
        { status: 400 }
      );
    }

    await PurchaseReceiving.deleteOne({ _id: id });

    return NextResponse.json({ success: true, message: "Draft physical receiving deleted successfully.", id });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete receiving record." },
      { status: 500 }
    );
  }
}
