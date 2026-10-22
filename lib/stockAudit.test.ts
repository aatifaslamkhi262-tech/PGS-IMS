import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose, { Types } from "mongoose";
import {
  generateStockAuditNumber,
  analyzeStockAudit,
  executeStockAuditReconciliation,
} from "./stockAuditEngine";
import { StockAudit } from "@/models/StockAudit";
import { Location } from "@/models/Location";
import { Inventory } from "@/models/Inventory";
import { SerialNumber } from "@/models/SerialNumber";
import { Product } from "@/models/Product";
import { InventoryMovement } from "@/models/InventoryMovement";

vi.mock("@/lib/db", () => ({
  dbConnect: vi.fn(),
}));

describe("Physical Shelf Stock Audit & Reconciliation Engine", () => {
  const g14LocationId = new Types.ObjectId("60c72b2f9b1d8b2b8c8ba001");
  const dhaLocationId = new Types.ObjectId("60c72b2f9b1d8b2b8c8ba002");
  const ps5ProductId = new Types.ObjectId("60c72b2f9b1d8b2b8c8ba003");
  const gta5ProductId = new Types.ObjectId("60c72b2f9b1d8b2b8c8ba004");

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(StockAudit, "countDocuments").mockResolvedValue(0);
  });

  it("generateStockAuditNumber formats correct prefix and sequence", async () => {
    const num = await generateStockAuditNumber();
    expect(num).toMatch(/^AUD-\d{8}-001$/);
  });

  it("analyzeStockAudit accurately identifies missing serials, cross-branch relocations, and non-serialized discrepancies", async () => {
    // Mock target location (DHA)
    vi.spyOn(Location, "findById").mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: dhaLocationId,
        name: "DHA Branch",
      }),
    } as any);

    // Mock all locations
    vi.spyOn(Location, "find").mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        { _id: dhaLocationId, name: "DHA Branch" },
        { _id: g14LocationId, name: "G-14 Branch" },
      ]),
    } as any);

    // Mock DHA Inventory (PS5 has 3 units @ 180k, GTA V has 10 units @ 8k)
    vi.spyOn(Inventory, "find").mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            _id: new Types.ObjectId(),
            product: { _id: ps5ProductId, name: "PS5 Console", serialTracking: true, costPrice: 180000 },
            location: dhaLocationId,
            condition: "New",
            quantity: 3,
            averageCost: 180000,
          },
          {
            _id: new Types.ObjectId(),
            product: { _id: gta5ProductId, name: "GTA V Disc", serialTracking: false, costPrice: 8000 },
            location: dhaLocationId,
            condition: "New",
            quantity: 10,
            averageCost: 8000,
          },
        ]),
      }),
    } as any);

    // Mock DHA Local Available Serials in DB: SN-DHA-1, SN-DHA-2, SN-DHA-3
    vi.spyOn(SerialNumber, "find")
      .mockImplementationOnce(() => {
        // First call: local available serials query
        return {
          populate: vi.fn().mockReturnValue({
            lean: vi.fn().mockResolvedValue([
              {
                _id: new Types.ObjectId(),
                product: { _id: ps5ProductId, name: "PS5 Console", costPrice: 180000 },
                serialNumber: "SN-DHA-1",
                status: "Available",
                location: dhaLocationId.toString(),
                condition: "New",
              },
              {
                _id: new Types.ObjectId(),
                product: { _id: ps5ProductId, name: "PS5 Console", costPrice: 180000 },
                serialNumber: "SN-DHA-2",
                status: "Available",
                location: dhaLocationId.toString(),
                condition: "New",
              },
              {
                _id: new Types.ObjectId(),
                product: { _id: ps5ProductId, name: "PS5 Console", costPrice: 180000 },
                serialNumber: "SN-DHA-3",
                status: "Available",
                location: dhaLocationId.toString(),
                condition: "New",
              },
            ]),
          }),
        } as any;
      })
      .mockImplementationOnce(() => {
        // Second call: scanned serials lookup across all DB
        return {
          populate: vi.fn().mockReturnValue({
            lean: vi.fn().mockResolvedValue([
              {
                _id: new Types.ObjectId(),
                product: { _id: ps5ProductId, name: "PS5 Console", costPrice: 180000 },
                serialNumber: "SN-DHA-1",
                status: "Available",
                location: dhaLocationId.toString(),
                condition: "New",
              },
              {
                _id: new Types.ObjectId(),
                product: { _id: ps5ProductId, name: "PS5 Console", costPrice: 180000 },
                serialNumber: "SN-G14-99", // Belongs to G-14!
                status: "Available",
                location: g14LocationId.toString(),
                condition: "New",
              },
            ]),
          }),
        } as any;
      });

    // Staff scanned: SN-DHA-1 AND SN-G14-99 (which belongs to G-14!)
    // Note: SN-DHA-2 and SN-DHA-3 were NOT scanned (they are missing / phantom sold!)
    // Physical GTA V count is 7 (system has 10, discrepancy = -3)
    const analysis = await analyzeStockAudit({
      locationId: dhaLocationId.toString(),
      scannedSerials: ["SN-DHA-1", "SN-G14-99"],
      physicalCounts: [
        {
          productId: gta5ProductId.toString(),
          condition: "New",
          physicalQuantity: 7,
        },
      ],
    });

    // Verify Missing Serials (SN-DHA-2, SN-DHA-3 were missing on shelf)
    expect(analysis.missingSerials).toHaveLength(2);
    expect(analysis.missingSerials.map((m) => m.serialNumber)).toEqual(["SN-DHA-2", "SN-DHA-3"]);

    // Verify Cross-Branch Detection (SN-G14-99 belongs to G-14)
    expect(analysis.crossBranchSerials).toHaveLength(1);
    expect(analysis.crossBranchSerials[0].serialNumber).toBe("SN-G14-99");
    expect(analysis.crossBranchSerials[0].fromLocationName).toBe("G-14 Branch");
    expect(analysis.crossBranchSerials[0].toLocationName).toBe("DHA Branch");

    // Verify Non-Serialized Variance (-3 GTA V Discs)
    expect(analysis.itemVariances).toHaveLength(1);
    expect(analysis.itemVariances[0].variance).toBe(-3);
    expect(analysis.itemVariances[0].totalCostDelta).toBe(-24000); // -3 * 8000

    // Summary checks
    expect(analysis.summary.totalMissingUnits).toBe(5); // 2 PS5s + 3 GTA V Discs
    expect(analysis.summary.totalCrossBranchUnits).toBe(1);
  });

  it("executeStockAuditReconciliation marks missing serials as Sold and deducts inventory safely", async () => {
    const auditObjId = new Types.ObjectId("60c72b2f9b1d8b2b8c8ba009");
    const mockAudit = {
      _id: auditObjId,
      auditNumber: "AUD-20261021-001",
      location: dhaLocationId,
      locationName: "DHA Branch",
      status: "PENDING_APPROVAL",
      performedBy: "salman_cashier",
      missingSerials: [
        {
          product: ps5ProductId,
          productName: "PS5 Console",
          serialNumber: "SN-MISSING-01",
          condition: "New",
          unitCost: 180000,
        },
      ],
      crossBranchSerials: [],
      unregisteredSerials: [],
      reactivatedSerials: [],
      itemVariances: [
        {
          product: gta5ProductId,
          productName: "GTA V Disc",
          condition: "New",
          systemQuantity: 10,
          physicalQuantity: 8,
          variance: -2,
          unitCost: 8000,
          totalCostDelta: -16000,
        },
      ],
      save: vi.fn().mockResolvedValue(true),
    };

    const mockSession = {
      startTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      abortTransaction: vi.fn(),
      endSession: vi.fn(),
    };

    vi.spyOn(StockAudit, "findById").mockReturnValue({
      session: vi.fn().mockResolvedValue(mockAudit),
    } as any);

    vi.spyOn(Location, "findById").mockReturnValue({
      session: vi.fn().mockResolvedValue({ _id: dhaLocationId, name: "DHA Branch" }),
    } as any);

    const missingSerialDoc = {
      serialNumber: "SN-MISSING-01",
      status: "Available",
      save: vi.fn().mockResolvedValue(true),
    };

    vi.spyOn(SerialNumber, "findOne").mockReturnValue({
      session: vi.fn().mockResolvedValue(missingSerialDoc),
    } as any);

    const mockPs5Inv = {
      product: ps5ProductId,
      quantity: 5,
      averageCost: 180000,
      totalCostValue: 900000,
      save: vi.fn().mockResolvedValue(true),
    };
    const mockGtaInv = {
      product: gta5ProductId,
      quantity: 10,
      averageCost: 8000,
      totalCostValue: 80000,
      save: vi.fn().mockResolvedValue(true),
    };

    vi.spyOn(Inventory, "findOne")
      .mockImplementationOnce(() => ({
        session: vi.fn().mockResolvedValue(mockPs5Inv),
      } as any))
      .mockImplementationOnce(() => ({
        session: vi.fn().mockResolvedValue(mockGtaInv),
      } as any));

    vi.spyOn(InventoryMovement.prototype, "save").mockResolvedValue({} as any);

    const reconciledAudit = await executeStockAuditReconciliation(
      auditObjId.toString(),
      "admin_user",
      mockSession as any
    );

    // Missing serial is marked Sold
    expect(missingSerialDoc.status).toBe("Sold");
    expect(missingSerialDoc.save).toHaveBeenCalled();

    // PS5 inventory deducted from 5 to 4
    expect(mockPs5Inv.quantity).toBe(4);
    expect(mockPs5Inv.totalCostValue).toBe(720000); // 4 * 180000

    // GTA V inventory updated from 10 to 8
    expect(mockGtaInv.quantity).toBe(8);
    expect(mockGtaInv.totalCostValue).toBe(64000); // 8 * 8000

    // Audit status set to APPROVED
    expect(reconciledAudit.status).toBe("APPROVED");
    expect(reconciledAudit.approvedBy).toBe("admin_user");
    expect(mockAudit.save).toHaveBeenCalled();
  });
});
