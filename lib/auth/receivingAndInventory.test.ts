import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { Location } from "../../models/Location";
import { Inventory } from "../../models/Inventory";
import { PurchaseReceiving } from "../../models/PurchaseReceiving";
import { InventoryMovement } from "../../models/InventoryMovement";

describe("Location Schema Validation", () => {
  it("should fail validation if name, code or type is missing", () => {
    const loc = new Location({});
    const error = loc.validateSync();
    expect(error?.errors.name).toBeDefined();
    expect(error?.errors.code).toBeDefined();
    expect(error?.errors.type).toBeDefined();
  });

  it("should validate successfully with correct values", () => {
    const loc = new Location({
      name: "Warehouse A",
      code: "WHA",
      type: "Warehouse",
    });
    const error = loc.validateSync();
    expect(error).toBeUndefined();
    expect(loc.active).toBe(true); // check default value
  });
});

describe("Inventory Schema Validation", () => {
  it("should fail validation if fields are missing", () => {
    const inv = new Inventory({});
    const error = inv.validateSync();
    expect(error?.errors.product).toBeDefined();
    expect(error?.errors.location).toBeDefined();
    expect(error?.errors.condition).toBeDefined();
  });

  it("should enforce non-negative quantity", () => {
    const inv = new Inventory({
      product: new mongoose.Types.ObjectId(),
      location: new mongoose.Types.ObjectId(),
      condition: "New",
      quantity: -5,
    });
    const error = inv.validateSync();
    expect(error?.errors.quantity).toBeDefined();
    expect(error?.errors.quantity.message).toContain("cannot be negative");
  });
});

describe("PurchaseReceiving Schema Validation", () => {
  it("should fail validation if fields are missing", () => {
    const rec = new PurchaseReceiving({});
    const error = rec.validateSync();
    expect(error?.errors.receivingNumber).toBeDefined();
    expect(error?.errors.purchaseInvoice).toBeDefined();
    expect(error?.errors.location).toBeDefined();
    expect(error?.errors.items).toBeDefined();
  });

  it("should default status to Draft", () => {
    const rec = new PurchaseReceiving({
      receivingNumber: "REC-01",
      purchaseInvoice: new mongoose.Types.ObjectId(),
      location: new mongoose.Types.ObjectId(),
      createdBy: "warehouse-staff",
      items: [
        {
          product: new mongoose.Types.ObjectId(),
          name: "PS5",
          sku: "PS5-SLIM",
          barcode: "9999",
          condition: "New",
          quantityReceived: 2,
        },
      ],
    });
    expect(rec.status).toBe("Draft");
    const error = rec.validateSync();
    expect(error).toBeUndefined();
  });
});

describe("InventoryMovement Schema Validation", () => {
  it("should fail validation if fields are missing", () => {
    const move = new InventoryMovement({});
    const error = move.validateSync();
    expect(error?.errors.product).toBeDefined();
    expect(error?.errors.quantity).toBeDefined();
    expect(error?.errors.sourceName).toBeDefined();
    expect(error?.errors.destinationName).toBeDefined();
    expect(error?.errors.type).toBeDefined();
    expect(error?.errors.beforeQuantity).toBeDefined();
    expect(error?.errors.afterQuantity).toBeDefined();
    expect(error?.errors.performedBy).toBeDefined();
  });
});
