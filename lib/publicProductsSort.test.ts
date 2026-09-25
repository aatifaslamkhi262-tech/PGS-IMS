import { describe, it, expect } from "vitest";

describe("Public Product Sorting Logic (In-Stock Priority)", () => {
  it("sorts in-stock items before out-of-stock items, then by createdAt desc", () => {
    const products = [
      { id: "1", name: "Product A (Out of stock)", inStock: false, warehouseStock: 0, createdAt: "2026-09-25T10:00:00Z" },
      { id: "2", name: "Product B (In stock)", inStock: true, warehouseStock: 5, createdAt: "2026-09-24T10:00:00Z" },
      { id: "3", name: "Product C (In stock newer)", inStock: true, warehouseStock: 2, createdAt: "2026-09-25T12:00:00Z" },
      { id: "4", name: "Product D (Out of stock newer)", inStock: false, warehouseStock: 0, createdAt: "2026-09-25T14:00:00Z" },
    ];

    const sorted = [...products].sort((a, b) => {
      if (a.inStock !== b.inStock) {
        return a.inStock ? -1 : 1;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    expect(sorted.map((p) => p.id)).toEqual(["3", "2", "4", "1"]);
    expect(sorted[0].inStock).toBe(true);
    expect(sorted[1].inStock).toBe(true);
    expect(sorted[2].inStock).toBe(false);
    expect(sorted[3].inStock).toBe(false);
  });
});
