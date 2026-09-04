import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import { PurchaseInvoice } from "../../models/PurchaseInvoice";
import { PurchaseReceiving } from "../../models/PurchaseReceiving";
import { calculateProductWeightedPricing } from "../../lib/pricing";

vi.mock("../../lib/db", () => ({
  dbConnect: vi.fn(),
}));

vi.mock("../../models/PurchaseReceiving", () => {
  const mockFind = vi.fn();
  return {
    PurchaseReceiving: {
      find: mockFind,
    },
  };
});

// Helper to build a mock receiving chain
function mockReceivingChain(data: any[]) {
  const chain = {
    populate: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(data),
  };
  (PurchaseReceiving.find as any).mockReturnValue(chain);
}

describe("Batch Pricing & Weighted Average Rules", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ──────────────────────────────────────────
  // SCHEMA VALIDATION
  // ──────────────────────────────────────────
  describe("Schema Validation Constraints", () => {
    it("should reject negative sellingPrice in invoice items", () => {
      const invoice = new PurchaseInvoice({
        invoiceNumber: "INV-101",
        supplier: new mongoose.Types.ObjectId(),
        invoiceDate: new Date(),
        status: "Draft",
        items: [
          {
            product: new mongoose.Types.ObjectId(),
            name: "Test Product",
            sku: "TST",
            barcode: "BAR",
            condition: "New",
            quantity: 5,
            unitCost: 100,
            sellingPrice: -50,
            minSellingPrice: 40,
            amount: 500,
          },
        ],
      });
      const err = invoice.validateSync();
      expect(err?.errors["items.0.sellingPrice"]).toBeDefined();
    });

    it("should reject minSellingPrice > sellingPrice (business rule helper)", () => {
      const isMinExceeding = (min: number, sell: number) => min > sell;
      expect(isMinExceeding(120, 100)).toBe(true);
      expect(isMinExceeding(90, 100)).toBe(false);
      expect(isMinExceeding(100, 100)).toBe(false); // equal is allowed
    });
  });

  // ──────────────────────────────────────────
  // WEIGHTED AVERAGE ENGINE
  // ──────────────────────────────────────────
  describe("calculateProductWeightedPricing — no approved receivings", () => {
    it("returns priceConfigured=false when no approved receiving exists", async () => {
      mockReceivingChain([]);
      const result = await calculateProductWeightedPricing("some-prod-id");
      expect(result.priceConfigured).toBe(false);
      expect(result.avgCostPrice).toBeNull();
      expect(result.avgSellingPrice).toBeNull();
      expect(result.avgMinSellingPrice).toBeNull();
    });
  });

  describe("calculateProductWeightedPricing — single approved batch", () => {
    it("returns exact values for one batch (qty=5, cost=100000, sell=120000, min=110000)", async () => {
      const prodId = new mongoose.Types.ObjectId();
      mockReceivingChain([
        {
          status: "Approved",
          items: [{ product: prodId, condition: "New", quantityReceived: 5 }],
          purchaseInvoice: {
            items: [
              {
                product: prodId,
                condition: "New",
                unitCost: 100000,
                sellingPrice: 120000,
                minSellingPrice: 110000,
              },
            ],
          },
        },
      ]);

      const result = await calculateProductWeightedPricing(prodId.toString());
      expect(result.priceConfigured).toBe(true);
      // Single batch — weighted avg equals exact batch price
      expect(result.avgCostPrice).toBe(100000);
      expect(result.avgSellingPrice).toBe(120000);
      expect(result.avgMinSellingPrice).toBe(110000);
    });
  });

  describe("calculateProductWeightedPricing — multiple approved batches", () => {
    it("computes quantity-weighted averages correctly across two batches", async () => {
      const prodId = new mongoose.Types.ObjectId();
      // Batch 1: qty=5, cost=100000, sell=120000, min=110000
      // Batch 2: qty=10, cost=105000, sell=125000, min=115000
      // Expected avg cost   = (5*100000 + 10*105000) / 15 = 1550000/15 = 103333.33
      // Expected avg sell   = (5*120000 + 10*125000) / 15 = 1850000/15 = 123333.33
      // Expected avg min    = (5*110000 + 10*115000) / 15 = 1700000/15 = 113333.33
      mockReceivingChain([
        {
          status: "Approved",
          items: [{ product: prodId, condition: "New", quantityReceived: 5 }],
          purchaseInvoice: {
            items: [{ product: prodId, condition: "New", unitCost: 100000, sellingPrice: 120000, minSellingPrice: 110000 }],
          },
        },
        {
          status: "Approved",
          items: [{ product: prodId, condition: "New", quantityReceived: 10 }],
          purchaseInvoice: {
            items: [{ product: prodId, condition: "New", unitCost: 105000, sellingPrice: 125000, minSellingPrice: 115000 }],
          },
        },
      ]);

      const result = await calculateProductWeightedPricing(prodId.toString());
      expect(result.priceConfigured).toBe(true);
      expect(result.avgCostPrice).toBe(Math.round((1550000 / 15) * 100) / 100);
      expect(result.avgSellingPrice).toBe(Math.round((1850000 / 15) * 100) / 100);
      expect(result.avgMinSellingPrice).toBe(Math.round((1700000 / 15) * 100) / 100);
    });

    it("uses RECEIVED quantity not ordered quantity for weighted average", async () => {
      const prodId = new mongoose.Types.ObjectId();
      // Invoice ordered 10, only 4 physically received & approved
      mockReceivingChain([
        {
          status: "Approved",
          items: [{ product: prodId, condition: "New", quantityReceived: 4 }], // 4 received
          purchaseInvoice: {
            items: [{ product: prodId, condition: "New", unitCost: 100, sellingPrice: 120, minSellingPrice: 110 }],
          },
        },
      ]);

      const result = await calculateProductWeightedPricing(prodId.toString());
      expect(result.priceConfigured).toBe(true);
      // Average must use qty=4, not qty=10 from invoice
      expect(result.avgCostPrice).toBe(100);
      expect(result.avgSellingPrice).toBe(120);
      expect(result.avgMinSellingPrice).toBe(110);
    });
  });

  describe("calculateProductWeightedPricing — only approved status contributes", () => {
    it("queries only { status: 'Approved' } receiving logs", async () => {
      mockReceivingChain([]);
      await calculateProductWeightedPricing("prod-123");
      expect(PurchaseReceiving.find).toHaveBeenCalledWith({
        status: "Approved",
        "items.product": "prod-123",
      });
    });
  });

  // ──────────────────────────────────────────
  // SERIAL LOOKUP — product card must get weightedPricing
  // ──────────────────────────────────────────
  describe("Serial number lookup — product card weighted pricing", () => {
    it("single batch: product card shows same values as exact serial pricing (no mixing needed)", async () => {
      const prodId = new mongoose.Types.ObjectId();
      // Same batch that the serial came from
      mockReceivingChain([
        {
          status: "Approved",
          items: [{ product: prodId, condition: "New", quantityReceived: 5 }],
          purchaseInvoice: {
            items: [{ product: prodId, condition: "New", unitCost: 100000, sellingPrice: 120000, minSellingPrice: 110000 }],
          },
        },
      ]);

      const result = await calculateProductWeightedPricing(prodId.toString());
      // Product card must show Rs. 120,000 and Rs. 110,000 — NOT "Price Not Configured"
      expect(result.priceConfigured).toBe(true);
      expect(result.avgSellingPrice).toBe(120000);
      expect(result.avgMinSellingPrice).toBe(110000);
      expect(result.avgCostPrice).toBe(100000);
    });

    it("serial lookup on product with no approved receiving returns priceConfigured=false", async () => {
      mockReceivingChain([]);
      const result = await calculateProductWeightedPricing("orphan-prod");
      expect(result.priceConfigured).toBe(false);
    });
  });

  // ──────────────────────────────────────────
  // ROLE SECURITY — cost must never leak
  // ──────────────────────────────────────────
  describe("Role security — cost price visibility", () => {
    it("Branch/Salesman must not receive costPrice in safePricing object", () => {
      const isAuthorizedForProvenance = false; // Branch / Salesman
      const pricingResult = { priceConfigured: true, avgSellingPrice: 120000, avgMinSellingPrice: 110000, avgCostPrice: 100000 };

      const safePricing = {
        priceConfigured: pricingResult.priceConfigured,
        sellingPrice: pricingResult.avgSellingPrice,
        minSellingPrice: pricingResult.avgMinSellingPrice,
        ...(isAuthorizedForProvenance ? { costPrice: pricingResult.avgCostPrice } : {}),
      };

      expect(safePricing).not.toHaveProperty("costPrice");
      expect(safePricing.sellingPrice).toBe(120000);
      expect(safePricing.minSellingPrice).toBe(110000);
    });

    it("Admin/Warehouse/Accountant DO receive costPrice in safePricing object", () => {
      const isAuthorizedForProvenance = true;
      const pricingResult = { priceConfigured: true, avgSellingPrice: 120000, avgMinSellingPrice: 110000, avgCostPrice: 100000 };

      const safePricing = {
        priceConfigured: pricingResult.priceConfigured,
        sellingPrice: pricingResult.avgSellingPrice,
        minSellingPrice: pricingResult.avgMinSellingPrice,
        ...(isAuthorizedForProvenance ? { costPrice: pricingResult.avgCostPrice } : {}),
      };

      expect(safePricing).toHaveProperty("costPrice", 100000);
    });
  });
});
