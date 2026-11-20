import { describe, it, expect, beforeEach, vi } from "vitest";
import mongoose, { Types } from "mongoose";

vi.mock("@/lib/db", () => ({
  dbConnect: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/auth/rbac", () => ({
  verifyRole: vi.fn().mockResolvedValue({
    authenticated: true,
    authorized: true,
    status: 200,
    user: { userId: "60c72b2f9b1d8b2b8c8b4501", username: "cashier1", role: "Admin" },
  }),
}));

vi.mock("@/lib/idempotencyEngine", () => ({
  lockIdempotencyKey: vi.fn().mockResolvedValue({ isDuplicate: false }),
  completeIdempotencyKey: vi.fn().mockResolvedValue(undefined),
  failIdempotencyKey: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/emailService", () => ({
  sendOwnerOrderAlert: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/pricing", () => ({
  calculateProductWeightedPricing: vi.fn().mockResolvedValue({
    priceConfigured: true,
    avgCostPrice: 10000,
    avgSellingPrice: 15000,
    avgMinSellingPrice: 14000,
  }),
  resolveProductEffectivePricing: vi.fn().mockReturnValue({
    costPrice: 10000,
    sellingPrice: 15000,
    minSellingPrice: 14000,
    source: "PRODUCT_MASTER",
  }),
}));

vi.mock("@/lib/averageCostEngine", () => ({
  getPoolAverageCost: vi.fn().mockResolvedValue(10000),
  deductInventoryWithAverageCost: vi.fn().mockResolvedValue({
    remainingQty: 1,
    unitCost: 10000,
    totalCost: 10000,
  }),
}));

vi.mock("@/lib/customerResolver", () => ({
  resolveOrCreateCustomer: vi.fn().mockResolvedValue(new Types.ObjectId("60c72b2f9b1d8b2b8c8b4599")),
}));

vi.mock("@/lib/customerLedgerEngine", () => ({
  recordCustomerLedgerEntry: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/cashSessionEngine", () => ({
  recordCashMovement: vi.fn().mockResolvedValue({}),
}));

import { POST as createSalePOST } from "@/app/api/sales/route";
import { POST as createAdvancePOST } from "@/app/api/sales/advance/route";
import { createSaleInput, completeSale } from "./salesEngine";
import { Sale } from "@/models/Sale";
import { Location } from "@/models/Location";
import { Product } from "@/models/Product";
import { Payment } from "@/models/Payment";
import { Invoice } from "@/models/Invoice";
import { Inventory } from "@/models/Inventory";
import { SerialNumber } from "@/models/SerialNumber";
import { CashSession } from "@/models/CashSession";
import { InventoryMovement } from "@/models/InventoryMovement";
import * as cashSessionEngine from "./cashSessionEngine";
import * as customerLedgerEngine from "./customerLedgerEngine";

