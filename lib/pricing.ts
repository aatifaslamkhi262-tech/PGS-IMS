import { dbConnect } from "@/lib/db";
import { PurchaseReceiving } from "@/models/PurchaseReceiving";
import { PurchaseInvoice } from "@/models/PurchaseInvoice";

export interface WeightedPricingResult {
  priceConfigured: boolean;
  avgCostPrice: number | null;
  avgSellingPrice: number | null;
  avgMinSellingPrice: number | null;
  lastInvoiceDate?: Date | string | null;
}

export interface EffectivePricing {
  costPrice: number;
  sellingPrice: number;
  minSellingPrice: number;
  source: "MANUAL_OVERRIDE" | "WEIGHTED_AVERAGE" | "LATEST_INVOICE" | "PRODUCT_MASTER";
}

/**
 * Single centralized resolution engine for effective product pricing.
 * Enforces the standardized precedence rules across ALL product endpoints.
 */
export function resolveProductEffectivePricing(
  product: {
    costPrice?: number;
    sellingPrice?: number;
    minSellingPrice?: number;
    manuallyEditedAt?: Date | string | null;
  },
  weightedPricing?: WeightedPricingResult | null
): EffectivePricing {
  const manualDate = product?.manuallyEditedAt ? new Date(product.manuallyEditedAt).getTime() : 0;
  const invoiceDate = weightedPricing?.lastInvoiceDate ? new Date(weightedPricing.lastInvoiceDate).getTime() : 0;

  // Case B: Manual edit exists AND manual edit timestamp is NEWER than latest invoice/receiving date
  if (manualDate > 0 && manualDate > invoiceDate) {
    return {
      costPrice: (weightedPricing?.priceConfigured && weightedPricing.avgCostPrice !== null && weightedPricing.avgCostPrice !== undefined)
        ? weightedPricing.avgCostPrice
        : (product?.costPrice ?? 0),
      sellingPrice: product?.sellingPrice ?? 0,
      minSellingPrice: product?.minSellingPrice ?? 0,
      source: "MANUAL_OVERRIDE",
    };
  }

  // Case A / C: Approved receiving or latest invoice pricing exists
  if (weightedPricing?.priceConfigured) {
    const cost = (weightedPricing.avgCostPrice !== null && weightedPricing.avgCostPrice !== undefined)
      ? weightedPricing.avgCostPrice
      : ((product?.costPrice && product.costPrice > 1) ? product.costPrice : 0);
    
    const selling = (weightedPricing.avgSellingPrice !== null && weightedPricing.avgSellingPrice !== undefined)
      ? weightedPricing.avgSellingPrice
      : (product?.sellingPrice || 0);

    const minSelling = (weightedPricing.avgMinSellingPrice !== null && weightedPricing.avgMinSellingPrice !== undefined)
      ? weightedPricing.avgMinSellingPrice
      : (product?.minSellingPrice || 0);

    return {
      costPrice: cost,
      sellingPrice: selling,
      minSellingPrice: minSelling,
      source: invoiceDate > 0 ? "WEIGHTED_AVERAGE" : "LATEST_INVOICE",
    };
  }

  // Case D: Product creation base price
  return {
    costPrice: product?.costPrice ?? 0,
    sellingPrice: product?.sellingPrice ?? 0,
    minSellingPrice: product?.minSellingPrice ?? 0,
    source: "PRODUCT_MASTER",
  };
}

/**
 * Calculates dynamic, quantity-weighted average purchase cost, and extracts the latest (newest)
 * selling price and minimum selling price using only APPROVED physical receiving transactions.
 */
export function calculateProductWeightedPricingFromReceivings(
  productId: string,
  receivings: any[]
): WeightedPricingResult {
  let totalQty = 0;
  let totalCostAmount = 0;
  let maxDate: Date | null = null;
  let latestSellingPrice: number | null = null;
  let latestMinSellingPrice: number | null = null;

  for (const r of receivings) {
    const invoice = r.purchaseInvoice as any;
    if (!invoice) continue;

    // Find the item in receiving
    const receivingItem = (r.items || []).find((it: any) => it.product && it.product.toString() === productId);
    if (!receivingItem) continue;

    // Find matching item in purchase invoice
    const invoiceItem = (invoice.items || []).find(
      (it: any) => it.product && it.product.toString() === productId && it.condition === receivingItem.condition
    );
    if (!invoiceItem) continue;

    const qty = receivingItem.quantityReceived || 0;
    totalQty += qty;
    totalCostAmount += qty * (invoiceItem.unitCost || 0);

    const recDate = r.approvedAt || r.updatedAt || r.createdAt || invoice.createdAt;
    const parsedDate = recDate ? new Date(recDate) : null;

    if (!maxDate || (parsedDate && parsedDate >= maxDate)) {
      maxDate = parsedDate;
      if (invoiceItem.sellingPrice !== undefined && invoiceItem.sellingPrice !== null) {
        latestSellingPrice = invoiceItem.sellingPrice;
      }
      if (invoiceItem.minSellingPrice !== undefined && invoiceItem.minSellingPrice !== null) {
        latestMinSellingPrice = invoiceItem.minSellingPrice;
      }
    }
  }

  if (totalQty === 0) {
    return {
      priceConfigured: false,
      avgCostPrice: null,
      avgSellingPrice: null,
      avgMinSellingPrice: null,
      lastInvoiceDate: null,
    };
  }

  return {
    priceConfigured: true,
    avgCostPrice: Math.round((totalCostAmount / totalQty) * 100) / 100,
    avgSellingPrice: latestSellingPrice,
    avgMinSellingPrice: latestMinSellingPrice,
    lastInvoiceDate: maxDate,
  };
}

