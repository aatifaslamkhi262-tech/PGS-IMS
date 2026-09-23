import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { verifyApiKey } from "@/lib/auth/apiKey";
import { Product } from "@/models/Product";
import { Location } from "@/models/Location";
import { Sale } from "@/models/Sale";

export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    // 1. Verify API Key Header
    const auth = verifyApiKey(req);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const {
      customerName,
      customerPhone,
      shippingAddress,
      paymentMethod,
      deliveryCharges,
      notes,
      items,
    } = body;

    // 2. Validate Payload
    if (!customerName || !customerName.trim()) {
      return NextResponse.json({ success: false, error: "Customer Name is required." }, { status: 400 });
    }
    if (!customerPhone || !customerPhone.trim()) {
      return NextResponse.json({ success: false, error: "Customer Phone is required." }, { status: 400 });
    }
    if (!shippingAddress || !shippingAddress.trim()) {
      return NextResponse.json({ success: false, error: "Shipping Address is required." }, { status: 400 });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: "At least one order item is required." }, { status: 400 });
    }

    // 3. Find Central Warehouse Location
    let warehouseLocation = await Location.findOne({ type: "Warehouse", active: true }).lean();
    if (!warehouseLocation) {
      warehouseLocation = await Location.findOne({ active: true }).lean();
    }
    if (!warehouseLocation) {
      return NextResponse.json({ success: false, error: "Central Warehouse location not configured." }, { status: 500 });
    }

    // 4. Validate and Process Order Line Items
    const validatedItems = [];
    let subtotal = 0;
    let totalCost = 0;

    for (const item of items) {
      if (!item.productId) {
        return NextResponse.json({ success: false, error: "Product ID is required for all line items." }, { status: 400 });
      }

      const qty = Math.max(1, Number(item.quantity || 1));
      const product = await Product.findById(item.productId);

      if (!product || !product.active || product.isDeleted) {
        return NextResponse.json(
          { success: false, error: `Product '${item.productId}' is not available.` },
          { status: 400 }
        );
      }

      const unitPrice = Number(item.unitPrice !== undefined ? item.unitPrice : product.sellingPrice || 0);
      const unitCost = Number(product.costPrice || 0);
      const minSellingPrice = Number(product.minSellingPrice || 0);
      const lineTotal = qty * unitPrice;
      const lineCost = qty * unitCost;
      const grossProfit = lineTotal - lineCost;

      subtotal += lineTotal;
      totalCost += lineCost;

      validatedItems.push({
        product: product._id,
        productName: product.name,
        sku: product.sku,
        barcode: product.barcode,
        condition: product.condition || "New",
        quantity: qty,
        unitCost,
        unitPrice,
        minSellingPrice,
        discountAmount: 0,
        lineTotal,
        grossProfit,
      });
    }

    const delFee = Math.max(0, Number(deliveryCharges || 0));
    const totalAmount = subtotal + delFee;
    const netProfit = totalAmount - totalCost;

    // 5. Generate Sale Number
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const saleNumber = `WEB-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;

    const fullNotes = `Shipping Address: ${shippingAddress.trim()}${notes ? ` | Notes: ${notes.trim()}` : ""}`;

    // 6. Create Sale Invoice Document in MongoDB
    const sale = new Sale({
      saleNumber,
      creationMode: "WAREHOUSE_QUICK_SALE",
      saleSource: "WEBSITE",
      location: warehouseLocation._id,
      locationName: warehouseLocation.name,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      items: validatedItems,
      subtotal,
      discountAmount: 0,
      taxAmount: 0,
      deliveryCharges: delFee,
      totalAmount,
      totalPaid: 0,
      balanceDue: totalAmount,
      totalCost,
      netProfit,
      status: "PAYMENT_PENDING", // Pushes directly to IMS Warehouse Queue live view
      paymentMethod: paymentMethod || "CASH",
      notes: fullNotes,
      createdBy: "ecommerce-web",
    });

    await sale.save();

    return NextResponse.json({
      success: true,
      data: {
        saleId: sale._id,
        saleNumber: sale.saleNumber,
        status: sale.status,
        totalAmount: sale.totalAmount,
        createdAt: sale.createdAt,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process web order checkout." },
      { status: 500 }
    );
  }
}
