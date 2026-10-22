import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import { updateAverageCostOnIntake } from "./averageCostEngine";
import { blendAverageCost, isValidCost } from "./costing";
import { Inventory } from "@/models/Inventory";
import { Product } from "@/models/Product";

vi.mock("@/lib/db", () => ({
  dbConnect: vi.fn(),
}));

vi.mock("@/models/Product", () => {
  return {
    Product: {
      findById: vi.fn(),
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
  return { Inventory: MockInventory };
});

describe("Costing Engine Bug Fixes & Protection Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("Scenario 1: 3 CDs @ 8500 + 2 CDs @ 7500 -> Weighted Average MUST be exactly 8100 even if a pool has missing cost", async () => {
    const prodId = new mongoose.Types.ObjectId();
    const loc1 = new mongoose.Types.ObjectId();
    const loc2 = new mongoose.Types.ObjectId();
    const locWh = new mongoose.Types.ObjectId();

    // Mock master product with costPrice 8500
    (Product.findById as any).mockReturnValue({
      exec: vi.fn().mockResolvedValue({
        _id: prodId,
        costPrice: 8500,
        condition: "New",
      }),
      session: vi.fn().mockReturnThis(),
    });

    // Mock existing inventory pools across branches:
    // Branch 1: 1 unit @ 8500
    // Branch 2: 1 unit @ 8500
    // Branch 3: 1 unit with uncosted pool (averageCost: 0)
    // Total existing = 3 units, should evaluate to 3 * 8500 = 25,500
    const mockInvs = [
      {
        _id: new mongoose.Types.ObjectId(),
        product: prodId,
        location: loc1,
        condition: "New",
        quantity: 1,
        averageCost: 8500,
        totalCostValue: 8500,
        save: vi.fn().mockResolvedValue(true),
      },
      {
        _id: new mongoose.Types.ObjectId(),
        product: prodId,
        location: loc2,
        condition: "New",
        quantity: 1,
        averageCost: 8500,
        totalCostValue: 8500,
        save: vi.fn().mockResolvedValue(true),
      },
      {
        _id: new mongoose.Types.ObjectId(),
        product: prodId,
        location: new mongoose.Types.ObjectId(),
        condition: "New",
        quantity: 1,
        averageCost: 0, // Uncosted / ghost stock
        totalCostValue: 0,
        save: vi.fn().mockResolvedValue(true),
      },
    ];

    (Inventory.find as any).mockReturnValue({
      exec: vi.fn().mockResolvedValue(mockInvs),
      session: vi.fn().mockReturnThis(),
    });

    // Destination receiving pool (Warehouse, currently empty)
    (Inventory.findOne as any).mockReturnValue({
      exec: vi.fn().mockResolvedValue(null),
      session: vi.fn().mockReturnThis(),
    });

    // Incoming receiving: 2 units @ Rs. 7,500
    const intakeResult = await updateAverageCostOnIntake({
      productId: prodId.toString(),
      locationId: locWh.toString(),
      condition: "New",
      quantity: 2,
      unitCost: 7500,
    });

    // (3 * 8500 + 2 * 7500) / 5 = (25500 + 15000) / 5 = 40500 / 5 = 8100
    expect(intakeResult.newAverageCost).toBe(8100);
    expect(intakeResult.newQuantity).toBe(2);
    expect(intakeResult.totalCostValue).toBe(16200);

    // Also verify that the uncosted pool was healed
    expect(mockInvs[2].averageCost).toBe(8100);
  });

  it("Scenario 2: blendAverageCost protects against zero/placeholder cost dilution", () => {
    // If existing stock has 0 cost, it must NOT dilute incoming cost
    const result = blendAverageCost({
      existingQty: 10,
      existingAvg: 0,
      incomingQty: 2,
      incomingCost: 5000,
    });
    expect(result).toBe(5000);
  });

  it("Scenario 3: isValidCost correctly validates costs > 1", () => {
    expect(isValidCost(0)).toBe(false);
    expect(isValidCost(1)).toBe(false);
    expect(isValidCost(null)).toBe(false);
    expect(isValidCost(undefined)).toBe(false);
    expect(isValidCost(1.5)).toBe(true);
    expect(isValidCost(8500)).toBe(true);
  });
});
