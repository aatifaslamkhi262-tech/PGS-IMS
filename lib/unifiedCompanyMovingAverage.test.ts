import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose, { Types } from "mongoose";
import { updateAverageCostOnIntake, revalueCompanyStockOnManualOverride, getPoolAverageCost } from "./averageCostEngine";
import { blendAverageCost, isValidCost } from "./costing";
import { calculateProductWeightedPricing, resolveProductEffectivePricing } from "./pricing";
import { Product } from "@/models/Product";
import { Inventory } from "@/models/Inventory";

vi.mock("@/lib/db", () => ({
  dbConnect: vi.fn(),
}));

vi.mock("@/models/Product", () => {
  return {
    Product: {
      findById: vi.fn(),
      updateOne: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({}) }),
    },
  };
});

vi.mock("@/models/Inventory", () => {
  const MockInventory: any = function (this: any, data: any) {
    Object.assign(this, data);
    this.save = vi.fn().mockResolvedValue(this);
  };
  MockInventory.findOne = vi.fn();
  MockInventory.find = vi.fn();
  MockInventory.aggregate = vi.fn();
  return { Inventory: MockInventory };
});

describe("Unified Company-Wide Moving Average Costing Engine", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("Scenario requested by user: Inv 1 -> Inv 2 -> Inv 3 (with sales) -> Manual Override -> Inv 4", async () => {
    // 1. Inv 1: 10 units @ 1,000 -> Avg = 1,000
    const step1Avg = blendAverageCost({
      existingQty: 0,
      existingAvg: 0,
      incomingQty: 10,
      incomingCost: 1000,
    });
    expect(step1Avg).toBe(1000);
    const step1Qty = 10;
    const step1Val = step1Qty * step1Avg;
    expect(step1Val).toBe(10000);

    // 2. Inv 2: 10 units @ 1,200 -> Avg = (10,000 + 12,000) / 20 = 22,000 / 20 = 1,100
    const step2Avg = blendAverageCost({
      existingQty: step1Qty,
      existingAvg: step1Avg,
      incomingQty: 10,
      incomingCost: 1200,
    });
    expect(step2Avg).toBe(1100);
    const step2Qty = step1Qty + 10;
    const step2Val = step2Qty * step2Avg;
    expect(step2Val).toBe(22000);

    // Sale of 5 units @ 1,100: Quantity becomes 15, average cost remains 1,100
    const postSaleQty = step2Qty - 5;
    const postSaleAvg = step2Avg; // Average cost never changes on sale!
    expect(postSaleQty).toBe(15);
    expect(postSaleAvg).toBe(1100);

    // 3. Inv 3: 10 units @ 1,400 -> Avg = (15 * 1100 + 10 * 1400) / 25 = (16500 + 14000) / 25 = 30,500 / 25 = 1,220
    const step3Avg = blendAverageCost({
      existingQty: postSaleQty,
      existingAvg: postSaleAvg,
      incomingQty: 10,
      incomingCost: 1400,
    });
    expect(step3Avg).toBe(1220);
    const step3Qty = postSaleQty + 10; // 25
    const step3Val = step3Qty * step3Avg; // 30,500
    expect(step3Qty).toBe(25);
    expect(step3Val).toBe(30500);

    // 4. Manual Override: Cost manually adjusted to 1,300 for the 25 units
    const overrideCost = 1300;
    const overrideQty = step3Qty; // 25
    const overrideVal = overrideQty * overrideCost; // 32,500
    expect(overrideVal).toBe(32500);

    // 5. Inv 4: 15 units @ 1,500 -> Avg = (32,500 + 15 * 1,500) / 40 = (32,500 + 22,500) / 40 = 55,000 / 40 = 1,375
    const step4Avg = blendAverageCost({
      existingQty: overrideQty,
      existingAvg: overrideCost,
      incomingQty: 15,
      incomingCost: 1500,
    });
    expect(step4Avg).toBe(1375);
    const step4Qty = overrideQty + 15; // 40
    const step4Val = step4Qty * step4Avg;
    expect(step4Qty).toBe(40);
    expect(step4Val).toBe(55000);
  });

  it("Company-wide intake updates both active pool and zero-quantity pools, syncing Product master", async () => {
    const prodId = new Types.ObjectId();
    const locWh = new Types.ObjectId();
    const locBranch = new Types.ObjectId();

    (Product.findById as any).mockReturnValue({
      exec: vi.fn().mockResolvedValue({
        _id: prodId,
        costPrice: 8500,
        condition: "New",
      }),
      session: vi.fn().mockReturnThis(),
    });

    const otherBranchInv = {
      _id: new Types.ObjectId(),
      product: prodId,
      location: locBranch,
      condition: "New",
      quantity: 0,
      averageCost: 5000, // old stale cost
      totalCostValue: 0,
      save: vi.fn().mockResolvedValue(true),
    };

    (Inventory.find as any).mockReturnValue({
      exec: vi.fn().mockResolvedValue([otherBranchInv]),
      session: vi.fn().mockReturnThis(),
    });

    (Inventory.findOne as any).mockReturnValue({
      exec: vi.fn().mockResolvedValue(null),
      session: vi.fn().mockReturnThis(),
    });

    const res = await updateAverageCostOnIntake({
      productId: prodId,
      locationId: locWh,
      condition: "New",
      quantity: 2,
      unitCost: 8000,
    });

    expect(res.newAverageCost).toBe(8000);
    expect(res.newQuantity).toBe(2);
    // Other branch pool with 0 quantity should also be updated with new company average cost
    expect(otherBranchInv.averageCost).toBe(8000);
    // Product master costPrice is updated
    expect(Product.updateOne).toHaveBeenCalledWith(
      { _id: prodId },
      { $set: { costPrice: 8000 } }
    );
  });

  it("revalueCompanyStockOnManualOverride updates all pools and Product master", async () => {
    const prodId = new Types.ObjectId();
    const pool1 = {
      product: prodId,
      condition: "New",
      quantity: 10,
      averageCost: 1100,
      totalCostValue: 11000,
      save: vi.fn().mockResolvedValue(true),
    };
    const pool2 = {
      product: prodId,
      condition: "New",
      quantity: 15,
      averageCost: 1100,
      totalCostValue: 16500,
      save: vi.fn().mockResolvedValue(true),
    };

    (Inventory.find as any).mockReturnValue({
      exec: vi.fn().mockResolvedValue([pool1, pool2]),
      session: vi.fn().mockReturnThis(),
    });

    const result = await revalueCompanyStockOnManualOverride({
      productId: prodId,
      condition: "New",
      newCost: 1300,
    });

    expect(result.newAverageCost).toBe(1300);
    expect(result.updatedPoolsCount).toBe(2);
    expect(pool1.averageCost).toBe(1300);
    expect(pool1.totalCostValue).toBe(13000);
    expect(pool2.averageCost).toBe(1300);
    expect(pool2.totalCostValue).toBe(19500);
    expect(Product.updateOne).toHaveBeenCalledWith(
      { _id: prodId },
      { $set: { costPrice: 1300 } }
    );
  });
});
