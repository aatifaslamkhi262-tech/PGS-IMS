import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { verifyRole } from "@/lib/auth/rbac";
import { Repair } from "@/models/Repair";
import { Product } from "@/models/Product";
import { Inventory } from "@/models/Inventory";
import { InventoryMovement } from "@/models/InventoryMovement";
import { Location } from "@/models/Location";
import { Payment } from "@/models/Payment";
import { resolveOrCreateCustomer } from "@/lib/customerResolver";
import { recordCustomerLedgerEntry } from "@/lib/customerLedgerEngine";
import { generatePaymentNumber } from "@/lib/salesEngine";

// Helper to generate unique repair number e.g. REP-20261016-0001
async function generateRepairNumber(): Promise<string> {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `REP-${dateStr}-`;

  const count = await Repair.countDocuments({
    repairNumber: new RegExp(`^${prefix}`),
  });

  const nextSeq = count + 1;
  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Salesman", "Branch"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status") || "ALL";
    const locationId = searchParams.get("locationId") || "ALL";
    const repairedBy = searchParams.get("repairedBy")?.trim() || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "30", 10)));

    const query: any = {};

    if (status && status !== "ALL") {
      query.status = status;
    }

    if (locationId && locationId !== "ALL") {
      query.location = locationId;
    }

    if (repairedBy) {
      query.repairedBy = new RegExp(repairedBy, "i");
    }

    if (search) {
      const escaped = search.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
      const searchRegex = new RegExp(escaped, "i");
      query.$or = [
        { repairNumber: searchRegex },
        { customerName: searchRegex },
        { customerPhone: searchRegex },
        { productName: searchRegex },
        { serialNumber: searchRegex },
        { faultReason: searchRegex },
      ];
    }

    const total = await Repair.countDocuments(query);
    const repairs = await Repair.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return NextResponse.json({
      success: true,
      data: repairs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch repairs." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Salesman", "Branch"]);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error || "Unauthorized" }, { status: auth.status || 401 });
    }

    const body = await req.json().catch(() => ({}));

    const {
      customerName,
      customerPhone,
      productName, // Customer's device name e.g. "PS5 Slim"
      serialNumber, // Customer's device serial number
      faultReason, // Reason / fault
      laborCost, // Service / labor fee (legacy fallback)
      billAmount, // Customer Bill Amount
      repairCost, // Internal repair cost / kharcha incurred by shop
      parts = [], // Array of used parts [{ productId, quantity, unitPrice }]
      paidAmount, // Amount customer paid
      paymentMethod = "CASH",
      repairedBy, // Technician name
      technicianId,
      locationId,
      notes,
    } = body;

    // 1. Validation
    if (!customerName || !customerName.trim()) {
      return NextResponse.json({ success: false, error: "Customer name is required." }, { status: 400 });
    }
    if (!customerPhone || !customerPhone.trim()) {
      return NextResponse.json({ success: false, error: "Customer phone is required." }, { status: 400 });
    }
    if (!productName || !productName.trim()) {
      return NextResponse.json({ success: false, error: "Customer product/device name is required." }, { status: 400 });
    }
    if (!faultReason || !faultReason.trim()) {
      return NextResponse.json({ success: false, error: "Fault reason / problem description is required." }, { status: 400 });
    }

    // 2. Resolve Location
    let targetLocation = null;
    if (locationId) {
      targetLocation = await Location.findById(locationId).lean();
    }
    if (!targetLocation) {
      targetLocation = await Location.findOne({ active: true }).lean();
    }
    if (!targetLocation) {
      return NextResponse.json({ success: false, error: "No active location configured." }, { status: 500 });
    }

    // 3. Auto-resolve or create Customer in CRM
    const customerId = await resolveOrCreateCustomer({
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
    });

    if (!customerId) {
      return NextResponse.json({ success: false, error: "Failed to resolve or create customer record." }, { status: 400 });
    }

    // 4. Process Used Parts (if any) and Deduct Inventory
    const validatedParts = [];
    let partsCostTotal = 0;
    let partsTotal = 0;

    for (const p of parts) {
      if (!p.productId) continue;

      const product = await Product.findById(p.productId);
      if (!product || product.isDeleted) {
        return NextResponse.json(
          { success: false, error: `Part product '${p.productId}' not found or deleted.` },
          { status: 400 }
        );
      }

      const qty = Math.max(1, Number(p.quantity || 1));
      const unitPrice = Number(p.unitPrice !== undefined ? p.unitPrice : product.sellingPrice || 0);

      // Find inventory record to get moving average cost
      let inv = await Inventory.findOne({
        product: product._id,
        location: targetLocation._id,
      });

      const unitCost = inv ? (inv.averageCost || 0) : Number(product.costPrice || 0);
      const lineCost = qty * unitCost;
      const lineTotal = qty * unitPrice;

      partsCostTotal += lineCost;
      partsTotal += lineTotal;

      validatedParts.push({
        product: product._id,
        productName: product.name,
        sku: product.sku,
        barcode: product.barcode,
        quantity: qty,
        unitCost,
        unitPrice,
        totalCost: lineCost,
        lineTotal,
      });

      // Deduct inventory stock
      if (inv) {
        const prevQty = inv.quantity;
        inv.quantity = Math.max(0, inv.quantity - qty);
        inv.totalCostValue = Math.max(0, inv.totalCostValue - lineCost);
        if (inv.quantity === 0) {
          inv.status = "Out of Stock";
        }
        await inv.save();

        // Record stock-out movement
        const movement = new InventoryMovement({
          product: product._id,
          productName: product.name,
          sku: product.sku,
          quantity: qty,
          unitCost,
          totalCost: lineCost,
          sourceLocation: targetLocation._id,
          sourceName: targetLocation.name,
          destinationName: `Repair Usage (${customerName.trim()})`,
          type: "SALE_OUT",
          referenceType: "REPAIR",
          beforeQuantity: prevQty,
          afterQuantity: inv.quantity,
          performedBy: auth.user.username,
          date: new Date(),
          notes: `Used in repair for ${customerName.trim()} (${productName.trim()})`,
        });
        await movement.save();
      }
    }

    // 5. Financial Totals
    const numRepairCost = Math.max(0, Number(repairCost || 0));
    let totalAmount = 0;
    if (billAmount !== undefined && billAmount !== null && billAmount !== "") {
      totalAmount = Math.max(0, Number(billAmount || 0));
    } else if (body.totalAmount !== undefined && body.totalAmount !== null && body.totalAmount !== "") {
      totalAmount = Math.max(0, Number(body.totalAmount || 0));
    } else {
      totalAmount = Math.max(0, Number(laborCost || 0)) + partsTotal;
    }
    const numLabor = Math.max(0, totalAmount - partsTotal);
    const numPaid = Math.max(0, Math.min(totalAmount, Number(paidAmount || 0)));
    const balanceDue = Math.max(0, totalAmount - numPaid);

    // 6. Generate Repair Number
    const repairNumber = await generateRepairNumber();

    // 7. Technician Name
    const assignedTechnician = repairedBy?.trim() || auth.user.username || "In-House Technician";

    // 8. Create Repair Document
    const repair = new Repair({
      repairNumber,
      customer: customerId,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      productName: productName.trim(),
      serialNumber: serialNumber ? serialNumber.trim() : "",
      faultReason: faultReason.trim(),
      parts: validatedParts,
      laborCost: numLabor,
      repairCost: numRepairCost,
      partsCostTotal,
      partsTotal,
      totalAmount,
      paidAmount: numPaid,
      balanceDue,
      paymentMethod: paymentMethod || "CASH",
      status: balanceDue > 0 ? "PENDING" : "COMPLETED",
      repairedBy: assignedTechnician,
      technicianId: technicianId || undefined,
      location: targetLocation._id,
      locationName: targetLocation.name,
      notes: notes?.trim() || "",
      createdBy: auth.user.username,
    });

    await repair.save();

    // 9. Customer Ledger Integration
    if (totalAmount > 0) {
      // Record INVOICE debit entry in Customer Ledger
      await recordCustomerLedgerEntry({
        customerId,
        type: "INVOICE",
        amount: totalAmount,
        referenceType: "Repair",
        referenceId: repair.repairNumber,
        notes: `Repair Charges: ${productName.trim()} (SN: ${serialNumber ? serialNumber.trim() : "N/A"}) - ${faultReason.trim()}`,
        createdBy: auth.user.username,
      });
    }

    if (numPaid > 0) {
      // Record PAYMENT credit entry in Customer Ledger
      await recordCustomerLedgerEntry({
        customerId,
        type: "PAYMENT",
        amount: numPaid,
        referenceType: "Repair",
        referenceId: repair.repairNumber,
        notes: `Payment for Repair ${repair.repairNumber} via ${paymentMethod || "CASH"}`,
        createdBy: auth.user.username,
      });

      // Record Payment record for Cash Register / Daily Closing report
      const paymentNumber = await generatePaymentNumber();
      const payment = new Payment({
        paymentNumber,
        customer: customerId,
        location: targetLocation._id,
        paymentMethod: paymentMethod || "CASH",
        amount: numPaid,
        notes: `Repair ${repair.repairNumber} - ${productName.trim()}`,
        receivedBy: auth.user.username,
        status: "PAID",
      });
      await payment.save();
    }

    return NextResponse.json({
      success: true,
      message: "Repair ticket created successfully.",
      data: repair,
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create repair ticket." },
      { status: 500 }
    );
  }
}
