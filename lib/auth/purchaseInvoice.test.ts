import { describe, it, expect } from "vitest";
import { PurchaseInvoice } from "../../models/PurchaseInvoice";
import mongoose from "mongoose";

describe("Purchase Invoice Schema Validation", () => {
  it("should fail validation if invoice number or supplier is missing", () => {
    const invoice = new PurchaseInvoice({
      invoiceDate: new Date(),
      createdBy: "warehouse-staff",
      subtotal: 100,
      total: 100,
      items: [
        {
          product: new mongoose.Types.ObjectId(),
          name: "GTA V",
          sku: "GTA5",
          barcode: "1234",
          condition: "New",
          quantity: 1,
          unitCost: 100,
          amount: 100,
        },
      ],
    });

    const error = invoice.validateSync();
    expect(error?.errors.invoiceNumber).toBeDefined();
    expect(error?.errors.invoiceNumber.message).toContain("Invoice Number is required");
    expect(error?.errors.supplier).toBeDefined();
    expect(error?.errors.supplier.message).toContain("Supplier reference is required");
  });

  it("should fail validation if items list is empty", () => {
    const invoice = new PurchaseInvoice({
      invoiceNumber: "INV-001",
      supplier: new mongoose.Types.ObjectId(),
      invoiceDate: new Date(),
      createdBy: "warehouse-staff",
      subtotal: 0,
      total: 0,
      items: [],
    });

    const error = invoice.validateSync();
    expect(error?.errors.items).toBeDefined();
    expect(error?.errors.items.message).toContain("Invoice must have at least one product line item");
  });

  it("should fail validation if line item quantity is less than 1", () => {
    const invoice = new PurchaseInvoice({
      invoiceNumber: "INV-002",
      supplier: new mongoose.Types.ObjectId(),
      invoiceDate: new Date(),
      createdBy: "warehouse-staff",
      subtotal: 0,
      total: 0,
      items: [
        {
          product: new mongoose.Types.ObjectId(),
          name: "GTA V",
          sku: "GTA5",
          barcode: "1234",
          condition: "New",
          quantity: 0, // Invalid! Qty must be >= 1
          unitCost: 50,
          amount: 0,
        },
      ],
    });

    const error = invoice.validateSync();
    expect(error?.errors["items.0.quantity"]).toBeDefined();
    expect(error?.errors["items.0.quantity"].message).toContain("Quantity must be greater than 0");
  });

  it("should default status to Draft", () => {
    const invoice = new PurchaseInvoice({
      invoiceNumber: "INV-003",
      supplier: new mongoose.Types.ObjectId(),
      invoiceDate: new Date(),
      createdBy: "warehouse-staff",
      subtotal: 100,
      total: 100,
      items: [
        {
          product: new mongoose.Types.ObjectId(),
          name: "GTA V",
          sku: "GTA5",
          barcode: "1234",
          condition: "New",
          quantity: 1,
          unitCost: 100,
          amount: 100,
        },
      ],
    });

    expect(invoice.status).toBe("Draft");
  });
});
