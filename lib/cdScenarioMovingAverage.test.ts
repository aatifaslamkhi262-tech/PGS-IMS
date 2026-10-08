import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import { batchCalculateProductWeightedPricing } from "./pricing";
import { Product } from "@/models/Product";
import { PurchaseReceiving } from "@/models/PurchaseReceiving";
import { Inventory } from "@/models/Inventory";

vi.mock("@/lib/db", () => ({
  dbConnect: vi.fn(),
}));

vi.mock("@/models/Product", () => {
  return {
    Product: {
      find: vi.fn(),
    },
  };
});

vi.mock("@/models/PurchaseReceiving", () => {
  return {
    PurchaseReceiving: {
      find: vi.fn(),
    },
  };
});

vi.mock("@/models/Inventory", () => {
  return {
    Inventory: {
      aggregate: vi.fn(),
    },
  };
});

describe("CD Scenario Moving Average Cost Test", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("CD scenario: 1500, 2000, sale, 2500 -> batchCalculateProductWeightedPricing must return 2125 from Inventory, not cumulative 2000", async () => {
    const prodId = new mongoose.Types.ObjectId();
    const prodIdStr = prodId.toString();

    // 1. Mock Product
    (Product.find as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            _id: prodId,
            costPrice: 1,
            condition: "New",
            manuallyEditedAt: null,
          },
        ]),
      }),
    });

    // 2. Mock 3 Approved Receivings: 1500, 2000, 2500
    const mockReceivings = [
      {
        status: "Approved",
        approvedAt: new Date("2026-09-01"),
        items: [{ product: prodId, condition: "New", quantityReceived: 1 }],
        purchaseInvoice: {
          items: [{ product: prodId, condition: "New", unitCost: 1500, sellingPrice: 3000, minSellingPrice: 2500 }],
        },
      },
      {
        status: "Approved",
        approvedAt: new Date("2026-09-02"),
        items: [{ product: prodId, condition: "New", quantityReceived: 1 }],
        purchaseInvoice: {
          items: [{ product: prodId, condition: "New", unitCost: 2000, sellingPrice: 3000, minSellingPrice: 2500 }],
        },
      },
      {
        status: "Approved",
        approvedAt: new Date("2026-09-04"),
        items: [{ product: prodId, condition: "New", quantityReceived: 1 }],
        purchaseInvoice: {
          items: [{ product: prodId, condition: "New", unitCost: 2500, sellingPrice: 3200, minSellingPrice: 2700 }],
        },
      },
    ];

    (PurchaseReceiving.find as any).mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockReceivings),
      }),
    });

    // 3. Inventory state after:
    // - Rec 1: qty=1 @ 1500
    // - Rec 2: qty=1 @ 2000 -> qty=2, avgCost=1750
    // - Sale: 1 sold -> qty=1, avgCost=1750
    // - Rec 3: qty=1 @ 2500 -> updateAverageCostOnIntake gives qty=2, avgCost=(1750 + 2500)/2 = 2125
    (Inventory.aggregate as any).mockResolvedValue([
      {
        _id: prodId,
        qty: 2,
        value: 2 * 2125, // 4250
      },
    ]);

    const results = await batchCalculateProductWeightedPricing([prodIdStr]);
    const cdPricing = results[prodIdStr];

    expect(cdPricing).toBeDefined();
    expect(cdPricing.priceConfigured).toBe(true);

    // Old cumulative logic in pricing.ts: (1500 + 2000 + 2500) / 3 = 2000
    // New required inventory-based moving average: 2125
    expect(cdPricing.avgCostPrice).toBe(2125);
  });
});
