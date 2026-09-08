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
      status: "In Stock",
    });
    vi.spyOn(invDoc, "save").mockResolvedValue(invDoc as any);

    vi.spyOn(StockTransfer, "findById").mockReturnValue({
      populate: () => ({
        populate: () => Promise.resolve(transferDoc),
      }),
    } as any);

    vi.spyOn(User, "findById").mockResolvedValue(carrierUserDoc as any);
    vi.spyOn(Location, "findById")
      .mockResolvedValueOnce(sourceLocDoc as any)
      .mockResolvedValueOnce(destLocDoc as any);

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

    vi.spyOn(Location, "findById")
      .mockResolvedValueOnce(sourceLocDoc as any)
      .mockResolvedValueOnce(destLocDoc as any);

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

    vi.spyOn(Location, "findById")
      .mockResolvedValueOnce(sourceLocDoc as any)
      .mockResolvedValueOnce(destLocDoc as any);

    vi.spyOn(Product, "findById").mockResolvedValue({
      _id: serialProdId,
      name: "PS5 Console",
      serialTracking: true,
    } as any);

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
});
