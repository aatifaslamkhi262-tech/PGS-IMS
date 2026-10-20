import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Multi-CD Rental Return & Settlement Calculations", () => {
  interface ReturnEntry {
    productId: string;
    productName: string;
    securityDeposit: number;
    feeDeducted: number;
    netCredit: number;
  }

  interface ReplacementEntry {
    productId: string;
    productName: string;
    unitPrice: number;
    quantity: number;
  }

  function calculateRentalSettlement(
    returnedItems: ReturnEntry[],
    replacementItems: ReplacementEntry[],
    additionalTopUpCash: number = 0
  ) {
    const totalSecDeposit = returnedItems.reduce((acc, it) => acc + (it.securityDeposit || 0), 0);
    const totalFeeCut = returnedItems.reduce((acc, it) => acc + (it.feeDeducted || 0), 0);
    const netDepositCredit = Math.max(0, totalSecDeposit - totalFeeCut) + Number(additionalTopUpCash || 0);

    const replacementTotal = replacementItems.reduce((acc, it) => acc + (it.unitPrice || 0) * (it.quantity || 1), 0);
    const netDifference = replacementTotal - netDepositCredit;

    let settlementStatus = "EVEN_EXCHANGE";
    if (netDifference > 0) {
      settlementStatus = "CUSTOMER_PAYS";
    } else if (netDifference < 0) {
      settlementStatus = "SHOP_PAYS";
    }

    const netCashPayable = netDifference > 0 ? netDifference : 0;
    const netCashRefund = netDifference < 0 ? Math.abs(netDifference) : 0;

    return {
      totalSecDeposit,
      totalFeeCut,
      netDepositCredit,
      replacementTotal,
      netDifference,
      settlementStatus,
      netCashPayable,
      netCashRefund,
    };
  }

  it("Case 1: Customer returns 2 CDs and wants Cash Refund (0 replacements)", () => {
    // CD 1: Tekken 8 (Deposit Rs. 8,000, Usage Fee Rs. 1,000 -> Net Rs. 7,000)
    // CD 2: FC 26 (Deposit Rs. 10,000, Usage Fee Rs. 1,500 -> Net Rs. 8,500)
    const returnedItems: ReturnEntry[] = [
      { productId: "p1", productName: "PS5 Tekken 8", securityDeposit: 8000, feeDeducted: 1000, netCredit: 7000 },
      { productId: "p2", productName: "PS4 FC 26", securityDeposit: 10000, feeDeducted: 1500, netCredit: 8500 },
    ];
    const replacementItems: ReplacementEntry[] = []; // No replacement, pure cash refund

    const settlement = calculateRentalSettlement(returnedItems, replacementItems, 0);

    expect(settlement.totalSecDeposit).toBe(18000);
    expect(settlement.totalFeeCut).toBe(2500);
    expect(settlement.netDepositCredit).toBe(15500);
    expect(settlement.replacementTotal).toBe(0);
    expect(settlement.netDifference).toBe(-15500);
    expect(settlement.settlementStatus).toBe("SHOP_PAYS");
    expect(settlement.netCashRefund).toBe(15500);
    expect(settlement.netCashPayable).toBe(0);
  });

  it("Case 2: Customer returns 2 CDs and takes 1 Cheaper CD + Partial Cash Refund (Downgrade)", () => {
    // Returns 2 CDs with total net credit Rs. 15,500
    // Takes 1 game CD worth Rs. 9,000
    const returnedItems: ReturnEntry[] = [
      { productId: "p1", productName: "PS5 Tekken 8", securityDeposit: 8000, feeDeducted: 1000, netCredit: 7000 },
      { productId: "p2", productName: "PS4 FC 26", securityDeposit: 10000, feeDeducted: 1500, netCredit: 8500 },
    ];
    const replacementItems: ReplacementEntry[] = [
      { productId: "p3", productName: "PS5 Spider-Man 2", unitPrice: 9000, quantity: 1 },
    ];

    const settlement = calculateRentalSettlement(returnedItems, replacementItems, 0);

    expect(settlement.netDepositCredit).toBe(15500);
    expect(settlement.replacementTotal).toBe(9000);
    expect(settlement.netDifference).toBe(-6500); // 9000 - 15500 = -6500
    expect(settlement.settlementStatus).toBe("SHOP_PAYS");
    expect(settlement.netCashRefund).toBe(6500);
    expect(settlement.netCashPayable).toBe(0);
  });

  it("Case 3: Customer returns 1 CD and takes a more expensive CD with Cash Top-up (Upgrade)", () => {
    // Returns 1 CD: Deposit Rs. 8,000, Fee Rs. 1,000 -> Net credit Rs. 7,000
    // Takes 1 game CD worth Rs. 12,000
    const returnedItems: ReturnEntry[] = [
      { productId: "p1", productName: "PS5 Tekken 8", securityDeposit: 8000, feeDeducted: 1000, netCredit: 7000 },
    ];
    const replacementItems: ReplacementEntry[] = [
      { productId: "p4", productName: "PS5 GTA VI", unitPrice: 12000, quantity: 1 },
    ];

    const settlement = calculateRentalSettlement(returnedItems, replacementItems, 0);

    expect(settlement.netDepositCredit).toBe(7000);
    expect(settlement.replacementTotal).toBe(12000);
    expect(settlement.netDifference).toBe(5000); // 12000 - 7000 = +5000
    expect(settlement.settlementStatus).toBe("CUSTOMER_PAYS");
    expect(settlement.netCashPayable).toBe(5000);
    expect(settlement.netCashRefund).toBe(0);
  });

  it("Case 4: Customer provides additional cash top-up upfront for swap", () => {
    // Returns 1 CD: Net credit Rs. 7,000 + customer gave Rs. 5,000 top-up cash upfront
    // Total available credit = 12,000
    // Takes game CD worth Rs. 12,000 -> Even swap (Rs. 0 net diff)
    const returnedItems: ReturnEntry[] = [
      { productId: "p1", productName: "PS5 Tekken 8", securityDeposit: 8000, feeDeducted: 1000, netCredit: 7000 },
    ];
    const replacementItems: ReplacementEntry[] = [
      { productId: "p4", productName: "PS5 GTA VI", unitPrice: 12000, quantity: 1 },
    ];

    const settlement = calculateRentalSettlement(returnedItems, replacementItems, 5000);

    expect(settlement.netDepositCredit).toBe(12000);
    expect(settlement.replacementTotal).toBe(12000);
    expect(settlement.netDifference).toBe(0);
    expect(settlement.settlementStatus).toBe("EVEN_EXCHANGE");
    expect(settlement.netCashPayable).toBe(0);
    expect(settlement.netCashRefund).toBe(0);
  });
});
