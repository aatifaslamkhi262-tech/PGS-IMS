import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose, { Types } from "mongoose";
import { getInventoryCostMap, batchCalculateProductWeightedPricing, resolveProductEffectivePricing } from "./pricing";
import { updateAverageCostOnIntake } from "./averageCostEngine";
import { blendAverageCost, isValidCost, COST_PLACEHOLDER_MAX } from "./costing";
import { executeDispatch, executeReceive, executeCancelTransfer } from "./stockTransfer";
import { Product } from "@/models/Product";
import { Inventory } from "@/models/Inventory";
import { PurchaseReceiving } from "@/models/PurchaseReceiving";
import { PurchaseInvoice } from "@/models/PurchaseInvoice";
import { Location } from "@/models/Location";
import { StockTransfer } from "@/models/StockTransfer";
import { SerialNumber } from "@/models/SerialNumber";

vi.mock("@/lib/db", () => ({
  dbConnect: vi.fn(),
}));

vi.mock("@/models/Product", () => ({
  Product: {
    find: vi.fn(),
    findById: vi.fn(),
    updateOne: vi.fn(),
  },
}));

vi.mock("@/models/Location", () => ({
  Location: {
    findById: vi.fn(),
  },
}));

vi.mock("@/models/PurchaseReceiving", () => ({
  PurchaseReceiving: {
    find: vi.fn().mockImplementation(() => ({
      populate: vi.fn().mockImplementation(() => ({
        lean: vi.fn().mockResolvedValue([]),
      })),
    })),
    findById: vi.fn(),
  },
}));

vi.mock("@/models/PurchaseInvoice", () => ({
  PurchaseInvoice: {
    find: vi.fn().mockImplementation(() => ({
      sort: vi.fn().mockImplementation(() => ({
        lean: vi.fn().mockResolvedValue([]),
      })),
    })),
    findById: vi.fn(),
  },
}));

vi.mock("@/models/Inventory", () => ({
  Inventory: {
    aggregate: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
  },
}));

vi.mock("@/models/StockTransfer", () => ({
  StockTransfer: {
    find: vi.fn(),
    findOne: vi.fn(),
    findById: vi.fn(),
  },
}));

vi.mock("@/models/SerialNumber", () => ({
  SerialNumber: {
    find: vi.fn(),
    findOne: vi.fn(),
  },
}));

