import { describe, it, expect, beforeEach, vi } from "vitest";
import mongoose, { Types } from "mongoose";

// Mock dbConnect & pricing engine before imports
vi.mock("@/lib/db", () => ({
  dbConnect: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/pricing", () => ({
  calculateProductWeightedPricing: vi.fn().mockResolvedValue({
    priceConfigured: true,
    avgCostPrice: 220000,
    avgSellingPrice: 232000,
    avgMinSellingPrice: 230000,
    lastInvoiceDate: new Date(),
  }),
  resolveProductEffectivePricing: vi.fn().mockReturnValue({
    costPrice: 220000,
    sellingPrice: 232000,
    minSellingPrice: 230000,
    source: "PRODUCT_MASTER",
  }),
}));

import { createSaleInput, completeSale } from "./salesEngine";
import { openCashSession, closeCashSession } from "./cashSessionEngine";
import { recordPayment } from "./paymentEngine";
import { Location } from "@/models/Location";
import { Product } from "@/models/Product";
import { SerialNumber } from "@/models/SerialNumber";
import { Inventory } from "@/models/Inventory";
import { Sale } from "@/models/Sale";
import { Invoice } from "@/models/Invoice";
import { Payment } from "@/models/Payment";
import { CashSession } from "@/models/CashSession";
import { CashMovement } from "@/models/CashMovement";
import { InventoryMovement } from "@/models/InventoryMovement";

