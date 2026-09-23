import mongoose, { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { Sale, ISale, ISaleItem, CreationMode, SaleSource } from "@/models/Sale";
import { Invoice } from "@/models/Invoice";
import { Payment, PaymentMethod } from "@/models/Payment";
import { Product } from "@/models/Product";
import { SerialNumber } from "@/models/SerialNumber";
import { Inventory } from "@/models/Inventory";
import { InventoryMovement } from "@/models/InventoryMovement";
import { Location } from "@/models/Location";
import { Customer } from "@/models/Customer";
import { calculateProductWeightedPricing, resolveProductEffectivePricing } from "@/lib/pricing";
import { getPoolAverageCost, deductInventoryWithAverageCost } from "@/lib/averageCostEngine";
import { recordCustomerLedgerEntry } from "@/lib/customerLedgerEngine";
import { recordCashMovement } from "@/lib/cashSessionEngine";
import { CashSession } from "@/models/CashSession";

export async function generateSaleNumber(): Promise<string> {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const count = await Sale.countDocuments({
    saleNumber: new RegExp(`^SALE-${dateStr}`),
  });
  return `SALE-${dateStr}-${String(count + 1).padStart(3, "0")}`;
}

export async function generateInvoiceNumber(): Promise<string> {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const count = await Invoice.countDocuments({
    invoiceNumber: new RegExp(`^INV-${dateStr}`),
  });
  return `INV-${dateStr}-${String(count + 1).padStart(3, "0")}`;
}

export async function generatePaymentNumber(): Promise<string> {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const count = await Payment.countDocuments({
    paymentNumber: new RegExp(`^PAY-${dateStr}`),
  });
  return `PAY-${dateStr}-${String(count + 1).padStart(3, "0")}`;
}

export interface CreateSaleInput {
  creationMode: CreationMode;
  saleSource: SaleSource;
  locationId: string;
  salesmanId?: string;
  salesmanName?: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  items: Array<{
    productId: string;
    condition?: string;
    quantity: number;
    serialNumbers?: string[];
    unitPrice?: number;
    discountAmount?: number;
  }>;
  discountAmount?: number;
  deliveryCharges?: number;
  notes?: string;
  createdBy: string;
}

export async function createSaleInput(input: CreateSaleInput) {
  await dbConnect();

  const location = await Location.findById(input.locationId);
  if (!location || !location.active) {
    throw new Error("Invalid or inactive location specified.");
  }

  if (input.creationMode === "SALESMAN_CHECKOUT" && input.salesmanId) {
    const existingOpenSale = await Sale.findOne({
      location: location._id,
      salesman: input.salesmanId,
      status: { $in: ["DRAFT", "CHECKOUT", "PAYMENT_PENDING"] },
      createdAt: { $gte: new Date(Date.now() - 30 * 60 * 1000) },
    });
    if (existingOpenSale) {
      return { isDuplicate: true, sale: existingOpenSale };
    }
  }

  const processedItems: ISaleItem[] = [];
  let subtotal = 0;
  let totalCost = 0;

  for (const itemInput of input.items) {
    const product = await Product.findById(itemInput.productId);
    if (!product || product.isDeleted) {
      throw new Error(`Product not found: ${itemInput.productId}`);
    }

    const condition = itemInput.condition || product.condition || "New";
    const weightedPricing = await calculateProductWeightedPricing(product._id.toString());
    const effective = resolveProductEffectivePricing(product, weightedPricing) || {
      costPrice: product.costPrice || 0,
      sellingPrice: product.sellingPrice || 0,
      minSellingPrice: product.minSellingPrice || 0,
      source: "PRODUCT_MASTER",
    };

    const unitPrice = itemInput.unitPrice !== undefined && itemInput.unitPrice > 0
      ? itemInput.unitPrice
      : effective.sellingPrice;

    const minSellingPrice = effective.minSellingPrice;
    const itemDiscount = itemInput.discountAmount || 0;
    const effectiveUnitPrice = unitPrice - (itemDiscount / itemInput.quantity);

    if (effectiveUnitPrice < minSellingPrice - 1) {
      throw new Error(
        `Price error for '${product.name}': Effective price (Rs. ${Math.round(effectiveUnitPrice)}) cannot be below Minimum Selling Price (Rs. ${minSellingPrice}).`
      );
    }

    const cleanSerials: string[] = [];
    if (product.serialTracking) {
      if (!itemInput.serialNumbers || itemInput.serialNumbers.length !== itemInput.quantity) {
        throw new Error(
          `Product '${product.name}' requires exact ${itemInput.quantity} serial numbers.`
        );
      }

      for (const sn of itemInput.serialNumbers) {
        const cleanSn = sn.trim();
        const serialDoc = await SerialNumber.findOne({
          product: product._id,
          serialNumber: cleanSn,
        });

        if (!serialDoc) {
          throw new Error(`Serial number '${cleanSn}' not found in system.`);
        }
        if (serialDoc.status !== "Available") {
          throw new Error(
            `Serial number '${cleanSn}' is not Available (Current status: '${serialDoc.status}').`
          );
        }
        cleanSerials.push(cleanSn);
      }
    }

    let itemUnitCost = await getPoolAverageCost(product._id, input.locationId, condition);
    if (!itemUnitCost || itemUnitCost === 0) {
      itemUnitCost = effective.costPrice || 0;
    }

    const lineTotal = unitPrice * itemInput.quantity - itemDiscount;
    const lineCost = itemUnitCost * itemInput.quantity;
    const grossProfit = lineTotal - lineCost;

    subtotal += lineTotal;
    totalCost += lineCost;

    processedItems.push({
      product: product._id as Types.ObjectId,
      productName: product.name,
      sku: product.sku,
      barcode: product.barcode,
      condition,
      quantity: itemInput.quantity,
      serialNumbers: cleanSerials,
      unitCost: itemUnitCost,
      unitPrice,
      minSellingPrice,
      discountAmount: itemDiscount,
      lineTotal,
      grossProfit,
    });
  }

  const headerDiscount = input.discountAmount || 0;
  const deliveryCharges = input.deliveryCharges || 0;
  const totalAmount = Math.max(0, subtotal - headerDiscount + deliveryCharges);
  const netProfit = totalAmount - totalCost;
  const saleNumber = await generateSaleNumber();

  let salesmanObjId: Types.ObjectId | undefined;
  if (input.salesmanId && Types.ObjectId.isValid(input.salesmanId)) {
    salesmanObjId = new Types.ObjectId(input.salesmanId);
  }

  let customerObjId: Types.ObjectId | undefined;
  if (input.customerId && Types.ObjectId.isValid(input.customerId)) {
    customerObjId = new Types.ObjectId(input.customerId);
  }

  const initialStatus =
    input.creationMode === "SALESMAN_CHECKOUT"
      ? "CHECKOUT"
      : "PAYMENT_PENDING";

  const sale = new Sale({
    saleNumber,
    creationMode: input.creationMode,
    saleSource: input.saleSource,
    location: location._id,
    locationName: location.name,
    salesman: salesmanObjId,
    salesmanName: input.salesmanName || undefined,
    customer: customerObjId,
    customerName: input.customerName || undefined,
    customerPhone: input.customerPhone || undefined,
    items: processedItems,
    subtotal,
    discountAmount: headerDiscount,
    taxAmount: 0,
    deliveryCharges,
    totalAmount,
    totalPaid: 0,
    balanceDue: totalAmount,
    totalCost,
    netProfit,
    status: initialStatus,
    notes: input.notes?.trim(),
    createdBy: input.createdBy,
  });

  await sale.save();
  return { isDuplicate: false, sale };
}

export interface CompleteSaleInput {
  saleId: string;
  completedBy: string;
  paymentAllocations: Array<{
    method: PaymentMethod;
    amount: number;
    referenceNumber?: string;
    notes?: string;
  }>;
  notes?: string;
}

/**
 * Executes atomic sale completion inside a SINGLE MongoDB Transaction session.
 * FAILS CLOSED if MongoDB Transactions are unsupported on server.
 */
export async function completeSale(input: CompleteSaleInput) {
  await dbConnect();

  // 1. Initial State Check & Recoverable PROCESSING Lock Acquisition
  const existingSale = await Sale.findById(input.saleId);
  if (!existingSale) {
    throw new Error("Sale record not found.");
  }

  if (existingSale.status === "COMPLETED") {
    const existingInvoice = await Invoice.findOne({ sale: existingSale._id });
    return { alreadyCompleted: true, sale: existingSale, invoice: existingInvoice };
  }

  if (existingSale.status === "CANCELLED") {
    throw new Error("Cannot complete a cancelled sale.");
  }

  const attemptId = `ATT-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const lockCutoff = new Date(Date.now() - 5 * 60 * 1000); // 5 mins stale cutoff

  const saleObjId = Types.ObjectId.isValid(input.saleId)
    ? new Types.ObjectId(input.saleId)
    : existingSale._id;

  const lockedSale = await Sale.findOneAndUpdate(
    {
      _id: saleObjId,
      $or: [
        { status: { $in: ["CHECKOUT", "DRAFT", "PAYMENT_PENDING"] } },
        { status: "PROCESSING", processingStartedAt: { $lt: lockCutoff } },
      ],
    },
    {
      $set: {
        status: "PROCESSING",
        processingStartedAt: new Date(),
        processingAttemptId: attemptId,
      },
    },
    { new: true }
  );

  if (!lockedSale) {
    // Check if already completed by another thread
    const rechecked = await Sale.findById(input.saleId);
    if (rechecked && rechecked.status === "COMPLETED") {
      const existingInvoice = await Invoice.findOne({ sale: rechecked._id });
      return { alreadyCompleted: true, sale: rechecked, invoice: existingInvoice };
    }
    throw new Error("Sale is currently being processed by another worker or is in an invalid state.");
  }

  // 2. Start Fail-Closed MongoDB Session Transaction
  const session = await mongoose.startSession();

  try {
    session.startTransaction();
  } catch (txError: any) {
    session.endSession();
    // Revert status from PROCESSING back to CHECKOUT
    await Sale.findByIdAndUpdate(input.saleId, { status: existingSale.status });
    throw new Error(
      `MongoDB transactions are unavailable on this server (${txError.message || "Standalone mode"}). Operations rejected (Fail-Closed Enforcement).`
    );
  }

  try {
    const sale = await Sale.findById(input.saleId).session(session);
    if (!sale) {
      throw new Error("Sale record disappeared during transaction.");
    }

    const location = await Location.findById(sale.location).session(session);
    if (!location) {
      throw new Error("Sale location not found.");
    }

    // 3. Verify Payment Allocations (including existing paid down-payments for advance bookings)
    const existingPayments = await Payment.find({ sale: sale._id, status: "PAID" }).session(session);
    const existingPaidTotal = existingPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    const totalAllocated = input.paymentAllocations.reduce((sum, p) => sum + Number(p.amount), 0);
    const grandTotalPaid = totalAllocated + existingPaidTotal;

    if (grandTotalPaid < sale.totalAmount - 0.5) {
      throw new Error(
        `Payment total (Rs. ${grandTotalPaid.toLocaleString()}) is less than required total amount (Rs. ${sale.totalAmount.toLocaleString()}).`
      );
    }

    // 4. Validate Inventory & Serials
    for (const item of sale.items) {
      const inv = await Inventory.findOne({
        product: item.product,
        location: sale.location,
        condition: item.condition,
      }).session(session);

      const currentQty = inv ? inv.quantity : 0;
      if (currentQty < item.quantity) {
        throw new Error(
          `Insufficient stock for '${item.productName}' (${item.condition}) at ${location.name}. Available: ${currentQty}, Required: ${item.quantity}`
        );
      }

      if (item.serialNumbers && item.serialNumbers.length > 0) {
        for (const sn of item.serialNumbers) {
          const serialDoc = await SerialNumber.findOne({
            product: item.product,
            serialNumber: sn,
          }).session(session);

          if (!serialDoc) {
            throw new Error(`Serial number '${sn}' not found.`);
          }
          if (serialDoc.status !== "Available" && serialDoc.status !== "Reserved") {
            throw new Error(
              `Serial number '${sn}' is no longer Available/Reserved (Current status: '${serialDoc.status}').`
            );
          }
        }
      }
    }

    // 5. Moving Average Cost Calculation & Inventory Deduction (Serialized + Non-Serialized)
    let recalculatedTotalCost = 0;
    const invoiceNumber = await generateInvoiceNumber();

    for (const item of sale.items) {
      const invBefore = await Inventory.findOne({
        product: item.product,
        location: sale.location,
        condition: item.condition,
      }).session(session);
      const beforeQty = invBefore ? invBefore.quantity : 0;

      const deductRes = await deductInventoryWithAverageCost(
        {
          productId: item.product,
          locationId: sale.location,
          condition: item.condition,
          quantity: item.quantity,
        },
        session
      );

      if (deductRes.unitCost > 0) {
        item.unitCost = deductRes.unitCost;
        item.grossProfit = item.lineTotal - deductRes.totalCost;
      }
      recalculatedTotalCost += item.unitCost * item.quantity;

      if (item.serialNumbers && item.serialNumbers.length > 0) {
        for (const sn of item.serialNumbers) {
          const serialDoc = await SerialNumber.findOne({
            product: item.product,
            serialNumber: sn,
          }).session(session);

          if (serialDoc) {
            serialDoc.status = "Sold";
            serialDoc.location = sale.customerName || "Customer";
            serialDoc.transactionReference = invoiceNumber;
            serialDoc.saleDate = new Date();
            await serialDoc.save({ session });
          }
        }
      }

      await new InventoryMovement({
        product: item.product,
        quantity: item.quantity,
        serialNumbers: item.serialNumbers || [],
        sourceLocation: location._id,
        sourceName: location.name,
        destinationName: sale.customerName || "Customer",
        type: "TRANSFER",
        referenceTransaction: invoiceNumber,
        beforeQuantity: beforeQty,
        afterQuantity: deductRes.remainingQty,
        performedBy: input.completedBy,
        condition: item.condition,
        date: new Date(),
        notes: `Sale Completed: Invoice ${invoiceNumber}`,
      }).save({ session });
    }

    sale.totalCost = recalculatedTotalCost;
    sale.netProfit = sale.totalAmount - recalculatedTotalCost;

    // 7. Create Invoice Document
    const invoice = new Invoice({
      invoiceNumber,
      sale: sale._id,
      saleNumber: sale.saleNumber,
      location: sale.location,
      locationName: location.name,
      customerName: sale.customerName,
      customerPhone: sale.customerPhone,
      salesmanName: sale.salesmanName,
      items: sale.items.map((it) => ({
        product: it.product,
        productName: it.productName,
        sku: it.sku,
        barcode: it.barcode,
        condition: it.condition,
        quantity: it.quantity,
        serialNumbers: it.serialNumbers,
        unitPrice: it.unitPrice,
        lineTotal: it.lineTotal,
      })),
      subtotal: sale.subtotal,
      discountAmount: sale.discountAmount,
      taxAmount: sale.taxAmount,
      deliveryCharges: sale.deliveryCharges,
      totalAmount: sale.totalAmount,
      paidAmount: totalAllocated,
      balanceDue: 0,
      billedBy: input.completedBy,
      printedCount: 0,
      status: "ISSUED",
    });
    await invoice.save({ session });

    // 8. Create Payment Records & Cash Movements
    const activeCashSession = await CashSession.findOne({
      location: sale.location,
      cashier: input.completedBy,
      status: "OPEN",
    }).session(session);

    for (const alloc of input.paymentAllocations) {
      const paymentNumber = await generatePaymentNumber();
      const payment = new Payment({
        paymentNumber,
        sale: sale._id,
        invoice: invoice._id,
        customer: sale.customer,
        location: sale.location,
        paymentMethod: alloc.method,
        amount: alloc.amount,
        referenceNumber: alloc.referenceNumber,
        notes: alloc.notes,
        receivedBy: input.completedBy,
        status: "PAID",
      });
      await payment.save({ session });

      // If CASH payment, record explicit CashMovement in cash drawer
      if (alloc.method === "CASH" && activeCashSession) {
        await recordCashMovement(
          {
            sessionId: activeCashSession._id.toString(),
            locationId: sale.location.toString(),
            cashier: input.completedBy,
            type: "CASH_SALE",
            amount: alloc.amount,
            direction: "IN",
            referenceType: "Sale",
            referenceId: invoiceNumber,
            notes: `Cash collection for Invoice ${invoiceNumber}`,
          },
          session
        );
      }
    }

    // 9. Record Customer Ledger Entries
    if (sale.customer) {
      await recordCustomerLedgerEntry(
        {
          customerId: sale.customer.toString(),
          type: "INVOICE",
          amount: sale.totalAmount,
          referenceType: "Sale",
          referenceId: invoiceNumber,
          notes: `Invoice issued: ${invoiceNumber}`,
          createdBy: input.completedBy,
        },
        session
      );

      await recordCustomerLedgerEntry(
        {
          customerId: sale.customer.toString(),
          type: "PAYMENT",
          amount: totalAllocated,
          referenceType: "Payment",
          referenceId: invoiceNumber,
          notes: `Payment for Invoice ${invoiceNumber}`,
          createdBy: input.completedBy,
        },
        session
      );
    }

    // 10. Mark Sale COMPLETED
    sale.status = "COMPLETED";
    sale.totalPaid = totalAllocated;
    sale.balanceDue = 0;
    sale.completedBy = input.completedBy;
    sale.paymentReceivedBy = input.completedBy;
    sale.billedBy = input.completedBy;
    sale.completedAt = new Date();
    if (input.notes) sale.notes = input.notes;

    await sale.save({ session });

    // Commit Transaction
    await session.commitTransaction();
    session.endSession();

    return { alreadyCompleted: false, sale, invoice };
  } catch (error: any) {
    await session.abortTransaction();
    session.endSession();

    // Revert status from PROCESSING back to CHECKOUT
    await Sale.findByIdAndUpdate(input.saleId, { status: existingSale.status });
    throw error;
  }
}
