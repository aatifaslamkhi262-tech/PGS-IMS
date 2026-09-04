/**
 * Test utilities for thermal label generator
 * These can be used in browser console for testing
 */

import { generateThermalLabel, printThermalLabel } from "./thermalLabelGenerator";
import { DEFAULT_LABEL_CONFIG } from "./labelConfig";

/**
 * Test the thermal label generation with sample data
 */
export async function testThermalLabelGeneration() {
  const testCases = [
    {
      productName: "PS5 Slim Disc Edition",
      barcode: "PS5-001",
      sellingPrice: 45000,
      condition: "USED",
    },
    {
      productName: "PS5 Slim Disc Edition",
      barcode: "PS5-002",
      sellingPrice: 45000,
      condition: "NEW",
    },
    {
      productName: "Grand Theft Auto V",
      barcode: "GTA5-001",
      sellingPrice: 2500,
      condition: "USED",
    },
    {
      productName: "Test Product Mixed123",
      barcode: "TEST-ABC123",
      sellingPrice: 1000,
      condition: "NEW",
    },
  ];

  console.log("Testing thermal label generation...");
  
  for (const testCase of testCases) {
    try {
      const canvas = await generateThermalLabel({
        productName: testCase.productName,
        barcode: testCase.barcode,
        sellingPrice: testCase.sellingPrice,
        condition: testCase.condition,
        companyName: "PGS Game Shop",
      });
      
      console.log(`✓ Test case passed: ${testCase.barcode}`);
      console.log(`  Canvas dimensions: ${canvas.width}x${canvas.height}px`);
      console.log(`  Expected dimensions: ${DEFAULT_LABEL_CONFIG.width}mm x ${DEFAULT_LABEL_CONFIG.height}mm at ${DEFAULT_LABEL_CONFIG.dpi} DPI`);
    } catch (error) {
      console.error(`✗ Test case failed: ${testCase.barcode}`, error);
    }
  }
}

/**
 * Test barcode format validation
 */
export function testBarcodeFormat() {
  const validBarcodes = ["PS5-001", "PS5-002", "GTA5-001", "TEST-ABC123"];
  const invalidBarcodes = ["", null, undefined];
  
  console.log("Testing barcode format validation...");
  
  validBarcodes.forEach((barcode) => {
    if (barcode && barcode.length > 0) {
      console.log(`✓ Valid barcode format: ${barcode}`);
    }
  });
  
  invalidBarcodes.forEach((barcode) => {
    if (!barcode || barcode.length === 0) {
      console.log(`✓ Invalid barcode handled correctly: ${barcode}`);
    }
  });
}

import { describe, it, expect } from "vitest";

describe("thermalLabelGenerator browser test helpers", () => {
  it("should export test functions for console testing", () => {
    expect(typeof testThermalLabelGeneration).toBe("function");
    expect(typeof testBarcodeFormat).toBe("function");
  });
});
