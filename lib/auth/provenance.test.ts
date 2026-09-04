import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { SerialNumber } from "../../models/SerialNumber";
import { PurchaseReceiving } from "../../models/PurchaseReceiving";
import { PurchaseInvoice } from "../../models/PurchaseInvoice";

describe("Supplier Provenance Tracking Schema Relations", () => {
  it("should allow linking SerialNumber to a purchase receiving transaction via transactionReference", () => {
    const mockReceivingNumber = "REC-2026-08-22";
    const serial = new SerialNumber({
      product: new mongoose.Types.ObjectId(),
      serialNumber: "SN-MOCK-123",
      status: "Available",
      location: "Warehouse",
      transactionReference: mockReceivingNumber,
    });
    
    const error = serial.validateSync();
    expect(error).toBeUndefined();
    expect(serial.transactionReference).toBe(mockReceivingNumber);
  });

  it("should validate that PurchaseReceiving links to PurchaseInvoice", () => {
    const invoiceId = new mongoose.Types.ObjectId();
    const receiving = new PurchaseReceiving({
      receivingNumber: "REC-001",
      purchaseInvoice: invoiceId,
      location: new mongoose.Types.ObjectId(),
      status: "Draft",
      createdBy: "admin",
      items: [
        {
          product: new mongoose.Types.ObjectId(),
          name: "PS5 Controller",
          sku: "PS5-CTRL-NEW",
          barcode: "BAR-101",
          condition: "New",
          quantityReceived: 5,
        }
      ]
    });

    const error = receiving.validateSync();
    expect(error).toBeUndefined();
    expect(receiving.purchaseInvoice.toString()).toBe(invoiceId.toString());
  });

  it("should validate that PurchaseInvoice links to a Supplier", () => {
    const supplierId = new mongoose.Types.ObjectId();
    const invoice = new PurchaseInvoice({
      invoiceNumber: "INV-1024",
      supplier: supplierId,
      invoiceDate: new Date(),
      status: "Draft",
      items: [
        {
          product: new mongoose.Types.ObjectId(),
          name: "PS5 Controller",
          sku: "PS5-CTRL-NEW",
          barcode: "BAR-101",
          condition: "New",
          quantity: 5,
          unitCost: 5000,
          amount: 25000,
        }
      ],
      subtotal: 25000,
      total: 25000,
      createdBy: "warehouse-manager",
    });

    const error = invoice.validateSync();
    expect(error).toBeUndefined();
    expect(invoice.supplier.toString()).toBe(supplierId.toString());
  });
});
