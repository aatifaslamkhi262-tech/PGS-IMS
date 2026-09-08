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
 * Batch calculates dynamic, quantity-weighted average purchase cost, selling price, and minimum selling price
 * for multiple product IDs in 1-2 optimized MongoDB queries instead of N+1 serial queries.
 */
export async function batchCalculateProductWeightedPricing(
  productIds: string[]
): Promise<Record<string, WeightedPricingResult>> {
  await dbConnect();
  const results: Record<string, WeightedPricingResult> = {};

  if (!productIds || productIds.length === 0) return results;

  const validIds = productIds.filter((id) => id && id.length === 24);
  if (validIds.length === 0) return results;

  // 1. Bulk find all approved receivings for all productIds
  const receivings = await PurchaseReceiving.find({
    status: "Approved",
    "items.product": { $in: validIds },
  })
    .populate("purchaseInvoice")
    .lean();

  // Map product -> aggregated qty & amounts
  const statsMap: Record<
    string,
    { totalQty: number; totalCost: number; totalSelling: number; totalMinSelling: number }
  > = {};

  for (const r of receivings) {
    const invoice = r.purchaseInvoice as any;
    if (!invoice || !Array.isArray(invoice.items)) continue;

    for (const receivingItem of r.items) {
      if (!receivingItem || !receivingItem.product) continue;
      const pStr = receivingItem.product.toString();
      if (!validIds.includes(pStr)) continue;

      const invoiceItem = invoice.items.find(
        (it: any) =>
          it.product &&
          it.product.toString() === pStr &&
          it.condition === receivingItem.condition
      );
      if (!invoiceItem) continue;

      const qty = receivingItem.quantityReceived || 0;
      if (!statsMap[pStr]) {
        statsMap[pStr] = { totalQty: 0, totalCost: 0, totalSelling: 0, totalMinSelling: 0 };
      }
      statsMap[pStr].totalQty += qty;
      statsMap[pStr].totalCost += qty * (invoiceItem.unitCost || 0);
      statsMap[pStr].totalSelling += qty * (invoiceItem.sellingPrice || 0);
      statsMap[pStr].totalMinSelling += qty * (invoiceItem.minSellingPrice || 0);
    }
  }

  // 2. For products that didn't have approved receiving, find latest PurchaseInvoice
  const missingProductIds = validIds.filter((id) => !statsMap[id] || statsMap[id].totalQty === 0);

  let fallbackInvoiceMap: Record<string, { unitCost: number; sellingPrice: number; minSellingPrice: number }> = {};
  if (missingProductIds.length > 0) {
    const invoices = await PurchaseInvoice.find({
      "items.product": { $in: missingProductIds },
    })
      .sort({ createdAt: -1 })
      .lean();

    for (const inv of invoices) {
      if (!Array.isArray(inv.items)) continue;
      for (const item of inv.items) {
        if (!item || !item.product) continue;
        const pStr = item.product.toString();
        if (missingProductIds.includes(pStr) && !fallbackInvoiceMap[pStr]) {
          fallbackInvoiceMap[pStr] = {
            unitCost: item.unitCost || 0,
            sellingPrice: item.sellingPrice || 0,
            minSellingPrice: item.minSellingPrice || 0,
          };
        }
      }
    }
  }

  // 3. Build result for every requested productId
  for (const id of validIds) {
    const stats = statsMap[id];
    if (stats && stats.totalQty > 0) {
      results[id] = {
        priceConfigured: true,
        avgCostPrice: Math.round((stats.totalCost / stats.totalQty) * 100) / 100,
        avgSellingPrice: Math.round((stats.totalSelling / stats.totalQty) * 100) / 100,
        avgMinSellingPrice: Math.round((stats.totalMinSelling / stats.totalQty) * 100) / 100,
      };
    } else if (fallbackInvoiceMap[id]) {
      const fb = fallbackInvoiceMap[id];
      results[id] = {
        priceConfigured: true,
        avgCostPrice: fb.unitCost,
        avgSellingPrice: fb.sellingPrice,
        avgMinSellingPrice: fb.minSellingPrice,
      };
    } else {
      results[id] = {
        priceConfigured: false,
        avgCostPrice: null,
        avgSellingPrice: null,
        avgMinSellingPrice: null,
      };
    }
  }

  return results;
}

/**
 * Fallback pricing function when no approved physical receiving exists yet.
 * Looks up the most recent PurchaseInvoice created for this product.
 */
async function getPricingFromLatestInvoice(productId: string): Promise<WeightedPricingResult> {
  const { default: mongoose } = await import("mongoose");
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return {
      priceConfigured: false,
      avgCostPrice: null,
      avgSellingPrice: null,
      avgMinSellingPrice: null,
    };
  }

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
