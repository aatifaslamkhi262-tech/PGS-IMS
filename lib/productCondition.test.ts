import { describe, it, expect } from "vitest";
import {
  normalizeProductCondition,
  validateProductCondition,
  suggestSkuConditionSuffix,
  buildSkuDraft,
  buildCounterpartProductName,
  PRODUCT_CONDITIONS,
} from "./productCondition";

describe("normalizeProductCondition", () => {
  it("accepts valid New/Used/Refurbished values case-insensitively", () => {
    expect(normalizeProductCondition("New")).toBe("New");
    expect(normalizeProductCondition("new")).toBe("New");
    expect(normalizeProductCondition("Used")).toBe("Used");
    expect(normalizeProductCondition(" used ")).toBe("Used");
    expect(normalizeProductCondition("Refurbished")).toBe("Refurbished");
    expect(normalizeProductCondition("refurbished")).toBe("Refurbished");
  });

  it("rejects invalid values", () => {
    expect(normalizeProductCondition("Broken")).toBeNull();
    expect(normalizeProductCondition("")).toBeNull();
    expect(normalizeProductCondition(null)).toBeNull();
  });
});

describe("validateProductCondition", () => {
  it("returns valid result for New, Used, and Refurbished", () => {
    expect(validateProductCondition("New")).toEqual({
      valid: true,
      condition: "New",
    });
    expect(validateProductCondition("used")).toEqual({
      valid: true,
      condition: "Used",
    });
    expect(validateProductCondition("refurbished")).toEqual({
      valid: true,
      condition: "Refurbished",
    });
  });

  it("returns error for missing or invalid condition", () => {
    expect(validateProductCondition(undefined).valid).toBe(false);
    expect(validateProductCondition("Broken").error).toContain("New");
  });
});

describe("suggestSkuConditionSuffix", () => {
  it("returns distinct suffixes per condition", () => {
    expect(suggestSkuConditionSuffix("New")).toBe("-NEW");
    expect(suggestSkuConditionSuffix("Used")).toBe("-USED");
    expect(suggestSkuConditionSuffix("Refurbished")).toBe("-REF");
  });
});

describe("buildSkuDraft", () => {
  it("includes condition suffix in generated SKU", () => {
    const sku = buildSkuDraft("PS5 Slim Disc Edition", "New");
    expect(sku).toMatch(/-NEW-\d{3}$/);
  });

  it("uses different suffix for Used and Refurbished products", () => {
    const usedSku = buildSkuDraft("PS5 Slim Disc Edition", "Used");
    expect(usedSku).toMatch(/-USED-\d{3}$/);
    const refSku = buildSkuDraft("PS5 Slim Disc Edition", "Refurbished");
    expect(refSku).toMatch(/-REF-\d{3}$/);
  });
});

describe("buildCounterpartProductName", () => {
  it("builds Used counterpart name from New product", () => {
    expect(
      buildCounterpartProductName("PS5 Slim Disc Edition - New", "Used")
    ).toBe("PS5 Slim Disc Edition - Used");
  });

  it("avoids duplicating condition suffix", () => {
    expect(buildCounterpartProductName("DualSense White (New)", "Used")).toBe(
      "DualSense White - Used"
    );
  });
});

describe("PRODUCT_CONDITIONS", () => {
  it("defines New, Used, and Refurbished", () => {
    expect(PRODUCT_CONDITIONS).toEqual(["New", "Used", "Refurbished"]);
  });
});
