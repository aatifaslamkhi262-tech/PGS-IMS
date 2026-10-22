import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose, { Types } from "mongoose";
import { completeSale } from "./salesEngine";
import { Sale } from "@/models/Sale";
import { Product } from "@/models/Product";
import { Location } from "@/models/Location";
import { Inventory } from "@/models/Inventory";
import { SerialNumber } from "@/models/SerialNumber";
import { Invoice } from "@/models/Invoice";
import { Payment } from "@/models/Payment";
import { CashSession } from "@/models/CashSession";
import { InventoryMovement } from "@/models/InventoryMovement";
import * as averageCostEngine from "./averageCostEngine";
import * as customerLedgerEngine from "./customerLedgerEngine";

vi.mock("@/lib/db", () => ({
  dbConnect: vi.fn(),
}));

describe("Website Order Serialized Product Queue Fulfillment Fix", () => {
  const saleObjId = new Types.ObjectId("60c72b2f9b1d8b2b8c8b9901");
  const prodObjId = new Types.ObjectId("60c72b2f9b1d8b2b8c8b9902");
  const locObjId = new Types.ObjectId("60c72b2f9b1d8b2b8c8b9903");

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(Sale, "countDocuments").mockResolvedValue(0);
    vi.spyOn(Invoice, "countDocuments").mockResolvedValue(0);
    vi.spyOn(Payment, "countDocuments").mockResolvedValue(0);
    vi.spyOn(CashSession, "countDocuments").mockResolvedValue(0);
  });

  it("Enforces that serialized website orders CANNOT be completed in queue without serial numbers", async () => {
    const mockSale = {
      _id: saleObjId,
      saleNumber: "WEB-20261021-001",
      location: locObjId,
      locationName: "Central Warehouse",
      customerName: "Ahmad",
      saleSource: "WEBSITE",
      status: "CHECKOUT",
      subtotal: 180000,
      discountAmount: 0,
      taxAmount: 0,
      deliveryCharges: 0,
      additionalCharges: 0,
      totalAmount: 180000,
      items: [
        {
          product: prodObjId,
          productName: "PlayStation 5 Disc Edition",
          sku: "PS5-DISC",
          barcode: "PGS-PS5-001",
          condition: "New",
          quantity: 1,
          unitCost: 160000,
          unitPrice: 180000,
          lineTotal: 180000,
          serialNumbers: [], // Website order checkout had NO serials assigned yet!
        },
      ],
      save: vi.fn().mockResolvedValue(true),
    };

    const findQuery = {
      session: vi.fn().mockResolvedValue(mockSale),
      then: (resolve: any) => Promise.resolve(mockSale).then(resolve),
    };
    vi.spyOn(Sale, "findById").mockReturnValue(findQuery as any);
    vi.spyOn(Sale, "findOneAndUpdate").mockResolvedValue({ _id: saleObjId, status: "PROCESSING" } as any);

    const mockSession = {
      startTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      abortTransaction: vi.fn(),
      endSession: vi.fn(),
    };
    vi.spyOn(mongoose, "startSession").mockResolvedValue(mockSession as any);

    vi.spyOn(Location, "findById").mockReturnValue({
      session: vi.fn().mockResolvedValue({ _id: locObjId, name: "Central Warehouse" }),
      then: (resolve: any) => Promise.resolve({ _id: locObjId, name: "Central Warehouse" }).then(resolve),
    } as any);

    vi.spyOn(Payment, "find").mockReturnValue({
      session: vi.fn().mockResolvedValue([]),
      then: (resolve: any) => Promise.resolve([]).then(resolve),
    } as any);

    vi.spyOn(Inventory, "findOne").mockReturnValue({
      session: vi.fn().mockResolvedValue({ quantity: 3 }),
      then: (resolve: any) => Promise.resolve({ quantity: 3 }).then(resolve),
    } as any);

    // Mock Product as serialized
    vi.spyOn(Product, "findById").mockReturnValue({
      session: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ _id: prodObjId, name: "PlayStation 5 Disc Edition", serialTracking: true }),
        exec: vi.fn().mockResolvedValue({ _id: prodObjId, name: "PlayStation 5 Disc Edition", serialTracking: true }),
      }),
      exec: vi.fn().mockResolvedValue({ _id: prodObjId, name: "PlayStation 5 Disc Edition", serialTracking: true }),
    } as any);

    // Attempting to checkout without serial numbers MUST fail with clear error
    await expect(
      completeSale({
        saleId: saleObjId.toString(),
        completedBy: "warehouse_staff",
        paymentAllocations: [{ method: "CASH", amount: 180000 }],
        itemSerials: [], // Missing serials
      })
    ).rejects.toThrow("requires exactly 1 serial number(s) to complete checkout");

    expect(mockSession.abortTransaction).toHaveBeenCalled();
  });

  it("Successfully attaches scanned serials, marks serial status Sold, and includes serial in invoice", async () => {
    const mockSale = {
      _id: saleObjId,
      saleNumber: "WEB-20261021-002",
      location: locObjId,
      locationName: "Central Warehouse",
      customerName: "Kamran",
      saleSource: "WEBSITE",
      status: "CHECKOUT",
      subtotal: 180000,
      discountAmount: 0,
      taxAmount: 0,
      deliveryCharges: 0,
      additionalCharges: 0,
      totalAmount: 180000,
      items: [
        {
          product: prodObjId,
          productName: "PlayStation 5 Disc Edition",
          sku: "PS5-DISC",
          barcode: "PGS-PS5-001",
          condition: "New",
          quantity: 1,
          unitCost: 160000,
          unitPrice: 180000,
          lineTotal: 180000,
          serialNumbers: [],
        },
      ],
      save: vi.fn().mockResolvedValue(true),
    };

    const findQuery = {
      session: vi.fn().mockResolvedValue(mockSale),
      then: (resolve: any) => Promise.resolve(mockSale).then(resolve),
    };
    vi.spyOn(Sale, "findById").mockReturnValue(findQuery as any);
    vi.spyOn(Sale, "findOneAndUpdate").mockResolvedValue({ _id: saleObjId, status: "PROCESSING" } as any);

    const mockSession = {
      startTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      abortTransaction: vi.fn(),
      endSession: vi.fn(),
    };
    vi.spyOn(mongoose, "startSession").mockResolvedValue(mockSession as any);

    vi.spyOn(Location, "findById").mockReturnValue({
      session: vi.fn().mockResolvedValue({ _id: locObjId, name: "Central Warehouse" }),
      then: (resolve: any) => Promise.resolve({ _id: locObjId, name: "Central Warehouse" }).then(resolve),
    } as any);

    vi.spyOn(Payment, "find").mockReturnValue({
      session: vi.fn().mockResolvedValue([]),
      then: (resolve: any) => Promise.resolve([]).then(resolve),
    } as any);

    vi.spyOn(Inventory, "findOne").mockReturnValue({
      session: vi.fn().mockResolvedValue({ quantity: 3 }),
      then: (resolve: any) => Promise.resolve({ quantity: 3 }).then(resolve),
    } as any);

    vi.spyOn(Product, "findById").mockReturnValue({
      session: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ _id: prodObjId, name: "PlayStation 5 Disc Edition", serialTracking: true }),
        exec: vi.fn().mockResolvedValue({ _id: prodObjId, name: "PlayStation 5 Disc Edition", serialTracking: true }),
      }),
      exec: vi.fn().mockResolvedValue({ _id: prodObjId, name: "PlayStation 5 Disc Edition", serialTracking: true }),
    } as any);

    const serialDoc = {
      _id: new Types.ObjectId(),
      product: prodObjId,
      serialNumber: "SN-PS5-998877",
      status: "Available",
      save: vi.fn().mockResolvedValue(true),
    };

    vi.spyOn(SerialNumber, "findOne").mockReturnValue({
      session: vi.fn().mockResolvedValue(serialDoc),
      then: (resolve: any) => Promise.resolve(serialDoc).then(resolve),
    } as any);

    vi.spyOn(Invoice.prototype, "save").mockImplementation(function (this: any) {
      this._id = new Types.ObjectId();
      return Promise.resolve(this);
    });

    vi.spyOn(Payment.prototype, "save").mockImplementation(function (this: any) {
      this._id = new Types.ObjectId();
      return Promise.resolve(this);
    });

    vi.spyOn(CashSession, "findOne").mockReturnValue({
      session: vi.fn().mockResolvedValue(null),
      then: (resolve: any) => Promise.resolve(null).then(resolve),
    } as any);

    vi.spyOn(InventoryMovement.prototype, "save").mockResolvedValue({} as any);

    vi.spyOn(averageCostEngine, "deductInventoryWithAverageCost").mockResolvedValue({
      remainingQty: 2,
      unitCost: 160000,
      totalCost: 160000,
    } as any);
    vi.spyOn(customerLedgerEngine, "recordCustomerLedgerEntry").mockResolvedValue({} as any);

    // Provide the scanned serial number from the Queue Modal
    const result = await completeSale({
      saleId: saleObjId.toString(),
      completedBy: "warehouse_staff",
      paymentAllocations: [{ method: "CASH", amount: 180000 }],
      itemSerials: [
        {
          productId: prodObjId.toString(),
          serialNumbers: ["SN-PS5-998877"],
        },
      ],
    });

    expect(result.sale.status).toBe("COMPLETED");
    expect(result.sale.items[0].serialNumbers).toEqual(["SN-PS5-998877"]);
    expect(serialDoc.status).toBe("Sold");
    expect(serialDoc.save).toHaveBeenCalled();
    expect(result.invoice?.items[0].serialNumbers).toEqual(["SN-PS5-998877"]);
    expect(mockSession.commitTransaction).toHaveBeenCalled();
  });
});