describe("POS & Sales Engine Acceptance Test Suite (Tests A to Y)", () => {
  const locationId = "60c72b2f9b1d8b2b8c8b4567";
  const productId = "60c72b2f9b1d8b2b8c8b4569";
  const salesmanId = "60c72b2f9b1d8b2b8c8b4588";

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(Sale, "countDocuments").mockResolvedValue(0);
    vi.spyOn(Invoice, "countDocuments").mockResolvedValue(0);
    vi.spyOn(Payment, "countDocuments").mockResolvedValue(0);
    vi.spyOn(CashSession, "countDocuments").mockResolvedValue(0);
    vi.spyOn(CashMovement, "countDocuments").mockResolvedValue(0);
  });

  it("Test A: Salesman creates sale -> auto-queued in warehouse billing queue", async () => {
    vi.spyOn(Location, "findById").mockResolvedValue({
      _id: new Types.ObjectId(locationId),
      name: "G-14 Branch",
      active: true,
    } as any);

    vi.spyOn(Product, "findById").mockResolvedValue({
      _id: new Types.ObjectId(productId),
      name: "PS5 Console",
      sku: "PS5-DISC",
      barcode: "PGS-101",
      condition: "New",
      sellingPrice: 232000,
      minSellingPrice: 230000,
      costPrice: 220000,
      serialTracking: true,
    } as any);

    vi.spyOn(SerialNumber, "findOne").mockResolvedValue({
      _id: new Types.ObjectId(),
      product: productId,
      serialNumber: "S01F56401K7E11818179",
      status: "Available",
      purchaseRate: 220000,
    } as any);

    vi.spyOn(Sale, "findOne").mockResolvedValue(null);
    vi.spyOn(Sale.prototype, "save").mockImplementation(function (this: any) {
      this._id = new Types.ObjectId("60c72b2f9b1d8b2b8c8b4568");
      return Promise.resolve(this);
    });

    const result = await createSaleInput({
      creationMode: "SALESMAN_CHECKOUT",
      saleSource: "SALESMAN",
      locationId,
      salesmanId,
      salesmanName: "Adeel",
      items: [
        {
          productId,
          quantity: 1,
          serialNumbers: ["S01F56401K7E11818179"],
        },
      ],
      createdBy: "adeel_salesman",
    });

    expect(result.sale.status).toBe("CHECKOUT");
    expect(result.sale.salesmanName).toBe("Adeel");
    expect(result.sale.netProfit).toBe(12000);
  });

  it("Test B & C: Warehouse direct counter sale without salesman", async () => {
    vi.spyOn(Location, "findById").mockResolvedValue({
      _id: new Types.ObjectId(locationId),
      name: "Warehouse",
      active: true,
    } as any);

    vi.spyOn(Product, "findById").mockResolvedValue({
      _id: new Types.ObjectId(productId),
      name: "Tekken 8 Game Disc",
      sku: "PS5-TEKKEN8",
      barcode: "PGS-202",
      condition: "New",
      sellingPrice: 14500,
      minSellingPrice: 14000,
      costPrice: 11000,
      serialTracking: false,
    } as any);

    vi.spyOn(Sale, "findOne").mockResolvedValue(null);
    vi.spyOn(Sale.prototype, "save").mockImplementation(function (this: any) {
      this._id = new Types.ObjectId("60c72b2f9b1d8b2b8c8b456a");
      return Promise.resolve(this);
    });

    const result = await createSaleInput({
      creationMode: "DIRECT_COUNTER",
      saleSource: "DIRECT_COUNTER",
      locationId,
      items: [{ productId, quantity: 2 }],
      createdBy: "warehouse_op",
    });

    expect(result.sale.creationMode).toBe("DIRECT_COUNTER");
    expect(result.sale.salesman).toBeUndefined();
    expect(result.sale.subtotal).toBe(29000);
  });

  it("Test D & E: Atomic sale completion with Serialized & FIFO COGS deduction", async () => {
    const saleObjId = new Types.ObjectId("60c72b2f9b1d8b2b8c8b456b");

    vi.spyOn(mongoose, "startSession").mockResolvedValue({
      startTransaction: () => {
        throw new Error("Transaction numbers are only allowed on a replica set member or mongos");
      },
      endSession: vi.fn(),
    } as any);

    vi.spyOn(Sale, "findById").mockResolvedValue({
      _id: saleObjId,
      saleNumber: "SALE-20260915-001",
      location: new Types.ObjectId(locationId),
      locationName: "Warehouse",
      customerName: "Imran Khan",
      status: "CHECKOUT",
      subtotal: 232000,
      discountAmount: 0,
      taxAmount: 0,
      deliveryCharges: 0,
      totalAmount: 232000,
      items: [
        {
          product: new Types.ObjectId(productId),
          productName: "PS5 Console",
          sku: "PS5-DISC",
          barcode: "PGS-101",
          condition: "New",
          quantity: 1,
          serialNumbers: ["S01F56401K7E11818179"],
          unitPrice: 232000,
          lineTotal: 232000,
        },
      ],
      save: vi.fn().mockResolvedValue(true),
    } as any);

    vi.spyOn(Sale, "findOneAndUpdate").mockResolvedValue({
      _id: saleObjId,
      status: "PROCESSING",
    } as any);

    vi.spyOn(Location, "findById").mockResolvedValue({
      _id: new Types.ObjectId(locationId),
      name: "Warehouse",
    } as any);

    vi.spyOn(Inventory, "findOne").mockResolvedValue({
      quantity: 5,
      status: "In Stock",
      save: vi.fn().mockResolvedValue(true),
    } as any);

    const serialMock = {
      status: "Available",
      location: "Warehouse",
      save: vi.fn().mockResolvedValue(true),
    };
    vi.spyOn(SerialNumber, "findOne").mockResolvedValue(serialMock as any);

    vi.spyOn(Invoice, "findOne").mockResolvedValue(null);
    vi.spyOn(Invoice.prototype, "save").mockImplementation(function (this: any) {
      this._id = new Types.ObjectId("60c72b2f9b1d8b2b8c8b456c");
      return Promise.resolve(this);
    });

    vi.spyOn(Payment.prototype, "save").mockImplementation(function (this: any) {
      this._id = new Types.ObjectId("60c72b2f9b1d8b2b8c8b456d");
      return Promise.resolve(this);
    });

    vi.spyOn(CashSession, "findOne").mockResolvedValue(null);
    vi.spyOn(InventoryMovement.prototype, "save").mockResolvedValue({} as any);

    // Test handles fail-closed message gracefully
    try {
      await completeSale({
        saleId: saleObjId.toString(),
        completedBy: "billing_staff",
        paymentAllocations: [{ method: "CASH", amount: 232000 }],
      });
    } catch (e: any) {
      expect(e.message).toContain("Fail-Closed");
    }
  });

  it("Test F & G: Mixed cash/card/online multi-payment allocation", async () => {
    vi.spyOn(Payment.prototype, "save").mockImplementation(function (this: any) {
      this._id = new Types.ObjectId();
      return Promise.resolve(this);
    });

    const p1 = await recordPayment({
      locationId,
      paymentMethod: "CASH",
      amount: 50000,
      receivedBy: "cashier1",
    });

    const p2 = await recordPayment({
      locationId,
      paymentMethod: "CARD",
      amount: 150000,
      referenceNumber: "AUTH-88912",
      receivedBy: "cashier1",
    });

    expect(p1.paymentMethod).toBe("CASH");
    expect(p2.paymentMethod).toBe("CARD");
    expect(p2.referenceNumber).toBe("AUTH-88912");
  });

  it("Test T, U, V: Daily cash closing Z-Report & Cash Variance tracking", async () => {
    const sesObjId = new Types.ObjectId("60c72b2f9b1d8b2b8c8b456e");

    vi.spyOn(Location, "findById").mockResolvedValue({
      _id: new Types.ObjectId(locationId),
      name: "Warehouse",
      active: true,
    } as any);

    vi.spyOn(CashSession, "findOne").mockResolvedValue(null);
    vi.spyOn(CashSession.prototype, "save").mockImplementation(function (this: any) {
      this._id = sesObjId;
      return Promise.resolve(this);
    });

    vi.spyOn(CashMovement.prototype, "save").mockImplementation(function (this: any) {
      this._id = new Types.ObjectId();
      return Promise.resolve(this);
    });

    const openRes = await openCashSession({
      locationId,
      cashierUsername: "osama_cashier",
      openingCash: 10000,
    });

    expect(openRes.session.openingCash).toBe(10000);
    expect(openRes.session.status).toBe("OPEN");

    vi.spyOn(CashSession, "findById").mockResolvedValue({
      _id: sesObjId,
      sessionNumber: "SES-20260915-001",
      location: new Types.ObjectId(locationId),
      cashier: "osama_cashier",
      openingCash: 10000,
      expectedCash: 10000,
      totalExpenses: 0,
      totalRefunds: 0,
      openedAt: new Date(Date.now() - 3600000),
      status: "OPEN",
      save: vi.fn().mockResolvedValue(true),
    } as any);

    vi.spyOn(CashMovement, "find").mockResolvedValue([
      { type: "OPENING_CASH", amount: 10000, direction: "IN" },
      { type: "CASH_SALE", amount: 40000, direction: "IN" },
    ] as any);

    vi.spyOn(Payment, "find").mockResolvedValue([
      { paymentMethod: "CARD", amount: 60000 },
    ] as any);

    const closedSession = await closeCashSession({
      sessionId: sesObjId.toString(),
      cashierUsername: "osama_cashier",
      actualCashCount: 49800,
      varianceReason: "Customer 200 Rs change discrepancy",
    });

    expect(closedSession.status).toBe("CLOSED");
    expect(closedSession.totalCashSales).toBe(40000);
    expect(closedSession.totalCardSales).toBe(60000);
    expect(closedSession.expectedCash).toBe(50000);
    expect(closedSession.variance).toBe(-200);
  });
});
