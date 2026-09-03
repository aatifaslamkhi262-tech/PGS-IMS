import { dbConnect } from "@/lib/db";
import { PurchaseReceiving } from "@/models/PurchaseReceiving";
import { PurchaseInvoice } from "@/models/PurchaseInvoice";

export interface WeightedPricingResult {
  priceConfigured: boolean;
  avgCostPrice: number | null;
  avgSellingPrice: number | null;
  avgMinSellingPrice: number | null;
}

/**
 * Calculates dynamic, quantity-weighted average purchase cost, selling price, and minimum selling price
 * using only APPROVED physical receiving transactions.
 */
export async function calculateProductWeightedPricing(productId: string): Promise<WeightedPricingResult> {
  await dbConnect();

  const receivings = await PurchaseReceiving.find({
    status: "Approved",
    "items.product": productId,
  })
    .populate({
      path: "purchaseInvoice",
    })
    .lean();

  if (receivings.length === 0) {
    return getPricingFromLatestInvoice(productId);
  }

  let totalQty = 0;
  let totalCostAmount = 0;
  let totalSellingAmount = 0;
  let totalMinSellingAmount = 0;

  for (const r of receivings) {
    const invoice = r.purchaseInvoice as any;
    if (!invoice) continue;

    // Find the item in receiving
    const receivingItem = r.items.find((it: any) => it.product.toString() === productId);
    if (!receivingItem) continue;

    // Find matching item in purchase invoice
    const invoiceItem = invoice.items.find(
      (it: any) => it.product.toString() === productId && it.condition === receivingItem.condition
    );
    if (!invoiceItem) continue;

    const qty = receivingItem.quantityReceived;
    totalQty += qty;
    totalCostAmount += qty * (invoiceItem.unitCost || 0);
    totalSellingAmount += qty * (invoiceItem.sellingPrice || 0);
    totalMinSellingAmount += qty * (invoiceItem.minSellingPrice || 0);
  }

  if (totalQty === 0) {
    return getPricingFromLatestInvoice(productId);
  }

  return {
    priceConfigured: true,
    avgCostPrice: Math.round((totalCostAmount / totalQty) * 100) / 100,
    avgSellingPrice: Math.round((totalSellingAmount / totalQty) * 100) / 100,
    avgMinSellingPrice: Math.round((totalMinSellingAmount / totalQty) * 100) / 100,
  };
}

/**
 * Fallback pricing function when no approved physical receiving exists yet.
 * Looks up the most recent PurchaseInvoice created for this product.
 */
async function getPricingFromLatestInvoice(productId: string): Promise<WeightedPricingResult> {
  const latestInvoice = await PurchaseInvoice.findOne({
    "items.product": productId,
  })
    .sort({ createdAt: -1 })
    .lean();

  if (latestInvoice && Array.isArray(latestInvoice.items)) {
    const item = latestInvoice.items.find(
      (it: any) => it.product.toString() === productId
    );
    if (item) {
      return {
        priceConfigured: true,
        avgCostPrice: item.unitCost || 0,
        avgSellingPrice: item.sellingPrice || 0,
        avgMinSellingPrice: item.minSellingPrice || 0,
      };
    }
  }

  return {
    priceConfigured: false,
    avgCostPrice: null,
    avgSellingPrice: null,
    avgMinSellingPrice: null,
  };
}
