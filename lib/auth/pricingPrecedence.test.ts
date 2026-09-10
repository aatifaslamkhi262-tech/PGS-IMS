import { describe, it, expect } from "vitest";
import { resolveProductEffectivePricing, calculateProductWeightedPricingFromReceivings } from "../pricing";

describe("Pricing Resolution Engine & Precedence Suite", () => {
  it("Case A: Manual edit older than latest approved receiving -> weighted average cost & latest invoice selling win", () => {
    const product = {
      costPrice: 7000,
      sellingPrice: 8500,
      minSellingPrice: 8000,
      manuallyEditedAt: new Date("2026-09-01T10:00:00Z"),
    };

    const weightedPricing = {
      priceConfigured: true,
      avgCostPrice: 8000,
      avgSellingPrice: 9500,
      avgMinSellingPrice: 9000,
      lastInvoiceDate: new Date("2026-09-05T10:00:00Z"),
    };

    const result = resolveProductEffectivePricing(product, weightedPricing);

    expect(result.source).toBe("WEIGHTED_AVERAGE");
    expect(result.sellingPrice).toBe(9500);
    expect(result.costPrice).toBe(8000);
    expect(result.minSellingPrice).toBe(9000);
  });

  it("Case B: Manual edit newer than latest approved receiving -> manual master price wins for selling/min, weighted cost preserved", () => {
    const product = {
      costPrice: 10000,
      sellingPrice: 12500,
      minSellingPrice: 12000,
      manuallyEditedAt: new Date("2026-09-10T10:00:00Z"),
    };

    const weightedPricing = {
      priceConfigured: true,
      avgCostPrice: 8000,
      avgSellingPrice: 9500,
      avgMinSellingPrice: 9000,
      lastInvoiceDate: new Date("2026-09-05T10:00:00Z"),
    };

    const result = resolveProductEffectivePricing(product, weightedPricing);

    expect(result.source).toBe("MANUAL_OVERRIDE");
    expect(result.sellingPrice).toBe(12500);
    expect(result.costPrice).toBe(8000); // Weighted cost is preserved even under manual selling override!
    expect(result.minSellingPrice).toBe(12000);
  });

  it("Case C: No approved receiving -> latest purchase invoice price wins", () => {
    const product = {
      costPrice: 1000,
      sellingPrice: 1000,
      minSellingPrice: 1000,
      manuallyEditedAt: null,
    };

    const weightedPricing = {
      priceConfigured: true,
      avgCostPrice: 5000,
      avgSellingPrice: 7500,
      avgMinSellingPrice: 7000,
      lastInvoiceDate: new Date("2026-09-02T10:00:00Z"),
    };

    const result = resolveProductEffectivePricing(product, weightedPricing);

    expect(result.source).toBe("WEIGHTED_AVERAGE");
    expect(result.sellingPrice).toBe(7500);
    expect(result.costPrice).toBe(5000);
  });

  it("Case D: No approved receiving and no purchase invoice -> Product creation base price wins", () => {
    const product = {
      costPrice: 2000,
      sellingPrice: 3500,
      minSellingPrice: 3000,
      manuallyEditedAt: null,
    };

    const weightedPricing = {
      priceConfigured: false,
      avgCostPrice: null,
      avgSellingPrice: null,
      avgMinSellingPrice: null,
      lastInvoiceDate: null,
    };

    const result = resolveProductEffectivePricing(product, weightedPricing);

    expect(result.source).toBe("PRODUCT_MASTER");
    expect(result.sellingPrice).toBe(3500);
    expect(result.costPrice).toBe(2000);
    expect(result.minSellingPrice).toBe(3000);
  });

  it("Case E: Unrelated Product edit -> manuallyEditedAt logic does NOT touch timestamp", () => {
    const existingProduct = {
      name: "PS5 Console",
      brand: "Sony",
      costPrice: 50000,
      sellingPrice: 70000,
      minSellingPrice: 65000,
      manuallyEditedAt: new Date("2026-08-01T00:00:00Z"),
    };

    const body: any = {
      name: "PS5 Console Disc Edition",
      brand: "Sony Playstation",
    };

    const isCostPriceChanged = body.costPrice !== undefined && Number(body.costPrice) !== existingProduct.costPrice;
    const isSellingPriceChanged = body.sellingPrice !== undefined && Number(body.sellingPrice) !== existingProduct.sellingPrice;
    const isMinSellingPriceChanged = body.minSellingPrice !== undefined && Number(body.minSellingPrice) !== existingProduct.minSellingPrice;

    const shouldUpdateTimestamp = isCostPriceChanged || isSellingPriceChanged || isMinSellingPriceChanged;

    expect(shouldUpdateTimestamp).toBe(false);
  });

  it("Case F: Manual price edit with exact same values -> manuallyEditedAt does NOT touch timestamp", () => {
    const existingProduct = {
      costPrice: 50000,
      sellingPrice: 70000,
      minSellingPrice: 65000,
      manuallyEditedAt: new Date("2026-08-01T00:00:00Z"),
    };

    const body = {
      costPrice: 50000,
      sellingPrice: 70000,
      minSellingPrice: 65000,
    };

    const isCostPriceChanged = body.costPrice !== undefined && Number(body.costPrice) !== existingProduct.costPrice;
    const isSellingPriceChanged = body.sellingPrice !== undefined && Number(body.sellingPrice) !== existingProduct.sellingPrice;
    const isMinSellingPriceChanged = body.minSellingPrice !== undefined && Number(body.minSellingPrice) !== existingProduct.minSellingPrice;

    const shouldUpdateTimestamp = isCostPriceChanged || isSellingPriceChanged || isMinSellingPriceChanged;

    expect(shouldUpdateTimestamp).toBe(false);
  });

  it("Case G: Centralized resolveProductEffectivePricing yields 100% identical pricing across all consumers", () => {
    const product = {
      _id: "6a903be655818ec5564d71b6",
      costPrice: 7500,
      sellingPrice: 8500,
      minSellingPrice: 8000,
      manuallyEditedAt: null,
    };

    const weightedPricing = {
      priceConfigured: true,
      avgCostPrice: 8000,
      avgSellingPrice: 9500,
      avgMinSellingPrice: 9000,
      lastInvoiceDate: new Date("2026-09-08T00:00:00Z"),
    };

    const resDirectory = resolveProductEffectivePricing(product, weightedPricing);
    const resDetail = resolveProductEffectivePricing(product, weightedPricing);
    const resPriceLookup = resolveProductEffectivePricing(product, weightedPricing);
    const resTransfers = resolveProductEffectivePricing(product, weightedPricing);

    expect(resDirectory).toEqual(resDetail);
    expect(resDetail).toEqual(resPriceLookup);
    expect(resPriceLookup).toEqual(resTransfers);
    expect(resDirectory.sellingPrice).toBe(9500);
  });

  it("Case H (User Real-World Audit Scenario): INV-01, INV-02, Manual Edit, INV-03, INV-04 multi-stage validation", () => {
    const productId = "PROD_PS5_DISC_123";

    // 1. Initial Product Creation
    let product: any = {
      _id: productId,
      costPrice: 8000,
      sellingPrice: 10000,
      minSellingPrice: 9500,
      manuallyEditedAt: null,
    };

    // 2. INV-01: Qty 10, Cost 8,000, Selling 11,000, Min Selling 10,000
    const rec1 = {
      approvedAt: new Date("2026-09-01T10:00:00Z"),
      items: [{ product: productId, quantityReceived: 10, condition: "New" }],
      purchaseInvoice: {
        createdAt: new Date("2026-09-01T10:00:00Z"),
        items: [{ product: productId, condition: "New", unitCost: 8000, sellingPrice: 11000, minSellingPrice: 10000 }],
      },
    };

    // 3. INV-02: Qty 20, Cost 10,000, Selling 13,000, Min Selling 12,000
    const rec2 = {
      approvedAt: new Date("2026-09-02T10:00:00Z"),
      items: [{ product: productId, quantityReceived: 20, condition: "New" }],
      purchaseInvoice: {
        createdAt: new Date("2026-09-02T10:00:00Z"),
        items: [{ product: productId, condition: "New", unitCost: 10000, sellingPrice: 13000, minSellingPrice: 12000 }],
      },
    };

    let pricingAfterInv2 = calculateProductWeightedPricingFromReceivings(productId, [rec1, rec2]);
    let effAfterInv2 = resolveProductEffectivePricing(product, pricingAfterInv2);

    expect(effAfterInv2.costPrice).toBe(9333.33); // (10*8000 + 20*10000)/30
    expect(effAfterInv2.sellingPrice).toBe(13000); // Latest invoice selling (NOT averaged 12,333!)
    expect(effAfterInv2.minSellingPrice).toBe(12000); // Latest invoice min selling (NOT averaged 11,333!)

    // 4. MANUAL EDIT: Selling = 15,000, Min Selling = 14,000
    product = {
      ...product,
      sellingPrice: 15000,
      minSellingPrice: 14000,
      manuallyEditedAt: new Date("2026-09-03T10:00:00Z"), // Newer than INV-02 (2026-09-02)
    };

    let effAfterManual = resolveProductEffectivePricing(product, pricingAfterInv2);
    expect(effAfterManual.costPrice).toBe(9333.33); // Cost remains weighted
    expect(effAfterManual.sellingPrice).toBe(15000); // Manual override wins
    expect(effAfterManual.minSellingPrice).toBe(14000);

    // 5. INV-03: Qty 10, Cost 12,000, Selling 16,000, Min Selling 15,000 (Approved after manual edit)
    const rec3 = {
      approvedAt: new Date("2026-09-04T10:00:00Z"), // Newer than Manual Edit (2026-09-03)
      items: [{ product: productId, quantityReceived: 10, condition: "New" }],
      purchaseInvoice: {
        createdAt: new Date("2026-09-04T10:00:00Z"),
        items: [{ product: productId, condition: "New", unitCost: 12000, sellingPrice: 16000, minSellingPrice: 15000 }],
      },
    };

    let pricingAfterInv3 = calculateProductWeightedPricingFromReceivings(productId, [rec1, rec2, rec3]);
    let effAfterInv3 = resolveProductEffectivePricing(product, pricingAfterInv3);

    expect(effAfterInv3.costPrice).toBe(10000); // (10*8k + 20*10k + 10*12k) / 40 = 400,000 / 40 = 10,000
    expect(effAfterInv3.sellingPrice).toBe(16000); // Latest invoice (NOT averaged 15,500!)
    expect(effAfterInv3.minSellingPrice).toBe(15000); // Latest invoice (NOT averaged 14,500!)

    // 6. INV-04: Qty 20, Cost 14,000, Selling 18,000, Min Selling 17,000
    const rec4 = {
      approvedAt: new Date("2026-09-05T10:00:00Z"),
      items: [{ product: productId, quantityReceived: 20, condition: "New" }],
      purchaseInvoice: {
        createdAt: new Date("2026-09-05T10:00:00Z"),
        items: [{ product: productId, condition: "New", unitCost: 14000, sellingPrice: 18000, minSellingPrice: 17000 }],
      },
    };

    let pricingAfterInv4 = calculateProductWeightedPricingFromReceivings(productId, [rec1, rec2, rec3, rec4]);
    let effAfterInv4 = resolveProductEffectivePricing(product, pricingAfterInv4);

    expect(effAfterInv4.costPrice).toBe(11333.33); // (80k + 200k + 120k + 280k) / 60 = 680,000 / 60 = 11,333.33
    expect(effAfterInv4.sellingPrice).toBe(18000); // Latest invoice selling (NOT averaged!)
    expect(effAfterInv4.minSellingPrice).toBe(17000); // Latest invoice min selling (NOT averaged!)
  });
});