/**
 * Calculates dynamic, quantity-weighted average purchase cost, and extracts the latest (newest)
 * selling price and minimum selling price using only APPROVED physical receiving transactions.
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

  const result = calculateProductWeightedPricingFromReceivings(productId, receivings);
  if (!result.priceConfigured) {
    return getPricingFromLatestInvoice(productId);
  }

  return result;
}

/**
 * Batch calculates dynamic, quantity-weighted average purchase cost, and extracts latest
 * selling price and minimum selling price for multiple product IDs in 1-2 optimized MongoDB queries.
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

  // Map product -> aggregated qty, totalCost, maxDate, latestSellingPrice, latestMinSellingPrice
  const statsMap: Record<
    string,
    {
      totalQty: number;
      totalCost: number;
      maxDate: Date | null;
      latestSellingPrice: number | null;
      latestMinSellingPrice: number | null;
    }
  > = {};

  for (const r of receivings) {
    const invoice = r.purchaseInvoice as any;
    if (!invoice || !Array.isArray(invoice.items)) continue;

    const recDate = r.approvedAt || r.updatedAt || r.createdAt || invoice.createdAt;
    const parsedDate = recDate ? new Date(recDate) : null;

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
        statsMap[pStr] = {
          totalQty: 0,
          totalCost: 0,
          maxDate: null,
          latestSellingPrice: null,
          latestMinSellingPrice: null,
        };
      }
      statsMap[pStr].totalQty += qty;
      statsMap[pStr].totalCost += qty * (invoiceItem.unitCost || 0);

      if (!statsMap[pStr].maxDate || (parsedDate && parsedDate >= statsMap[pStr].maxDate!)) {
        statsMap[pStr].maxDate = parsedDate;
        if (invoiceItem.sellingPrice !== undefined && invoiceItem.sellingPrice !== null) {
          statsMap[pStr].latestSellingPrice = invoiceItem.sellingPrice;
        }
        if (invoiceItem.minSellingPrice !== undefined && invoiceItem.minSellingPrice !== null) {
          statsMap[pStr].latestMinSellingPrice = invoiceItem.minSellingPrice;
        }
      }
    }
  }

  // 2. For products that didn't have approved receiving, find latest PurchaseInvoice
  const missingProductIds = validIds.filter((id) => !statsMap[id] || statsMap[id].totalQty === 0);

  let fallbackInvoiceMap: Record<string, { unitCost: number; sellingPrice: number; minSellingPrice: number; date: Date | null }> = {};
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
            date: (inv as any).createdAt ? new Date((inv as any).createdAt) : null,
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
        avgSellingPrice: stats.latestSellingPrice,
        avgMinSellingPrice: stats.latestMinSellingPrice,
        lastInvoiceDate: stats.maxDate,
      };
    } else if (fallbackInvoiceMap[id]) {
      const fb = fallbackInvoiceMap[id];
      results[id] = {
        priceConfigured: true,
        avgCostPrice: fb.unitCost,
        avgSellingPrice: fb.sellingPrice,
        avgMinSellingPrice: fb.minSellingPrice,
        lastInvoiceDate: fb.date,
      };
    } else {
      results[id] = {
        priceConfigured: false,
        avgCostPrice: null,
        avgSellingPrice: null,
        avgMinSellingPrice: null,
        lastInvoiceDate: null,
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
      lastInvoiceDate: null,
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
        lastInvoiceDate: (latestInvoice as any).createdAt ? new Date((latestInvoice as any).createdAt) : null,
      };
    }
  }

  return {
    priceConfigured: false,
    avgCostPrice: null,
    avgSellingPrice: null,
    avgMinSellingPrice: null,
    lastInvoiceDate: null,
  };
}
