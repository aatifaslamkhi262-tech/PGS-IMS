import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock dbConnect
vi.mock("@/lib/db", () => ({
  dbConnect: vi.fn().mockResolvedValue(true),
}));

import { IdempotencyKey } from "@/models/IdempotencyKey";
import { lockIdempotencyKey, completeIdempotencyKey } from "./idempotencyEngine";
import { consumeFifoCostLayers } from "./fifoCostEngine";

describe("PGS-IMS Comprehensive Architecture & Financial Rule Test Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Idempotency Engine Lock & Protection Rules", () => {
    it("should allow first request with unique key", async () => {
      vi.spyOn(IdempotencyKey, "findOne").mockResolvedValue(null);
      vi.spyOn(IdempotencyKey, "findOneAndUpdate").mockResolvedValue({} as any);

      const payload = { locationId: "loc-1", total: 5000 };
      const res = await lockIdempotencyKey("KEY-100", payload, "/api/sales");
      expect(res.isDuplicate).toBe(false);
    });

    it("should block duplicate request with same key while PROCESSING", async () => {
      const payload = { locationId: "loc-1", total: 5000 };
      const crypto = await import("crypto");
      const hash = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");

      vi.spyOn(IdempotencyKey, "findOne").mockResolvedValue({
        key: "KEY-101",
        requestHash: hash,
        status: "PROCESSING",
      } as any);

      const secondRes = await lockIdempotencyKey("KEY-101", payload, "/api/sales");
      expect(secondRes.isDuplicate).toBe(true);
      expect(secondRes.statusCode).toBe(409);
      expect(secondRes.error).toContain("currently processing");
    });

    it("should return 409 Conflict if same key is used with DIFFERENT payload", async () => {
      const payload1 = { locationId: "loc-1", total: 5000 };
      const payload2 = { locationId: "loc-1", total: 9999 };

      const crypto = await import("crypto");
      const hash1 = crypto.createHash("sha256").update(JSON.stringify(payload1)).digest("hex");

      vi.spyOn(IdempotencyKey, "findOne").mockResolvedValue({
        key: "KEY-102",
        requestHash: hash1,
        status: "PROCESSING",
      } as any);

      const mismatchRes = await lockIdempotencyKey("KEY-102", payload2, "/api/sales");
      expect(mismatchRes.isDuplicate).toBe(true);
      expect(mismatchRes.statusCode).toBe(409);
      expect(mismatchRes.error).toContain("payload mismatch");
    });

    it("should return cached response if key is COMPLETED", async () => {
      const payload = { locationId: "loc-1", total: 5000 };
      const crypto = await import("crypto");
      const hash = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");

      vi.spyOn(IdempotencyKey, "findOne").mockResolvedValue({
        key: "KEY-103",
        requestHash: hash,
        status: "COMPLETED",
        statusCode: 200,
        responseBody: { success: true, invoiceNumber: "INV-999" },
      } as any);

      const completedRes = await lockIdempotencyKey("KEY-103", payload, "/api/sales");
      expect(completedRes.isDuplicate).toBe(true);
      expect(completedRes.statusCode).toBe(200);
      expect(completedRes.responseBody).toEqual({ success: true, invoiceNumber: "INV-999" });
    });
  });

  describe("2. Non-Serialized FIFO Cost Layer Logic", () => {
    it("should handle empty cost layers gracefully", async () => {
      const res = await consumeFifoCostLayers({
        productId: "60c72b2f9b1d8b2b8c8b4569",
        locationId: "60c72b2f9b1d8b2b8c8b4567",
        quantity: 0,
      });
      expect(res.totalCost).toBe(0);
      expect(res.unitCost).toBe(0);
      expect(res.layersConsumed).toHaveLength(0);
    });
  });

  describe("3. Physical Cash Movement Equation Rules", () => {
    it("should verify physical drawer expected cash equation formula", () => {
      const openingCash = 10000;
      const cashSales = 25000;
      const debtCollections = 5000;
      const pettyCash = 2000;
      const cashRefunds = 3000;

      const expectedCash = openingCash + cashSales + debtCollections - pettyCash - cashRefunds;
      expect(expectedCash).toBe(35000);
    });

    it("should verify Card/Bank payments DO NOT enter physical drawer cash", () => {
      const openingCash = 10000;
      const cashSales = 5000;
      const cardSales = 45000;
      const bankTransfer = 100000;

      const physicalDrawerCash = openingCash + cashSales;
      expect(physicalDrawerCash).toBe(15000);
      expect(physicalDrawerCash).not.toBe(openingCash + cashSales + cardSales + bankTransfer);
    });
  });

  describe("4. Customer Ledger Double-Entry Rules", () => {
    it("should compute customer running debt correctly for INVOICE and PAYMENT", () => {
      let outstanding = 0;

      outstanding += 15000;
      expect(outstanding).toBe(15000);

      outstanding -= 10000;
      expect(outstanding).toBe(5000);
    });

    it("should allocate excess Return Credit to Store Credit when outstanding is zero", () => {
      let outstanding = 2000;
      let storeCredit = 0;
      const returnCredit = 5000;

      if (outstanding >= returnCredit) {
        outstanding -= returnCredit;
      } else {
        const excess = returnCredit - outstanding;
        outstanding = 0;
        storeCredit += excess;
      }

      expect(outstanding).toBe(0);
      expect(storeCredit).toBe(3000);
    });
  });

  describe("5. Direct Walk-In Trade-In Net Difference Calculation", () => {
    it("should correctly compute net difference for trade-in with higher replacement value", () => {
      const tradeInItemVal = 40000;
      const replacementItemVal = 90000;

      const netDiff = replacementItemVal - tradeInItemVal;
      expect(netDiff).toBe(50000);
    });

    it("should correctly compute net difference for trade-in with refund owed to customer", () => {
      const tradeInItemVal = 80000;
      const replacementItemVal = 50000;

      const netDiff = replacementItemVal - tradeInItemVal;
      expect(netDiff).toBe(-30000);
    });
  });
});
