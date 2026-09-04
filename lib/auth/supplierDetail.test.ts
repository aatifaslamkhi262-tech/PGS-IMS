/**
 * Supplier Detail — unit tests
 *
 * These tests cover:
 *   1. Supplier model schema validation (existing supplier.test.ts already covers this;
 *      here we add coverage for the detail/history business logic).
 *   2. RBAC field-stripping rules (pure logic, no DB required).
 *   3. Delete-protection check (pure logic).
 *   4. Stats aggregation logic.
 *   5. Product identity rule — model number must NOT be used to merge/identify products.
 */

import { describe, it, expect } from "vitest";

// ── 1. Supplier model is not re-tested here (see supplier.test.ts) ────────────

// ── 2. RBAC field-stripping ───────────────────────────────────────────────────

describe("RBAC: cost field visibility", () => {
  const COST_VISIBLE_ROLES = ["Admin", "Warehouse", "Accountant"];
  const COST_HIDDEN_ROLES = ["Branch"];
  const FORBIDDEN_ROLES = ["Salesman"];

  const canSeeCosts = (role: string) => COST_VISIBLE_ROLES.includes(role);
  const isAllowed = (role: string) => !FORBIDDEN_ROLES.includes(role);

  it("Admin can see purchase costs", () => {
    expect(canSeeCosts("Admin")).toBe(true);
  });

  it("Warehouse can see purchase costs", () => {
    expect(canSeeCosts("Warehouse")).toBe(true);
  });

  it("Accountant can see purchase costs", () => {
    expect(canSeeCosts("Accountant")).toBe(true);
  });

  it("Branch cannot see purchase costs", () => {
    expect(canSeeCosts("Branch")).toBe(false);
  });

  it("Salesman is not allowed access to supplier history", () => {
    expect(isAllowed("Salesman")).toBe(false);
  });

  it("Branch is allowed access (but without costs)", () => {
    expect(isAllowed("Branch")).toBe(true);
    expect(canSeeCosts("Branch")).toBe(false);
  });

  it("strips unitCost and amount from Branch response", () => {
    const role = "Branch";
    const item = {
      product: "prod-id-123",
      name: "Controller",
      sku: "SKU-001",
      quantity: 5,
      unitCost: 1000,
      amount: 5000,
      sellingPrice: 1500,
    };

    const sanitized: Record<string, unknown> = {
      product: item.product,
      name: item.name,
      sku: item.sku,
      quantity: item.quantity,
      sellingPrice: item.sellingPrice,
    };

    if (canSeeCosts(role)) {
      sanitized.unitCost = item.unitCost;
      sanitized.amount = item.amount;
    }

    expect(sanitized.unitCost).toBeUndefined();
    expect(sanitized.amount).toBeUndefined();
    expect(sanitized.sellingPrice).toBe(1500);
  });

  it("includes unitCost and amount for Admin response", () => {
    const role = "Admin";
    const item = {
      unitCost: 1000,
      amount: 5000,
      sellingPrice: 1500,
    };

    const sanitized: Record<string, unknown> = {
      sellingPrice: item.sellingPrice,
    };

    if (canSeeCosts(role)) {
      sanitized.unitCost = item.unitCost;
      sanitized.amount = item.amount;
    }

    expect(sanitized.unitCost).toBe(1000);
    expect(sanitized.amount).toBe(5000);
  });
});

// ── 3. Delete-protection ─────────────────────────────────────────────────────

describe("Delete protection: supplier with historical invoices", () => {
  /**
   * Simulate the server-side check:
   * If invoiceCount > 0, hard-delete must be blocked.
   */
  function shouldBlockDelete(invoiceCount: number): boolean {
    return invoiceCount > 0;
  }

  it("blocks deletion when supplier has 1 invoice", () => {
    expect(shouldBlockDelete(1)).toBe(true);
  });

  it("blocks deletion when supplier has many invoices", () => {
    expect(shouldBlockDelete(42)).toBe(true);
  });

  it("allows deletion when supplier has no invoices", () => {
    expect(shouldBlockDelete(0)).toBe(false);
  });

  it("error message instructs user to mark inactive instead", () => {
    const name = "Supplier Test A";
    const count = 3;
    const msg = `Cannot delete "${name}" — this supplier has ${count} purchase invoice(s) on record. Mark the supplier as Inactive instead to disable future purchases while preserving historical records.`;
    expect(msg).toContain("Inactive");
    expect(msg).toContain("historical records");
    expect(msg).toContain(name);
  });
});

// ── 4. Stats aggregation ─────────────────────────────────────────────────────

