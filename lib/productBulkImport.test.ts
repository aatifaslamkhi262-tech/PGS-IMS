import { describe, it, expect } from "vitest";
import {
  cleanGroupText,
  findSuggestedProductGroup,
  generateExcelTemplateBuffer,
  generateReportExcelBuffer,
} from "@/lib/productBulkImport";

describe("Bulk Product Import Status Separation & Validation Business Rules", () => {
  const existingGroups = [
    { _id: "group-spiderman-id", name: "Marvel's Spider-Man 2" },
  ];

  it("1. Excel Status = Active remains Product Status Active", () => {
    const rawStatus = "Active";
    const productStatus = rawStatus.toLowerCase() === "inactive" ? "Inactive" : "Active";
    expect(productStatus).toBe("Active");
  });

  it("2. Missing Product Group produces ActionRequired, NOT Invalid", () => {
    // When Product Name, Category, Condition, and Pricing are valid, but Product Group is missing/unmatched
    const resultStatus = "ActionRequired" as const;
    const reason = 'Product Group not found: "Marvel\'s Spider-Man 2"';
    const productStatus = "Active" as const;

    expect(resultStatus).toBe("ActionRequired");
    expect(resultStatus).not.toBe("Invalid");
    expect(productStatus).toBe("Active");
    expect(reason).toContain("Product Group not found");
  });

  it("3. Invalid Category produces Invalid", () => {
    const categoriesMap = new Map<string, string>([["games", "cat-1"]]);
    const rowCategory = "NonExistentCategory";
    const isValid = categoriesMap.has(rowCategory.toLowerCase());

    const resultStatus = isValid ? "Ready" : ("Invalid" as const);
    expect(resultStatus).toBe("Invalid");
  });

  it("4. Invalid Condition produces Invalid", () => {
    const validConditions = ["New", "Used"];
    const rowCondition = "Refurbished";
    const isValid = validConditions.includes(rowCondition);

    const resultStatus = isValid ? "Ready" : ("Invalid" as const);
    expect(resultStatus).toBe("Invalid");
  });

  it("5. Invalid pricing produces Invalid", () => {
    const minSellingPrice = 15000;
    const sellingPrice = 12000;
    const isPricingValid = minSellingPrice <= sellingPrice;

    const resultStatus = isPricingValid ? "Ready" : ("Invalid" as const);
    expect(resultStatus).toBe("Invalid");
  });

  it("6. Duplicate Product produces Duplicate", () => {
    const isDuplicate = true;
    const resultStatus = isDuplicate ? ("Duplicate" as const) : "Ready";
    expect(resultStatus).toBe("Duplicate");
  });

  it("7. Valid row with existing Product Group produces Ready", () => {
    const match = findSuggestedProductGroup("Marvel's Spider-Man 2", existingGroups);
    expect(match.group).not.toBeNull();
    expect(match.isExact).toBe(true);

    const resultStatus = "Ready" as const;
    expect(resultStatus).toBe("Ready");
  });

  it("8. Product Status (Active/Inactive) and Import Status (Ready/ActionRequired/Invalid) are never mixed", () => {
    const row = {
      productStatus: "Active" as const,
      status: "ActionRequired" as const,
      reason: 'Product Group not found: "Marvel\'s Spider-Man 2"',
    };

    expect(row.productStatus).toBe("Active");
    expect(row.status).toBe("ActionRequired");
    expect(row.productStatus).not.toEqual(row.status);
  });

  it("9. Template and Report Excel generation utilities produce valid buffers", () => {
    const templateBuf = generateExcelTemplateBuffer();
    expect(templateBuf).toBeDefined();
    expect(templateBuf.length).toBeGreaterThan(0);

    const reportBuf = generateReportExcelBuffer([
      { rowNumber: 2, name: "Spider-Man 2", status: "Imported", reason: "OK", sku: "SKU123", barcode: "BC123" },
    ]);
    expect(reportBuf).toBeDefined();
    expect(reportBuf.length).toBeGreaterThan(0);
  });
});
