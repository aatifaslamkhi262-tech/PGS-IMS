import { describe, it, expect, beforeEach, vi } from "vitest";
import { StockTransfer } from "@/models/StockTransfer";
import { Inventory } from "@/models/Inventory";
import { Product } from "@/models/Product";
import { SerialNumber } from "@/models/SerialNumber";
import { Location } from "@/models/Location";
import { User } from "@/models/User";
import { InventoryMovement } from "@/models/InventoryMovement";
import {
  generateTransferNumber,
  executeDispatch,
  executeReceive,
  executeReturnToSource,
  executeDirectReject,
  executeCancelTransfer,
} from "@/lib/stockTransfer";
import mongoose, { Types } from "mongoose";

describe("Stock Transfer Module & Audit Tests", () => {
  // Test IDs
  const warehouseLocId = new Types.ObjectId();
  const branch1LocId = new Types.ObjectId();
  const branch2LocId = new Types.ObjectId();

  const nonSerialProdId = new Types.ObjectId();
  const serialProdId = new Types.ObjectId();

  const adminUserId = new Types.ObjectId();
  const carrierUserId = new Types.ObjectId();
  const inactiveCarrierUserId = new Types.ObjectId();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockFindOneSortLean = (val: any = null) => {
    return {
      sort: () => ({
        lean: () => Promise.resolve(val),
      }),
    };
  };

  it("1. Should generate unique transfer numbers in format TRF-YYYYMMDD-XXX", async () => {
    vi.spyOn(StockTransfer, "findOne").mockReturnValue(mockFindOneSortLean(null) as any);

    const num = await generateTransferNumber();
    expect(num).toMatch(/^TRF-\d{8}-001$/);
  });

  it("2. Should validate StockTransfer schema fields correctly", () => {
    const tr = new StockTransfer({
      transferNumber: "TRF-20260827-001",
      type: "Normal",
      sourceLocation: warehouseLocId,
      destinationLocation: branch1LocId,
      status: "Draft",
      items: [
        {
          product: nonSerialProdId,
          condition: "New",
          quantity: 2,
        },
      ],
      createdBy: "ahmed_mgr",
    });

    const err = tr.validateSync();
    expect(err).toBeUndefined();
    expect(tr.transferNumber).toBe("TRF-20260827-001");
    expect(tr.status).toBe("Draft");
  });

  it("3. Should reject creating a transfer without items", () => {
    const tr = new StockTransfer({
      transferNumber: "TRF-20260827-002",
      sourceLocation: warehouseLocId,
      destinationLocation: branch1LocId,
      items: [],
      createdBy: "ahmed_mgr",
    });

    const err = tr.validateSync();
    expect(err).toBeDefined();
    expect(err?.errors["items"]).toBeDefined();
  });

  it("4. Should execute Dispatch: decrease Source inventory, record carrier snapshot, and place stock In-Transit", async () => {
    const sourceLocDoc = { _id: warehouseLocId, name: "Main Warehouse", type: "Warehouse" };
    const destLocDoc = { _id: branch1LocId, name: "Branch Gulshan", type: "Branch" };

    const carrierUserDoc = {
      _id: carrierUserId,
      name: "Ali Helper",
      username: "ali_runner",
      active: true,
    };

    const transferDoc = new StockTransfer({
      _id: new Types.ObjectId(),
      transferNumber: "TRF-20260827-010",
      type: "Normal",
      sourceLocation: warehouseLocId,
      destinationLocation: branch1LocId,
      status: "Approved",
      items: [
        {
          product: nonSerialProdId,
          condition: "New",
          quantity: 2,
        },
      ],
      createdBy: "kamran_mgr",
    });
    vi.spyOn(transferDoc, "save").mockResolvedValue(transferDoc as any);

    const invDoc = new Inventory({
      product: nonSerialProdId,
      location: warehouseLocId,
      condition: "New",
      quantity: 10,
      averageCost: 5000,
      totalCostValue: 50000,
      status: "In Stock",
    });
    vi.spyOn(invDoc, "save").mockResolvedValue(invDoc as any);

    vi.spyOn(StockTransfer, "findById").mockReturnValue({
      populate: () => ({
        populate: () => Promise.resolve(transferDoc),
      }),
    } as any);

    vi.spyOn(User, "findById").mockResolvedValue(carrierUserDoc as any);
    vi.spyOn(Location, "findById").mockImplementation(((id: any) => {
      const idStr = id ? id.toString() : "";
      if (idStr === branch1LocId.toString()) return Promise.resolve(destLocDoc as any);
      return Promise.resolve(sourceLocDoc as any);
    }) as any);

    vi.spyOn(Product, "findById").mockResolvedValue({
      _id: nonSerialProdId,
      name: "PS5 Controller",
      serialTracking: false,
    } as any);

    vi.spyOn(Inventory, "findOne").mockResolvedValue(invDoc as any);
    vi.spyOn(InventoryMovement, "create").mockResolvedValue({} as any);

    const result = await executeDispatch({
      transferId: transferDoc._id.toString(),
      actionUsername: "ahmed_mgr",
      carrierUserId: carrierUserId.toString(),
      notes: "Handed to Ali Helper",
    });

    expect(result.status).toBe("Dispatched");
    expect(result.dispatchedBy).toBe("ahmed_mgr");
    expect(result.carrierName).toBe("Ali Helper");
    expect(result.carrierUsername).toBe("ali_runner");
    expect(result.dispatchedAt).toBeDefined();

    // Source inventory decreased from 10 to 8
    expect(invDoc.quantity).toBe(8);

    // Verify InventoryMovement audit logged
    expect(InventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "TRANSFER",
        referenceTransaction: "TRF-20260827-010",
        beforeQuantity: 10,
        afterQuantity: 8,
        dispatchedBy: "ahmed_mgr",
        carrierName: "Ali Helper",
        carrierUsername: "ali_runner",
      })
    );
  });

  it("5. Should block Dispatch if Carrier user is inactive or invalid", async () => {
    const transferDoc = new StockTransfer({
      _id: new Types.ObjectId(),
      transferNumber: "TRF-20260827-011",
      status: "Approved",
      items: [{ product: nonSerialProdId, condition: "New", quantity: 1 }],
      createdBy: "kamran_mgr",
    });

    vi.spyOn(StockTransfer, "findById").mockReturnValue({
      populate: () => ({
        populate: () => Promise.resolve(transferDoc),
      }),
    } as any);

    vi.spyOn(User, "findById").mockResolvedValue({
      _id: inactiveCarrierUserId,
      name: "Inactive Guy",
      active: false,
    } as any);

    await expect(
      executeDispatch({
        transferId: transferDoc._id.toString(),
        actionUsername: "ahmed_mgr",
        carrierUserId: inactiveCarrierUserId.toString(),
      })
    ).rejects.toThrow("Invalid or inactive carrier user specified.");
  });

  it("6. Should block Dispatch if Source location has insufficient stock", async () => {
    const sourceLocDoc = { _id: warehouseLocId, name: "Main Warehouse" };
    const destLocDoc = { _id: branch1LocId, name: "Branch Gulshan" };

    const transferDoc = new StockTransfer({
      _id: new Types.ObjectId(),
      transferNumber: "TRF-20260827-012",
      status: "Approved",
      sourceLocation: warehouseLocId,
      destinationLocation: branch1LocId,
      items: [{ product: nonSerialProdId, condition: "New", quantity: 50 }],
      createdBy: "kamran_mgr",
    });

    const invDoc = new Inventory({
      product: nonSerialProdId,
      location: warehouseLocId,
      condition: "New",
      quantity: 2,
    });

    vi.spyOn(StockTransfer, "findById").mockReturnValue({
      populate: () => ({
        populate: () => Promise.resolve(transferDoc),
      }),
    } as any);

    vi.spyOn(User, "findById").mockResolvedValue({
      _id: carrierUserId,
      name: "Ali",
      active: true,
    } as any);

    vi.spyOn(Location, "findById").mockImplementation(((id: any) => {
      const idStr = id ? id.toString() : "";
      if (idStr === branch1LocId.toString()) return Promise.resolve(destLocDoc as any);
      return Promise.resolve(sourceLocDoc as any);
    }) as any);

    vi.spyOn(Product, "findById").mockResolvedValue({
      _id: nonSerialProdId,
      name: "PS5 Console",
      serialTracking: false,
    } as any);

    vi.spyOn(Inventory, "findOne").mockResolvedValue(invDoc as any);

    await expect(
      executeDispatch({
        transferId: transferDoc._id.toString(),
        actionUsername: "ahmed_mgr",
        carrierUserId: carrierUserId.toString(),
      })
    ).rejects.toThrow("Insufficient stock for product 'PS5 Console'");
  });

  it("7. Should handle Serialized Product Dispatch by setting serial status to Transferred", async () => {
    const sourceLocDoc = { _id: warehouseLocId, name: "Main Warehouse" };
    const destLocDoc = { _id: branch1LocId, name: "Branch Gulshan" };

    const transferDoc = new StockTransfer({
      _id: new Types.ObjectId(),
      transferNumber: "TRF-20260827-013",
      status: "Approved",
      sourceLocation: warehouseLocId,
      destinationLocation: branch1LocId,
      items: [
        {
          product: serialProdId,
          condition: "New",
          quantity: 2,
          serialNumbers: ["SN-1001", "SN-1002"],
        },
      ],
      createdBy: "kamran_mgr",
    });
    vi.spyOn(transferDoc, "save").mockResolvedValue(transferDoc as any);

    const serialDoc1 = new SerialNumber({
      product: serialProdId,
      serialNumber: "SN-1001",
      status: "Available",
    });
    vi.spyOn(serialDoc1, "save").mockResolvedValue(serialDoc1 as any);

    const serialDoc2 = new SerialNumber({
      product: serialProdId,
      serialNumber: "SN-1002",
      status: "Available",
    });
    vi.spyOn(serialDoc2, "save").mockResolvedValue(serialDoc2 as any);

    const invDoc = new Inventory({
      product: serialProdId,
      location: warehouseLocId,
      condition: "New",
      quantity: 5,
      averageCost: 50000,
      totalCostValue: 250000,
    });
    vi.spyOn(invDoc, "save").mockResolvedValue(invDoc as any);

    vi.spyOn(StockTransfer, "findById").mockReturnValue({
      populate: () => ({
        populate: () => Promise.resolve(transferDoc),
      }),
    } as any);

    vi.spyOn(User, "findById").mockResolvedValue({
      _id: carrierUserId,
      name: "Ali Helper",
      username: "ali",
      active: true,
    } as any);

    vi.spyOn(Location, "findById").mockImplementation(((id: any) => {
      const idStr = id ? id.toString() : "";
      if (idStr === branch1LocId.toString()) return Promise.resolve(destLocDoc as any);
      return Promise.resolve(sourceLocDoc as any);
    }) as any);

    vi.spyOn(Product, "findById").mockResolvedValue({
      _id: serialProdId,
      name: "PS5 Console",
      serialTracking: true,
    } as any);

    vi.spyOn(SerialNumber, "findOne").mockImplementation(((q: any) => {
      if (q.serialNumber === "SN-1001") return Promise.resolve(serialDoc1 as any);
      if (q.serialNumber === "SN-1002") return Promise.resolve(serialDoc2 as any);
      return Promise.resolve(null);
    }) as any);

    vi.spyOn(StockTransfer, "findOne").mockResolvedValue(null);

    vi.spyOn(Inventory, "findOne").mockResolvedValue(invDoc as any);

    vi.spyOn(SerialNumber, "findOne")
      .mockResolvedValueOnce(serialDoc1 as any)
      .mockResolvedValueOnce(serialDoc2 as any);

    vi.spyOn(InventoryMovement, "create").mockResolvedValue({} as any);

    await executeDispatch({
      transferId: transferDoc._id.toString(),
      actionUsername: "ahmed_mgr",
      carrierUserId: carrierUserId.toString(),
    });

    expect(serialDoc1.status).toBe("Transferred");
    expect(serialDoc1.transactionReference).toBe("TRF-20260827-013");
    expect(serialDoc2.status).toBe("Transferred");
  });

  it("8. Should execute Receive: increase Destination inventory and update serial status to Available at destination", async () => {
    const destLocDoc = { _id: branch1LocId, name: "Branch Gulshan" };

    const transferDoc = new StockTransfer({
      _id: new Types.ObjectId(),
      transferNumber: "TRF-20260827-014",
      status: "Dispatched",
      destinationLocation: branch1LocId,
      items: [
        {
          product: serialProdId,
          condition: "New",
          quantity: 1,
          serialNumbers: ["SN-1001"],
          unitCost: 15000,
        },
      ],
      createdBy: "kamran_mgr",
    });
    vi.spyOn(transferDoc, "save").mockResolvedValue(transferDoc as any);

    const serialDoc = new SerialNumber({
      product: serialProdId,
      serialNumber: "SN-1001",
      status: "Transferred",
    });
    vi.spyOn(serialDoc, "save").mockResolvedValue(serialDoc as any);

    vi.spyOn(StockTransfer, "findById").mockReturnValue({
      populate: () => ({
        populate: () => Promise.resolve(transferDoc),
      }),
    } as any);

    vi.spyOn(Location, "findById").mockResolvedValue(destLocDoc as any);
    vi.spyOn(Product, "findById").mockResolvedValue({
      _id: serialProdId,
      name: "PS5 Console",
      serialTracking: true,
    } as any);

    vi.spyOn(Inventory, "findOne").mockResolvedValue(null); // Create new inventory record
    vi.spyOn(Inventory.prototype, "save").mockResolvedValue(true as any);
    vi.spyOn(SerialNumber, "findOne").mockResolvedValue(serialDoc as any);

    const result = await executeReceive({
      transferId: transferDoc._id.toString(),
      receivingUsername: "subhan_rcv",
    });

    expect(result.status).toBe("Received");
    expect(result.receivedBy).toBe("subhan_rcv");
    expect(result.receivedAt).toBeDefined();

    expect(serialDoc.status).toBe("Available");
    expect(serialDoc.location).toBe("Branch Gulshan");
  });

  it("9. Should execute 1-Click Return to Source for completed transfer", async () => {
    const originalTransfer = new StockTransfer({
      _id: new Types.ObjectId(),
      transferNumber: "TRF-20260827-020",
      type: "Normal",
      sourceLocation: warehouseLocId,
      destinationLocation: branch1LocId,
      status: "Received",
      items: [{ product: serialProdId, condition: "New", quantity: 1, serialNumbers: ["SN-1001"] }],
    });

    vi.spyOn(StockTransfer, "findById").mockResolvedValue(originalTransfer as any);
    vi.spyOn(StockTransfer, "findOne")
      .mockResolvedValueOnce(null as any) // Existing return check returns null
      .mockReturnValueOnce(mockFindOneSortLean(null) as any); // generateTransferNumber query

    vi.spyOn(StockTransfer.prototype, "save").mockResolvedValue(true as any);

    const returnTransfer = await executeReturnToSource({
      originalTransferId: originalTransfer._id.toString(),
      requestingUsername: "subhan_rcv",
      reason: "Customer Refused",
    });

    expect(returnTransfer.type).toBe("Return");
    expect(returnTransfer.sourceLocation).toEqual(branch1LocId); // Swapped
    expect(returnTransfer.destinationLocation).toEqual(warehouseLocId); // Swapped
    expect(returnTransfer.reason).toBe("Customer Refused");
    expect(returnTransfer.linkedOriginalTransfer).toEqual(originalTransfer._id);
  });

  it("10. Should execute Direct Reject (Customer Refused before receipt): Destination stock NEVER increases", async () => {
    const originalTransfer = new StockTransfer({
      _id: new Types.ObjectId(),
      transferNumber: "TRF-20260827-030",
      type: "Normal",
      sourceLocation: warehouseLocId,
      destinationLocation: branch1LocId,
      status: "Dispatched",
      items: [{ product: nonSerialProdId, condition: "New", quantity: 2 }],
    });
    vi.spyOn(originalTransfer, "save").mockResolvedValue(originalTransfer as any);

    vi.spyOn(StockTransfer, "findById").mockReturnValue({
      populate: () => ({
        populate: () => Promise.resolve(originalTransfer),
      }),
    } as any);

    vi.spyOn(StockTransfer, "findOne").mockReturnValue(mockFindOneSortLean(null) as any);
    vi.spyOn(StockTransfer.prototype, "save").mockResolvedValue(true as any);

    const result = await executeDirectReject({
      originalTransferId: originalTransfer._id.toString(),
      rejectingUsername: "subhan_rcv",
      reason: "Customer Refused before receipt",
    });

    expect(result.originalTransfer.status).toBe("Rejected");
    expect(result.originalTransfer.rejectedBy).toBe("subhan_rcv");
    expect(result.returnTransfer.type).toBe("Direct_Reject");
    expect(result.returnTransfer.sourceLocation).toEqual(branch1LocId);
    expect(result.returnTransfer.destinationLocation).toEqual(warehouseLocId);
  });

  it("11. Should preserve moving average cost valuation upon dispatch and populate InventoryMovement", async () => {
    const sourceLocDoc = { _id: warehouseLocId, name: "Main Warehouse" };
    const destLocDoc = { _id: branch1LocId, name: "Branch Gulshan" };

    const transferDoc = new StockTransfer({
      _id: new Types.ObjectId(),
      transferNumber: "TRF-20260827-040",
      status: "Approved",
      sourceLocation: warehouseLocId,
      destinationLocation: branch1LocId,
      items: [{ product: nonSerialProdId, condition: "New", quantity: 2 }],
      createdBy: "admin",
    });
    vi.spyOn(transferDoc, "save").mockResolvedValue(transferDoc as any);

    const invDoc = new Inventory({
      product: nonSerialProdId,
      location: warehouseLocId,
      condition: "New",
      quantity: 10,
      averageCost: 15000,
      totalCostValue: 150000,
      status: "In Stock",
    });
    vi.spyOn(invDoc, "save").mockResolvedValue(invDoc as any);

    vi.spyOn(StockTransfer, "findById").mockReturnValue({
      populate: () => ({
        populate: () => Promise.resolve(transferDoc),
      }),
    } as any);

    vi.spyOn(User, "findById").mockResolvedValue({
      _id: carrierUserId,
      name: "Carrier User",
      username: "carrier1",
      active: true,
    } as any);

    vi.spyOn(Location, "findById").mockImplementation(((id: any) => {
      const idStr = id ? id.toString() : "";
      if (idStr === branch1LocId.toString()) return Promise.resolve(destLocDoc as any);
      return Promise.resolve(sourceLocDoc as any);
    }) as any);

    vi.spyOn(Product, "findById").mockResolvedValue({
      _id: nonSerialProdId,
      name: "FC 27",
      serialTracking: false,
    } as any);

    vi.spyOn(Inventory, "findOne").mockResolvedValue(invDoc as any);
    vi.spyOn(InventoryMovement, "create").mockResolvedValue({} as any);

    const result = await executeDispatch({
      transferId: transferDoc._id.toString(),
      actionUsername: "admin",
      carrierUserId: carrierUserId.toString(),
    });

    // 1. Transfer item received snapshotted unitCost
    expect(result.items[0].unitCost).toBe(15000);
    // 2. Source inventory deducted quantity and updated totalCostValue
    expect(invDoc.quantity).toBe(8);
    expect(invDoc.totalCostValue).toBe(120000);
    // 3. InventoryMovement has unitCost and totalCost
    expect(InventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "TRANSFER",
        unitCost: 15000,
        totalCost: 30000,
      })
    );
  });

  it("12. Should calculate weighted moving average cost upon destination receipt", async () => {
    const destLocDoc = { _id: branch1LocId, name: "Branch Gulshan" };

    const transferDoc = new StockTransfer({
      _id: new Types.ObjectId(),
      transferNumber: "TRF-20260827-041",
      status: "Dispatched",
      sourceLocation: warehouseLocId,
      destinationLocation: branch1LocId,
      items: [{ product: nonSerialProdId, condition: "New", quantity: 2, unitCost: 16000 }],
      createdBy: "admin",
    });
    vi.spyOn(transferDoc, "save").mockResolvedValue(transferDoc as any);

    // Existing pool at Branch: 3 units @ 11000 cost = 33000 value
    const destInvDoc = new Inventory({
      product: nonSerialProdId,
      location: branch1LocId,
      condition: "New",
      quantity: 3,
      averageCost: 11000,
      totalCostValue: 33000,
      status: "In Stock",
    });
    vi.spyOn(destInvDoc, "save").mockResolvedValue(destInvDoc as any);

    vi.spyOn(StockTransfer, "findById").mockReturnValue({
      populate: () => ({
        populate: () => Promise.resolve(transferDoc),
      }),
    } as any);

    vi.spyOn(Location, "findById").mockResolvedValue(destLocDoc as any);
    vi.spyOn(Product, "findById").mockResolvedValue({
      _id: nonSerialProdId,
      name: "FC 27",
      serialTracking: false,
    } as any);

    vi.spyOn(Inventory, "findOne").mockResolvedValue(destInvDoc as any);

    const result = await executeReceive({
      transferId: transferDoc._id.toString(),
      receivingUsername: "branch_staff",
    });

    expect(result.status).toBe("Received");
    // New Qty = 3 + 2 = 5
    expect(destInvDoc.quantity).toBe(5);
    // New Avg Cost = (3 * 11000 + 2 * 16000) / 5 = (33000 + 32000) / 5 = 65000 / 5 = 13000
    expect(destInvDoc.averageCost).toBe(13000);
    expect(destInvDoc.totalCostValue).toBe(65000);
  });

  it("13. Should recalculate totalCostValue when restoring cancelled transfer", async () => {
    const sourceLocDoc = { _id: warehouseLocId, name: "Main Warehouse" };

    const transferDoc = new StockTransfer({
      _id: new Types.ObjectId(),
      transferNumber: "TRF-20260827-042",
      status: "Dispatched",
      sourceLocation: warehouseLocId,
      destinationLocation: branch1LocId,
      items: [{ product: nonSerialProdId, condition: "New", quantity: 2, unitCost: 14000 }],
      dispatchedAt: new Date(),
    });
    vi.spyOn(transferDoc, "save").mockResolvedValue(transferDoc as any);

    const sourceInvDoc = new Inventory({
      product: nonSerialProdId,
      location: warehouseLocId,
      condition: "New",
      quantity: 5,
      averageCost: 14000,
      totalCostValue: 70000,
      status: "In Stock",
    });
    vi.spyOn(sourceInvDoc, "save").mockResolvedValue(sourceInvDoc as any);

    vi.spyOn(StockTransfer, "findById").mockReturnValue({
      populate: () => ({
        populate: () => Promise.resolve(transferDoc),
      }),
    } as any);

    vi.spyOn(Location, "findById").mockResolvedValue(sourceLocDoc as any);
    vi.spyOn(Product, "findById").mockResolvedValue({
      _id: nonSerialProdId,
      name: "FC 27",
    } as any);
    vi.spyOn(Inventory, "findOne").mockResolvedValue(sourceInvDoc as any);
    vi.spyOn(InventoryMovement, "find").mockResolvedValue([{ referenceTransaction: "TRF-20260827-042" }] as any);
    vi.spyOn(InventoryMovement, "findOne").mockResolvedValue(null);
    vi.spyOn(InventoryMovement, "create").mockResolvedValue({} as any);

    const result = await executeCancelTransfer({
      transferId: transferDoc._id.toString(),
      actionUsername: "admin",
      reason: "Customer cancelled",
    });

    expect(result.status).toBe("Cancelled");
    // Quantity restored: 5 + 2 = 7
    expect(sourceInvDoc.quantity).toBe(7);
    // TotalCostValue updated: 7 * 14000 = 98000
    expect(sourceInvDoc.totalCostValue).toBe(98000);
  });

  it("14. A -> B transfer locks source averageCost on dispatch and destination pool updates with correct moving average on receive", async () => {
    // Phase 1: Dispatch from Source (Warehouse has 10 pcs @ 14000)
    const transferDoc = new StockTransfer({
      _id: new Types.ObjectId(),
      transferNumber: "TRF-20261005-099",
      type: "Normal",
      sourceLocation: warehouseLocId,
      destinationLocation: branch1LocId,
      status: "Approved",
      items: [
        {
          product: nonSerialProdId,
          condition: "New",
          quantity: 2,
        },
      ],
      createdBy: "admin",
    });

    const sourceLocDoc = new Location({
      _id: warehouseLocId,
      name: "Warehouse",
      code: "WH-01",
      type: "Warehouse",
      active: true,
    });
    const destLocDoc = new Location({
      _id: branch1LocId,
      name: "G-14 Branch",
      code: "BR-G14",
      type: "Branch",
      active: true,
    });
    const carrierUserDoc = new User({
      _id: carrierUserId,
      name: "Adeel",
      username: "adeel",
      role: "Salesman",
      active: true,
    });

    const sourceInvDoc = new Inventory({
      product: nonSerialProdId,
      location: warehouseLocId,
      condition: "New",
      quantity: 10,
      averageCost: 14000,
      totalCostValue: 140000,
      status: "In Stock",
    });

    vi.spyOn(StockTransfer, "findById").mockReturnValue({
      populate: () => ({
        populate: () => Promise.resolve(transferDoc),
      }),
    } as any);

    vi.spyOn(User, "findById").mockResolvedValue(carrierUserDoc as any);
    vi.spyOn(Location, "findById").mockImplementation((id: any) => {
      if (id.toString() === warehouseLocId.toString()) return Promise.resolve(sourceLocDoc) as any;
      if (id.toString() === branch1LocId.toString()) return Promise.resolve(destLocDoc) as any;
      return Promise.resolve(null);
    });
    vi.spyOn(Product, "findById").mockResolvedValue({
      _id: nonSerialProdId,
      name: "PS5 FC 27",
      serialTracking: false,
      costPrice: 14000,
    } as any);

    vi.spyOn(Inventory, "findOne").mockResolvedValue(sourceInvDoc as any);
    vi.spyOn(sourceInvDoc, "save").mockResolvedValue(sourceInvDoc as any);
    vi.spyOn(transferDoc, "save").mockResolvedValue(transferDoc as any);
    vi.spyOn(InventoryMovement, "create").mockResolvedValue({} as any);

    // Execute Dispatch
    await executeDispatch({
      transferId: transferDoc._id.toString(),
      actionUsername: "admin",
      carrierUserId: carrierUserId.toString(),
    });

    // Verify Source Lock & Deduct:
    expect(sourceInvDoc.quantity).toBe(8);
    expect(sourceInvDoc.averageCost).toBe(14000);
    expect(sourceInvDoc.totalCostValue).toBe(112000); // 8 * 14000
    // Transfer item locked source unitCost:
    expect(transferDoc.items[0].unitCost).toBe(14000);
    expect(transferDoc.status).toBe("Dispatched");

    // Phase 2: Receive at Destination (Branch G-14) when G-14 has 0 initial stock
    let destinationInvDoc: any = null;
    vi.spyOn(Inventory, "findOne").mockImplementation(() => Promise.resolve(destinationInvDoc) as any);
    vi.spyOn(Inventory.prototype, "save").mockImplementation(function (this: any) {
      destinationInvDoc = this;
      return Promise.resolve(this);
    });

    await executeReceive({
      transferId: transferDoc._id.toString(),
      receivingUsername: "branch_user",
    });

    expect(destinationInvDoc).toBeDefined();
    expect(destinationInvDoc.quantity).toBe(2);
    expect(destinationInvDoc.averageCost).toBe(14000);
    expect(destinationInvDoc.totalCostValue).toBe(28000); // 2 * 14000

    // Phase 3: Second Transfer arrives at Destination (1 pc @ 17,000)
    const secondTransferDoc = new StockTransfer({
      _id: new Types.ObjectId(),
      transferNumber: "TRF-20261005-100",
      type: "Normal",
      sourceLocation: warehouseLocId,
      destinationLocation: branch1LocId,
      status: "Dispatched",
      items: [
        {
          product: nonSerialProdId,
          condition: "New",
          quantity: 1,
          unitCost: 17000,
        },
      ],
      createdBy: "admin",
    });

    vi.spyOn(StockTransfer, "findById").mockReturnValue({
      populate: () => ({
        populate: () => Promise.resolve(secondTransferDoc),
      }),
    } as any);
    vi.spyOn(secondTransferDoc, "save").mockResolvedValue(secondTransferDoc as any);

    await executeReceive({
      transferId: secondTransferDoc._id.toString(),
      receivingUsername: "branch_user",
    });

    // Verification of Weighted Average:
    // Existing: 2 pcs @ 14,000 = 28,000
    // Incoming: 1 pc @ 17,000 = 17,000
    // Total Value: 45,000 / 3 pcs = 15,000
    expect(destinationInvDoc.quantity).toBe(3);
    expect(destinationInvDoc.averageCost).toBe(15000);
    expect(destinationInvDoc.totalCostValue).toBe(45000);
  });

  it("15. Stale-avg: dest pool qty 0 avg 12k, receive 2@16k -> destination resets to 16,000 (never resurrects stale 12k)", async () => {
    const destLocDoc = { _id: branch1LocId, name: "Branch G-14" };

    const transferDoc = new StockTransfer({
      _id: new Types.ObjectId(),
      transferNumber: "TRF-20261005-STALE",
      status: "Dispatched",
      sourceLocation: warehouseLocId,
      destinationLocation: branch1LocId,
      items: [
        {
          product: nonSerialProdId,
          condition: "New",
          quantity: 2,
          unitCost: 16000,
        },
      ],
      createdBy: "admin",
    });
    vi.spyOn(transferDoc, "save").mockResolvedValue(transferDoc as any);

    // Existing pool has 0 quantity, but stale averageCost = 12000 from past stock
    const destInvDoc = new Inventory({
      product: nonSerialProdId,
      location: branch1LocId,
      condition: "New",
      quantity: 0,
      averageCost: 12000,
      totalCostValue: 0,
      status: "Out of Stock",
    });
    vi.spyOn(destInvDoc, "save").mockResolvedValue(destInvDoc as any);

    vi.spyOn(StockTransfer, "findById").mockReturnValue({
      populate: () => ({
        populate: () => Promise.resolve(transferDoc),
      }),
    } as any);

    vi.spyOn(Location, "findById").mockResolvedValue(destLocDoc as any);
    vi.spyOn(Product, "findById").mockResolvedValue({
      _id: nonSerialProdId,
      name: "FC 27",
      serialTracking: false,
    } as any);
    vi.spyOn(Inventory, "findOne").mockResolvedValue(destInvDoc as any);

    await executeReceive({
      transferId: transferDoc._id.toString(),
      receivingUsername: "branch_user",
    });

    // Destination MUST reset to incoming 16,000, NEVER blending or keeping stale 12,000!
    expect(destInvDoc.quantity).toBe(2);
    expect(destInvDoc.averageCost).toBe(16000);
    expect(destInvDoc.totalCostValue).toBe(32000);
    expect(destInvDoc.status).toBe("In Stock");
  });

  it("16. Dispatch zero cost -> block, multi-item transfer pre-validation prevents partial deduction of valid item", async () => {
    const item1ProdId = new Types.ObjectId();
    const item2ZeroCostProdId = new Types.ObjectId();

    const transferDoc = new StockTransfer({
      _id: new Types.ObjectId(),
      transferNumber: "TRF-20261005-ATOMIC",
      type: "Normal",
      sourceLocation: warehouseLocId,
      destinationLocation: branch1LocId,
      status: "Approved",
      items: [
        {
          product: item1ProdId,
          condition: "New",
          quantity: 2,
        },
        {
          product: item2ZeroCostProdId,
          condition: "New",
          quantity: 1,
        },
      ],
      createdBy: "admin",
    });

    const sourceLocDoc = new Location({ _id: warehouseLocId, name: "Warehouse", active: true });
    const destLocDoc = new Location({ _id: branch1LocId, name: "Branch G-14", active: true });
    const carrierUserDoc = new User({ _id: carrierUserId, name: "Adeel", active: true });

    // Item 1 has valid stock and cost (5 pcs @ 10,000)
    const inv1 = new Inventory({
      product: item1ProdId,
      location: warehouseLocId,
      condition: "New",
      quantity: 5,
      averageCost: 10000,
      totalCostValue: 50000,
      status: "In Stock",
    });

    // Item 2 has stock but ZERO cost (1 pc @ 0)
    const inv2 = new Inventory({
      product: item2ZeroCostProdId,
      location: warehouseLocId,
      condition: "New",
      quantity: 1,
      averageCost: 0,
      totalCostValue: 0,
      status: "In Stock",
    });

    const inv1SaveSpy = vi.spyOn(inv1, "save");
    const inv2SaveSpy = vi.spyOn(inv2, "save");

    vi.spyOn(StockTransfer, "findById").mockReturnValue({
      populate: () => ({
        populate: () => Promise.resolve(transferDoc),
      }),
    } as any);

    vi.spyOn(User, "findById").mockResolvedValue(carrierUserDoc as any);
    vi.spyOn(Location, "findById").mockImplementation((id: any) => {
      if (id.toString() === warehouseLocId.toString()) return Promise.resolve(sourceLocDoc) as any;
      if (id.toString() === branch1LocId.toString()) return Promise.resolve(destLocDoc) as any;
      return Promise.resolve(null);
    });

    vi.spyOn(Product, "findById").mockImplementation((id: any) => {
      if (id.toString() === item1ProdId.toString()) return Promise.resolve({ _id: item1ProdId, name: "Item 1 Valid", serialTracking: false }) as any;
      if (id.toString() === item2ZeroCostProdId.toString()) return Promise.resolve({ _id: item2ZeroCostProdId, name: "Item 2 Zero Cost", serialTracking: false }) as any;
      return Promise.resolve(null);
    });

    vi.spyOn(Inventory, "findOne").mockImplementation((query: any) => {
      if (query.product.toString() === item1ProdId.toString()) return Promise.resolve(inv1) as any;
      if (query.product.toString() === item2ZeroCostProdId.toString()) return Promise.resolve(inv2) as any;
      return Promise.resolve(null);
    });

    // Expect executeDispatch to fail because Item 2 has unitCost <= 0
    await expect(
      executeDispatch({
        transferId: transferDoc._id.toString(),
        actionUsername: "admin",
        carrierUserId: carrierUserId.toString(),
      })
    ).rejects.toThrow(/averageCost <= 1/);

    // CRITICAL ATOMICITY ASSERTION:
    // Item 1 was VALID, but because Item 2 failed pre-validation,
    // Item 1 must NEVER have been deducted! inv1.save() must NOT have been called!
    expect(inv1SaveSpy).not.toHaveBeenCalled();
    expect(inv2SaveSpy).not.toHaveBeenCalled();
    expect(inv1.quantity).toBe(5); // completely untouched!
    expect(inv1.totalCostValue).toBe(50000);
    expect(transferDoc.status).toBe("Approved"); // NOT changed to Dispatched
  });
});

