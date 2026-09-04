import { describe, it, expect } from "vitest";
import { Supplier } from "../../models/Supplier";

describe("Supplier Model Schema Validation", () => {
  it("should fail validation if name is missing", () => {
    const supplier = new Supplier({
      code: "SONY-DIST",
      contactPerson: "Alice",
    });

    const error = supplier.validateSync();
    expect(error?.errors.name).toBeDefined();
    expect(error?.errors.name.message).toContain("Supplier Name is required");
  });

  it("should fail validation if code is missing", () => {
    const supplier = new Supplier({
      name: "Sony Distribution",
      contactPerson: "Alice",
    });

    const error = supplier.validateSync();
    expect(error?.errors.code).toBeDefined();
    expect(error?.errors.code.message).toContain("Supplier Code is required");
  });

  it("should default active status to true if not specified", () => {
    const supplier = new Supplier({
      name: "Sony Distribution",
      code: "SONY-DIST",
    });

    expect(supplier.active).toBe(true);
  });

  it("should accept active status as false explicitly", () => {
    const supplier = new Supplier({
      name: "Inactive Supplier Ltd",
      code: "INACTIVE-SUP",
      active: false,
    });

    expect(supplier.active).toBe(false);
  });
});