describe("Pending Queue Prevention & Advance Booking Fixes", () => {
  const locId = "60c72b2f9b1d8b2b8c8b4567";
  const prodId = "60c72b2f9b1d8b2b8c8b4569";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Sale, "countDocuments").mockResolvedValue(0 as any);
    vi.spyOn(Invoice, "countDocuments").mockResolvedValue(0 as any);
    vi.spyOn(Payment, "countDocuments").mockResolvedValue(0 as any);
  });

  it("deletes newly created Sale when directComplete POS checkout fails so no PAYMENT_PENDING orphan remains", async () => {
    const createdSaleId = new Types.ObjectId("60c72b2f9b1d8b2b8c8b4901");

    vi.spyOn(Location, "findById").mockImplementation(() => ({
      session: vi.fn().mockResolvedValue({ _id: new Types.ObjectId(locId), name: "Warehouse", active: true }),
      then: (res: any) => Promise.resolve({ _id: new Types.ObjectId(locId), name: "Warehouse", active: true }).then(res),
    }) as any);

    vi.spyOn(Product, "findById").mockImplementation(() => ({
      session: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          _id: new Types.ObjectId(prodId),
          name: "PS5 Tekken 8",
          sku: "PS5-T8",
          barcode: "PGS-T8",
          condition: "Used",
          sellingPrice: 15000,
          minSellingPrice: 14000,
          costPrice: 10000,
          serialTracking: false,
        }),
      }),
      then: (res: any) =>
        Promise.resolve({
          _id: new Types.ObjectId(prodId),
          name: "PS5 Tekken 8",
          sku: "PS5-T8",
          barcode: "PGS-T8",
          condition: "Used",
          sellingPrice: 15000,
          minSellingPrice: 14000,
          costPrice: 10000,
          serialTracking: false,
        }).then(res),
    }) as any);

    vi.spyOn(Sale.prototype, "save").mockImplementation(function (this: any) {
      this._id = createdSaleId;
      return Promise.resolve(this);
    });

    const mockSaleDoc = {
      _id: createdSaleId,
      saleNumber: "SALE-20261119-001",
      location: new Types.ObjectId(locId),
      locationName: "Warehouse",
      status: "PAYMENT_PENDING",
      totalAmount: 15000,
      items: [
        {
          product: new Types.ObjectId(prodId),
          productName: "PS5 Tekken 8",
          condition: "Used",
          quantity: 1,
          unitPrice: 15000,
          lineTotal: 15000,
          serialNumbers: [],
        },
      ],
    };

    vi.spyOn(Sale, "findById").mockImplementation(() => ({
      session: vi.fn().mockResolvedValue(mockSaleDoc),
      then: (res: any) => Promise.resolve(mockSaleDoc).then(res),
    }) as any);

    vi.spyOn(Sale, "findOneAndUpdate").mockResolvedValue({ ...mockSaleDoc, status: "PROCESSING" } as any);
    vi.spyOn(Sale, "findByIdAndUpdate").mockResolvedValue(mockSaleDoc as any);
    const deleteSpy = vi.spyOn(Sale, "deleteOne").mockResolvedValue({ deletedCount: 1 } as any);

    const mockSession = {
      startTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      abortTransaction: vi.fn(),
      endSession: vi.fn(),
    };
    vi.spyOn(mongoose, "startSession").mockResolvedValue(mockSession as any);

    vi.spyOn(Payment, "find").mockReturnValue({
      session: vi.fn().mockResolvedValue([]),
      then: (res: any) => Promise.resolve([]).then(res),
    } as any);

    // 0 stock at Warehouse -> completeSale throws Insufficient stock
    vi.spyOn(Inventory, "findOne").mockReturnValue({
      session: vi.fn().mockResolvedValue({ quantity: 0 }),
      then: (res: any) => Promise.resolve({ quantity: 0 }).then(res),
    } as any);

    const req = new Request("http://localhost/api/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creationMode: "DIRECT_COUNTER",
        saleSource: "DIRECT_COUNTER",
        locationId: locId,
        items: [{ productId: prodId, quantity: 1, unitPrice: 15000 }],
        directComplete: true,
        paymentAllocations: [{ method: "CASH", amount: 15000 }],
      }),
    });

    const res = await createSalePOST(req as any);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error).toContain("Insufficient stock");
    expect(deleteSpy).toHaveBeenCalledWith({
      _id: createdSaleId,
      status: { $ne: "COMPLETED" },
    });
  });

  it("allows deferred serials on Advance Booking createSaleInput while rejecting partial serials", async () => {
    vi.spyOn(Location, "findById").mockResolvedValue({
      _id: new Types.ObjectId(locId),
      name: "Warehouse",
      active: true,
    } as any);

    vi.spyOn(Product, "findById").mockResolvedValue({
      _id: new Types.ObjectId(prodId),
      name: "PS5 Slim",
      sku: "PS5-SLIM",
      barcode: "PGS-PS5",
      condition: "New",
      sellingPrice: 180000,
      minSellingPrice: 175000,
      costPrice: 160000,
      serialTracking: true,
    } as any);

    vi.spyOn(Sale.prototype, "save").mockImplementation(function (this: any) {
      this._id = new Types.ObjectId();
      return Promise.resolve(this);
    });

    const deferred = await createSaleInput({
      creationMode: "DIRECT_COUNTER",
      saleSource: "ADVANCE_BOOKING",
      locationId: locId,
      customerName: "Bilal",
      customerPhone: "03001234567",
      items: [{ productId: prodId, quantity: 2, unitPrice: 180000, serialNumbers: [] }],
      createdBy: "cashier1",
      allowDeferredSerials: true,
    });
    expect(deferred.sale.status).toBe("PAYMENT_PENDING");
    expect(deferred.sale.items[0].serialNumbers).toEqual([]);

    await expect(
      createSaleInput({
        creationMode: "DIRECT_COUNTER",
        saleSource: "ADVANCE_BOOKING",
        locationId: locId,
        customerName: "Bilal",
        customerPhone: "03001234567",
        items: [{ productId: prodId, quantity: 2, unitPrice: 180000, serialNumbers: ["ONLY-ONE"] }],
        createdBy: "cashier1",
        allowDeferredSerials: true,
      })
    ).rejects.toThrow("requires exact 2 serial numbers");
  });

  it("records split payments, cash movement for cash slice only, and ledger deposit in POST /api/sales/advance", async () => {
    const advSaleId = new Types.ObjectId("60c72b2f9b1d8b2b8c8b4902");

    vi.spyOn(Location, "findById").mockImplementation(() => ({
      lean: vi.fn().mockResolvedValue({ _id: new Types.ObjectId(locId), name: "Warehouse", active: true }),
      then: (res: any) => Promise.resolve({ _id: new Types.ObjectId(locId), name: "Warehouse", active: true }).then(res),
    }) as any);

    vi.spyOn(Product, "findById").mockResolvedValue({
      _id: new Types.ObjectId(prodId),
      name: "PS5 Slim",
      sku: "PS5-SLIM",
      barcode: "PGS-PS5",
      condition: "New",
      sellingPrice: 180000,
      minSellingPrice: 175000,
      costPrice: 160000,
      serialTracking: false,
    } as any);

    const mockSaleInstance: any = {
      _id: advSaleId,
      saleNumber: "SALE-20261119-002",
      location: new Types.ObjectId(locId),
      locationName: "Warehouse",
      customer: new Types.ObjectId("60c72b2f9b1d8b2b8c8b4599"),
      customerName: "Bilal",
      customerPhone: "03001234567",
      totalAmount: 180000,
      subtotal: 180000,
      discountAmount: 0,
      deliveryCharges: 0,
      totalPaid: 0,
      balanceDue: 180000,
      status: "PAYMENT_PENDING",
      items: [{ product: new Types.ObjectId(prodId), productName: "PS5 Slim", quantity: 1, unitPrice: 180000, lineTotal: 180000, serialNumbers: [] }],
      save: vi.fn().mockResolvedValue(true),
    };

    vi.spyOn(Sale.prototype, "save").mockImplementation(function (this: any) {
      this._id = advSaleId;
      return Promise.resolve(this);
    });

    vi.spyOn(Sale, "findById").mockImplementation(() => ({
      session: vi.fn().mockResolvedValue(mockSaleInstance),
      lean: vi.fn().mockResolvedValue(mockSaleInstance),
      then: (res: any) => Promise.resolve(mockSaleInstance).then(res),
    }) as any);

    const mockSession = {
      startTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      abortTransaction: vi.fn(),
      endSession: vi.fn(),
    };
    vi.spyOn(mongoose, "startSession").mockResolvedValue(mockSession as any);

    const cashSessionId = new Types.ObjectId("60c72b2f9b1d8b2b8c8b4955");
    vi.spyOn(CashSession, "findOne").mockReturnValue({
      session: vi.fn().mockResolvedValue({ _id: cashSessionId, location: locId, cashier: "cashier1", status: "OPEN" }),
    } as any);

    const paymentSaveSpy = vi.spyOn(Payment.prototype, "save").mockImplementation(function (this: any) {
      this._id = new Types.ObjectId();
      return Promise.resolve(this);
    });

    vi.spyOn(SerialNumber, "updateMany").mockResolvedValue({ modifiedCount: 0 } as any);

    const req = new Request("http://localhost/api/sales/advance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locationId: locId,
        customerName: "Bilal",
        customerPhone: "03001234567",
        items: [{ productId: prodId, quantity: 1, unitPrice: 180000 }],
        advanceAmount: 50000,
        paymentAllocations: [
          { method: "CASH", amount: 20000 },
          { method: "BANK_TRANSFER", amount: 30000, referenceNumber: "IBFT-123" },
        ],
        expectedDate: "2026-11-25",
      }),
    });

    const res = await createAdvancePOST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(paymentSaveSpy).toHaveBeenCalledTimes(2);
    expect(cashSessionEngine.recordCashMovement).toHaveBeenCalledTimes(1);
    expect(cashSessionEngine.recordCashMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "CASH_SALE",
        amount: 20000,
        direction: "IN",
      }),
      mockSession
    );
    expect(customerLedgerEngine.recordCustomerLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ADVANCE_DEPOSIT",
        amount: 50000,
      }),
      mockSession
    );
    expect(json.data.receiptData.payments).toEqual([
      { method: "CASH", amount: 20000 },
      { method: "BANK_TRANSFER", amount: 30000 },
    ]);
  });

  it("completes 100%-paid advance booking without creating a zero-amount Payment", async () => {
    const saleObjId = new Types.ObjectId("60c72b2f9b1d8b2b8c8b4909");
    const mockSale = {
      _id: saleObjId,
      saleNumber: "SALE-20261119-009",
      location: new Types.ObjectId(locId),
      locationName: "Warehouse",
      customerName: "Bilal",
      status: "PAYMENT_PENDING",
      subtotal: 50000,
      discountAmount: 0,
      taxAmount: 0,
      deliveryCharges: 0,
      additionalCharges: 0,
      totalAmount: 50000,
      totalPaid: 50000,
      balanceDue: 0,
      items: [
        {
          product: new Types.ObjectId(prodId),
          productName: "Controller",
          sku: "CTRL-1",
          barcode: "PGS-CTRL",
          condition: "New",
          quantity: 1,
          unitCost: 30000,
          unitPrice: 50000,
          lineTotal: 50000,
          serialNumbers: [],
        },
      ],
      save: vi.fn().mockResolvedValue(true),
    };

    vi.spyOn(Sale, "findById").mockImplementation(() => ({
      session: vi.fn().mockResolvedValue(mockSale),
      then: (res: any) => Promise.resolve(mockSale).then(res),
    }) as any);
    vi.spyOn(Sale, "findOneAndUpdate").mockResolvedValue({ ...mockSale, status: "PROCESSING" } as any);

    const mockSession = {
      startTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      abortTransaction: vi.fn(),
      endSession: vi.fn(),
    };
    vi.spyOn(mongoose, "startSession").mockResolvedValue(mockSession as any);

    vi.spyOn(Location, "findById").mockImplementation(() => ({
      session: vi.fn().mockResolvedValue({ _id: new Types.ObjectId(locId), name: "Warehouse" }),
      then: (res: any) => Promise.resolve({ _id: new Types.ObjectId(locId), name: "Warehouse" }).then(res),
    }) as any);

    // Existing Rs. 50,000 advance already PAID
    vi.spyOn(Payment, "find").mockReturnValue({
      session: vi.fn().mockResolvedValue([{ amount: 50000, status: "PAID", paymentMethod: "CASH" }]),
      then: (res: any) => Promise.resolve([{ amount: 50000, status: "PAID", paymentMethod: "CASH" }]).then(res),
    } as any);

    vi.spyOn(Inventory, "findOne").mockReturnValue({
      session: vi.fn().mockResolvedValue({ quantity: 2 }),
      then: (res: any) => Promise.resolve({ quantity: 2 }).then(res),
    } as any);

    vi.spyOn(Invoice.prototype, "save").mockImplementation(function (this: any) {
      this._id = new Types.ObjectId();
      return Promise.resolve(this);
    });
    const paySaveSpy = vi.spyOn(Payment.prototype, "save").mockImplementation(function (this: any) {
      this._id = new Types.ObjectId();
      return Promise.resolve(this);
    });
    vi.spyOn(CashSession, "findOne").mockReturnValue({
      session: vi.fn().mockResolvedValue(null),
      then: (res: any) => Promise.resolve(null).then(res),
    } as any);
    vi.spyOn(InventoryMovement.prototype, "save").mockResolvedValue({} as any);

    const result = await completeSale({
      saleId: saleObjId.toString(),
      completedBy: "cashier1",
      paymentAllocations: [],
    });

    expect(result.sale.status).toBe("COMPLETED");
    expect(paySaveSpy).not.toHaveBeenCalled();
    expect(mockSession.commitTransaction).toHaveBeenCalled();
  });
});