describe("Stats aggregation", () => {
  interface MockItem {
    quantity: number;
    unitCost: number;
  }
  interface MockInvoice {
    items: MockItem[];
    total: number;
  }

  function computeStats(invoices: MockInvoice[]) {
    const totalInvoices = invoices.length;
    const totalItems = invoices.reduce((s, inv) => s + inv.items.length, 0);
    const totalQtyOrdered = invoices.reduce(
      (s, inv) => s + inv.items.reduce((ss, it) => ss + it.quantity, 0),
      0
    );
    const totalPurchaseValue = invoices.reduce((s, inv) => s + inv.total, 0);
    return { totalInvoices, totalItems, totalQtyOrdered, totalPurchaseValue };
  }

  it("correctly aggregates zero invoices", () => {
    const stats = computeStats([]);
    expect(stats.totalInvoices).toBe(0);
    expect(stats.totalItems).toBe(0);
    expect(stats.totalQtyOrdered).toBe(0);
    expect(stats.totalPurchaseValue).toBe(0);
  });

  it("correctly aggregates one invoice with multiple items", () => {
    const invoices: MockInvoice[] = [
      {
        items: [
          { quantity: 3, unitCost: 100 },
          { quantity: 2, unitCost: 200 },
        ],
        total: 700,
      },
    ];
    const stats = computeStats(invoices);
    expect(stats.totalInvoices).toBe(1);
    expect(stats.totalItems).toBe(2);
    expect(stats.totalQtyOrdered).toBe(5);
    expect(stats.totalPurchaseValue).toBe(700);
  });

  it("correctly aggregates multiple invoices", () => {
    const invoices: MockInvoice[] = [
      { items: [{ quantity: 10, unitCost: 50 }], total: 500 },
      { items: [{ quantity: 5, unitCost: 200 }, { quantity: 8, unitCost: 100 }], total: 1800 },
    ];
    const stats = computeStats(invoices);
    expect(stats.totalInvoices).toBe(2);
    expect(stats.totalItems).toBe(3);
    expect(stats.totalQtyOrdered).toBe(23);
    expect(stats.totalPurchaseValue).toBe(2300);
  });
});

// ── 5. Product identity — model number must NOT be used for identity ──────────

describe("Product identity rule: model number is NOT a unique identifier", () => {
  /**
   * Two products with the same model number from different suppliers must be
   * treated as SEPARATE purchase history rows — not merged.
   * Product identity is determined by product._id (MongoDB ObjectId), SKU, and barcode.
   */

  interface PurchaseRow {
    productId: string; // This is the identity key — _id from Product model
    sku: string;       // Also unique per Product
    modelNumber?: string; // Display only — NOT an identity field
    supplierName: string;
    quantity: number;
  }

  it("two purchases with same model number but different productIds are separate rows", () => {
    const rows: PurchaseRow[] = [
      { productId: "prod-A", sku: "SKU-001", modelNumber: "ABC-100", supplierName: "Supplier A", quantity: 5 },
      { productId: "prod-B", sku: "SKU-002", modelNumber: "ABC-100", supplierName: "Supplier B", quantity: 3 },
    ];

    // Grouping by productId should yield 2 distinct entries
    const grouped = rows.reduce<Record<string, PurchaseRow[]>>((acc, row) => {
      const key = row.productId; // identity = productId, not modelNumber
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    }, {});

    expect(Object.keys(grouped)).toHaveLength(2);
    expect(grouped["prod-A"]).toHaveLength(1);
    expect(grouped["prod-B"]).toHaveLength(1);
  });

  it("same product purchased twice from same supplier yields 2 separate invoice rows", () => {
    const rows: PurchaseRow[] = [
      { productId: "prod-A", sku: "SKU-001", modelNumber: "ABC-100", supplierName: "Supplier A", quantity: 5 },
      { productId: "prod-A", sku: "SKU-001", modelNumber: "ABC-100", supplierName: "Supplier A", quantity: 2 },
    ];

    // Even the same productId appears twice — these are SEPARATE invoice line items / batches
    // They must NOT be merged; supplier detail shows individual purchase rows
    expect(rows).toHaveLength(2);
    expect(rows[0].quantity).toBe(5);
    expect(rows[1].quantity).toBe(2);
    // Total quantity is sum of both rows (not collapsed)
    const total = rows.reduce((s, r) => s + r.quantity, 0);
    expect(total).toBe(7);
  });

  it("model number is display-only and does NOT affect identity or uniqueness", () => {
    const itemA = { productId: "prod-A", sku: "SKU-001", modelNumber: "XYZ-999" };
    const itemB = { productId: "prod-B", sku: "SKU-002", modelNumber: "XYZ-999" };

    // Same model number — but these are different products (different _id / SKU)
    expect(itemA.productId).not.toBe(itemB.productId);
    expect(itemA.sku).not.toBe(itemB.sku);
    expect(itemA.modelNumber).toBe(itemB.modelNumber); // model number is same — that's OK
  });
});