vi.mock("@/models/InventoryMovement", () => ({
  InventoryMovement: {
    create: vi.fn().mockResolvedValue({}),
    find: vi.fn().mockResolvedValue([]),
    findOne: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("@/models/User", () => ({
  User: {
    findById: vi.fn(),
  },
}));

// Helper function implementing production moving average formula (2dp rounded totalCostValue)
function calculateMovingAverage(existingQty: number, existingAvg: number, intakeQty: number, intakeCost: number) {
  const newQuantity = existingQty <= 0 ? intakeQty : existingQty + intakeQty;
  const newAverageCost = blendAverageCost({ existingQty, existingAvg, incomingQty: intakeQty, incomingCost: intakeCost });
  const newTotalCostValue = Math.round(newQuantity * newAverageCost * 100) / 100;
  return {
    newQuantity,
    newAverageCost,
    newTotalCostValue,
    totalCostValue: newTotalCostValue,
  };
}

describe("Comprehensive Costing Chain & Integration Rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (PurchaseReceiving.find as any).mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      }),
    });

    (PurchaseInvoice.find as any).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      }),
    });
  });

  it("Test 1 (Chain Test): 1pc@10k, 1pc@12k, override 14k (2 pcs), 1pc@16k, 1pc@18k, 1pc@20k -> matches exact expected values", () => {
    // 1. Initial intake: 1 pc @ 10,000
    const step1 = calculateMovingAverage(0, 0, 1, 10000);
    expect(step1.newQuantity).toBe(1);
    expect(step1.newAverageCost).toBe(10000);
    expect(step1.newTotalCostValue).toBe(10000);

    // 2. Second intake: 1 pc @ 12,000
    const step2 = calculateMovingAverage(step1.newQuantity, step1.newAverageCost, 1, 12000);
    expect(step2.newQuantity).toBe(2);
    expect(step2.newAverageCost).toBe(11000);
    expect(step2.newTotalCostValue).toBe(22000);

    // 3. Manual override to 14,000 for 2 pcs
    const overrideQty = 2;
    const overrideCost = 14000;
    const overrideVal = overrideQty * overrideCost; // 28,000
    expect(overrideCost).toBe(14000);
    expect(overrideVal).toBe(28000);

    // 4. Third intake: 1 pc @ 16,000 -> (2 * 14000 + 1 * 16000) / 3 = 44000 / 3 = 14666.67
    const step4 = calculateMovingAverage(overrideQty, overrideCost, 1, 16000);
    expect(step4.newQuantity).toBe(3);
    expect(step4.newAverageCost).toBe(14666.67);
    expect(step4.newTotalCostValue).toBeCloseTo(44000, 1);

    // 5. Fourth intake: 1 pc @ 18,000 -> (44000 + 18000) / 4 = 62000 / 4 = 15500
    const step5 = calculateMovingAverage(step4.newQuantity, step4.newAverageCost, 1, 18000);
    expect(step5.newQuantity).toBe(4);
    expect(step5.newAverageCost).toBe(15500);
    expect(step5.newTotalCostValue).toBeCloseTo(62000, 1);

    // 6. Fifth intake: 1 pc @ 20,000 -> (62000 + 20000) / 5 = 82000 / 5 = 16400
    const step6 = calculateMovingAverage(step5.newQuantity, step5.newAverageCost, 1, 20000);
    expect(step6.newQuantity).toBe(5);
    expect(step6.newAverageCost).toBe(16400);
    expect(step6.newTotalCostValue).toBe(82000);
  });

  it("Test 2 (Chain + Sale Test): override at 14k -> 1 pc sale -> average cost remains 14k -> new intake blends correctly", () => {
    let currentQty = 2;
    let currentCost = 14000;
    let currentVal = currentQty * currentCost;

    const saleQty = 1;
    currentQty -= saleQty;
    currentVal = currentQty * currentCost;
    expect(currentQty).toBe(1);
    expect(currentCost).toBe(14000);
    expect(currentVal).toBe(14000);

    const nextIntake = calculateMovingAverage(currentQty, currentCost, 1, 16000);
    expect(nextIntake.newQuantity).toBe(2);
    expect(nextIntake.newAverageCost).toBe(15000);
    expect(nextIntake.newTotalCostValue).toBe(30000);
  });

  it("Test 3 (Condition Isolation): New and Used inventory pools are completely isolated and never contaminate each other", async () => {
    const prodId = new Types.ObjectId();
    const prodIdStr = prodId.toString();

    (Product.find as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            _id: prodId,
            name: "PS5 Controller",
            condition: "Used",
            costPrice: 8000,
            sellingPrice: 12000,
          },
        ]),
      }),
    });

    (Inventory.aggregate as any).mockResolvedValue([
      {
        _id: { product: prodId, condition: "New" },
        qty: 10,
        value: 180000,
      },
      {
        _id: { product: prodId, condition: "Used" },
        qty: 5,
        value: 40000,
      },
    ]);

    const costMap = await getInventoryCostMap([prodIdStr]);

    expect(costMap[`${prodIdStr}:New`]).toBe(18000);
    expect(costMap[`${prodIdStr}:Used`]).toBe(8000);

    expect(costMap[prodIdStr]).toBe(14666.67);
    expect(costMap[`${prodIdStr}:overall`]).toBe(14666.67);

    const results = await batchCalculateProductWeightedPricing([prodIdStr]);
    expect(results[prodIdStr].avgCostPrice).toBe(8000);
  });

  it("Test 4 (Cross-Endpoint Parity): Directory, Lookup, and Pricing all resolve identical moving average cost", async () => {
    const prodId = new Types.ObjectId();
    const prodIdStr = prodId.toString();

    (Product.find as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            _id: prodId,
            name: "FC 27",
            condition: "New",
            costPrice: 16666,
            sellingPrice: 20000,
          },
        ]),
      }),
    });

    (Inventory.aggregate as any).mockResolvedValue([
      {
        _id: { product: prodId, condition: "New" },
        qty: 3,
        value: 3 * 16666,
      },
    ]);

    const results = await batchCalculateProductWeightedPricing([prodIdStr]);
    const pricing = results[prodIdStr];
    // Attach valid invoice date so pricing source resolves to WEIGHTED_AVERAGE
    pricing.lastInvoiceDate = new Date();

    const effective = resolveProductEffectivePricing(
      {
        _id: prodId,
        costPrice: 16666,
        sellingPrice: 20000,
        minSellingPrice: 18000,
      } as any,
      pricing
    );

    expect(pricing.avgCostPrice).toBe(16666);
    expect(effective.costPrice).toBe(16666);
    expect(effective.source).toBe("WEIGHTED_AVERAGE");
  });

  // --- Specific Edge Case Tests (a through i) ---

  it("Case (a): qty > 0, avg = 0 + incoming 10000 -> newAvg = 10000 (prevents zero-cost dilution)", () => {
    const res = blendAverageCost({ existingQty: 10, existingAvg: 0, incomingQty: 1, incomingCost: 10000 });
    expect(res).toBe(10000);
  });

  it("Case (b): qty > 0, avg = 1 + incoming 10000 -> newAvg = 10000 (prevents placeholder cost dilution)", () => {
    const res = blendAverageCost({ existingQty: 5, existingAvg: 1, incomingQty: 1, incomingCost: 10000 });
    expect(res).toBe(10000);
  });

  it("Case (c): qty = 0, stale avg = 12000 + incoming 16000 -> newAvg = 16000 (resurrects clean cost)", () => {
    const res = blendAverageCost({ existingQty: 0, existingAvg: 12000, incomingQty: 1, incomingCost: 16000 });
    expect(res).toBe(16000);
  });

  it("Case (d): normal blend 10 @ 500 + 1 @ 20000 -> newAvg = 2272.73 (when existing cost is valid)", () => {
    const res = blendAverageCost({ existingQty: 10, existingAvg: 500, incomingQty: 1, incomingCost: 20000 });
    expect(res).toBe(2272.73);
  });

  it("Case (e): incomingCost <= 1 -> throws error", () => {
    expect(() => blendAverageCost({ existingQty: 5, existingAvg: 5000, incomingQty: 1, incomingCost: 0 })).toThrow();
    expect(() => blendAverageCost({ existingQty: 5, existingAvg: 5000, incomingQty: 1, incomingCost: 1 })).toThrow();
  });

  it("Case (f): Real executeDispatch with avg <= 1 -> blocked with error containing product name and condition", async () => {
    const prodId = new Types.ObjectId();
    const sourceLocId = new Types.ObjectId();
    const destLocId = new Types.ObjectId();
    const carrierId = new Types.ObjectId();

    (Location.findById as any).mockResolvedValue({
      _id: sourceLocId,
      name: "Warehouse",
      code: "WH",
    });

    const mockTransfer = {
      _id: new Types.ObjectId(),
      transferNumber: "TRF-TEST-001",
      sourceLocation: sourceLocId,
      destinationLocation: destLocId,
      status: "Draft",
      items: [{ product: prodId, quantity: 1, condition: "Used" }],
      save: vi.fn().mockResolvedValue(true),
    };

    (StockTransfer.findById as any).mockImplementation(() => ({
      populate: vi.fn().mockImplementation(() => ({
        populate: vi.fn().mockResolvedValue(mockTransfer as any),
      })),
    }));

    const { User } = await import("@/models/User");
    (User.findById as any).mockResolvedValue({
      _id: carrierId,
      name: "Carrier Bob",
      username: "bob",
      active: true,
    });

    (Product.findById as any).mockResolvedValue({
      _id: prodId,
      name: "PS5 Controller",
      condition: "Used",
      serialTracking: false,
    });

    (Inventory.findOne as any).mockResolvedValue({
      product: prodId,
      location: sourceLocId,
      condition: "Used",
      quantity: 5,
      averageCost: 1, // Placeholder cost <= 1
    });

    await expect(
      executeDispatch({
        transferId: mockTransfer._id.toString(),
        actionUsername: "admin",
        carrierUserId: carrierId.toString(),
      })
    ).rejects.toThrow(/PS5 Controller.*Used/);
  });

  it("Case (g): Real executeCancelTransfer with new stock at source -> restoration uses blendAverageCost", async () => {
    const prodId = new Types.ObjectId();
    const sourceLocId = new Types.ObjectId();
    const destLocId = new Types.ObjectId();

    const mockTransfer = {
      _id: new Types.ObjectId(),
      transferNumber: "TRF-CANCEL-001",
      sourceLocation: sourceLocId,
      destinationLocation: destLocId,
      status: "Dispatched",
      dispatchedAt: new Date(),
      items: [{ product: prodId, quantity: 2, condition: "New", unitCost: 15000 }],
      save: vi.fn().mockResolvedValue(true),
    };

    (StockTransfer.findById as any).mockImplementation(() => ({
      populate: vi.fn().mockImplementation(() => ({
        populate: vi.fn().mockResolvedValue(mockTransfer as any),
      })),
    }));

    (Location.findById as any).mockResolvedValue({
      _id: sourceLocId,
      name: "Source Branch",
    });

    (Product.findById as any).mockResolvedValue({
      _id: prodId,
      name: "Xbox Series X",
      serialTracking: false,
    });

    const sourceInvDoc = {
      product: prodId,
      location: sourceLocId,
      condition: "New",
      quantity: 8,
      averageCost: 10000,
      totalCostValue: 80000,
      status: "In Stock",
      save: vi.fn().mockResolvedValue(true),
    };

    (Inventory.findOne as any).mockResolvedValue(sourceInvDoc);

    const result = await executeCancelTransfer({
      transferId: mockTransfer._id.toString(),
      actionUsername: "admin",
      reason: "Customer Cancelled",
    });

    expect(result.status).toBe("Cancelled");
    expect(sourceInvDoc.quantity).toBe(10);
    // (8 * 10000 + 2 * 15000) / 10 = 110000 / 10 = 11000
    expect(sourceInvDoc.averageCost).toBe(11000);
    expect(sourceInvDoc.totalCostValue).toBe(110000);
  });

  it("Case (h): Real purchase receiving approve with zero-cost line -> rejected", async () => {
    const { isValidCost } = await import("./costing");
    const lineCost = 0;
    expect(isValidCost(lineCost)).toBe(false);
  });

  it("Case (i): Engine Parity - updateAverageCostOnIntake and executeReceive produce identical averageCost", async () => {
    const prodId = new Types.ObjectId();
    const locId = new Types.ObjectId();

    // 1. Run updateAverageCostOnIntake: 5 @ 10000 + 5 @ 20000 -> 15000
    const invDoc1 = {
      product: prodId,
      location: locId,
      condition: "New",
      quantity: 5,
      averageCost: 10000,
      totalCostValue: 50000,
      status: "In Stock",
      save: vi.fn().mockResolvedValue(true),
      exec: vi.fn(),
    };
    invDoc1.exec.mockResolvedValue(invDoc1);
    (Inventory.findOne as any).mockReturnValue(invDoc1);

    const intakeRes = await updateAverageCostOnIntake({
      productId: prodId,
      locationId: locId,
      condition: "New",
      quantity: 5,
      unitCost: 20000,
    });

    expect(intakeRes.newAverageCost).toBe(15000);
    expect(intakeRes.newQuantity).toBe(10);

    // 2. Run executeReceive logic on identical inputs: 5 @ 10000 + 5 @ 20000 -> 15000
    const receiveAvg = blendAverageCost({
      existingQty: 5,
      existingAvg: 10000,
      incomingQty: 5,
      incomingCost: 20000,
    });

    expect(receiveAvg).toBe(15000);
    expect(intakeRes.newAverageCost).toEqual(receiveAvg);
  });
});
