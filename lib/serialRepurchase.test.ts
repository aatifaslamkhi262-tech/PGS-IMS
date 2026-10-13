import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { SerialNumber } from "../models/SerialNumber";

describe("Serial Repurchase & Conversion Lifecycle", () => {
  it("should create a valid serial number document with Available status", () => {
    const prodA = new mongoose.Types.ObjectId();
    const sn = new SerialNumber({
      product: prodA,
      serialNumber: "SN-PS5-DIGITAL-001",
      status: "Available",
      location: "Warehouse",
      transactionReference: "REC-2024-001",
    });

    const err = sn.validateSync();
    expect(err).toBeUndefined();
    expect(sn.status).toBe("Available");
    expect(sn.product.toString()).toBe(prodA.toString());
  });

  it("should support transition to Sold on customer invoice", () => {
    const prodA = new mongoose.Types.ObjectId();
    const sn = new SerialNumber({
      product: prodA,
      serialNumber: "SN-PS5-DIGITAL-001",
      status: "Sold",
      location: "Warehouse",
      saleDate: new Date("2024-01-15"),
      notes: "Sold on INV-001",
    });

    const err = sn.validateSync();
    expect(err).toBeUndefined();
    expect(sn.status).toBe("Sold");
  });

  it("should allow re-linking sold serial to a new product (e.g. Digital converted to Disc Used)", () => {
    const prodDigital = new mongoose.Types.ObjectId();
    const prodDiscUsed = new mongoose.Types.ObjectId();

    // 1. Initial State: Sold
    const sn = new SerialNumber({
      product: prodDigital,
      serialNumber: "SN-PS5-DIGITAL-001",
      status: "Sold",
      saleDate: new Date("2024-01-15"),
    });

    expect(sn.status).toBe("Sold");
    expect(sn.product.toString()).toBe(prodDigital.toString());

    // 2. Re-acquisition via Purchase Invoice: Convert product and reactivate
    sn.product = prodDiscUsed;
    sn.status = "Available";
    sn.location = "Warehouse";
    sn.transactionReference = "REC-2026-099";
    sn.saleDate = undefined;
    sn.notes = "Re-acquired as PS5 Disc Edition Used";

    const err = sn.validateSync();
    expect(err).toBeUndefined();
    expect(sn.status).toBe("Available");
    expect(sn.product.toString()).toBe(prodDiscUsed.toString());
    expect(sn.transactionReference).toBe("REC-2026-099");
  });
});
