import { describe, it, expect } from "vitest";
import { Repair } from "@/models/Repair";
import { CustomerLedger } from "@/models/CustomerLedger";
import mongoose from "mongoose";

describe("Repair Module & Schema Verification", () => {
  it("should validate Repair model with customer device serial number, technician, and parts", () => {
    const repair = new Repair({
      repairNumber: "REP-20261016-0001",
      customer: new mongoose.Types.ObjectId(),
      customerName: "Hamza Siddiqui",
      customerPhone: "03120000000",
      productName: "PS5 Slim Disc Console",
      serialNumber: "03-27452819-5847392",
      faultReason: "HDMI port physically damaged, no video output",
      parts: [
        {
          product: new mongoose.Types.ObjectId(),
          productName: "PS5 HDMI 2.1 Connector Port",
          sku: "PART-HDMI-PS5",
          barcode: "1122334455",
          quantity: 1,
          unitCost: 800,
          unitPrice: 1500,
          totalCost: 800,
          lineTotal: 1500,
        },
      ],
      laborCost: 3500,
      partsCostTotal: 800,
      partsTotal: 1500,
      totalAmount: 5000,
      paidAmount: 2000,
      balanceDue: 3000,
      paymentMethod: "CASH",
      status: "PENDING",
      repairedBy: "Ali Technician",
      location: new mongoose.Types.ObjectId(),
      locationName: "Main Branch Saddar",
      createdBy: "staff-counter",
    });

    expect(repair.repairNumber).toBe("REP-20261016-0001");
    expect(repair.productName).toBe("PS5 Slim Disc Console");
    expect(repair.serialNumber).toBe("03-27452819-5847392");
    expect(repair.faultReason).toBe("HDMI port physically damaged, no video output");
    expect(repair.laborCost).toBe(3500);
    expect(repair.totalAmount).toBe(5000);
    expect(repair.paidAmount).toBe(2000);
    expect(repair.balanceDue).toBe(3000);
    expect(repair.repairedBy).toBe("Ali Technician");
    expect(repair.parts).toHaveLength(1);
    expect(repair.parts[0].productName).toBe("PS5 HDMI 2.1 Connector Port");
  });

  it("should accept CustomerLedger entries with referenceType 'Repair'", () => {
    const invoiceEntry = new CustomerLedger({
      entryNumber: "CLG-20261016-0001",
      customer: new mongoose.Types.ObjectId(),
      type: "INVOICE",
      debit: 5000,
      credit: 0,
      amount: 5000,
      runningOutstanding: 5000,
      runningAdvance: 0,
      referenceType: "Repair",
      referenceId: "REP-20261016-0001",
      notes: "Repair Charges: PS5 Slim Disc (SN: 03-27452819-5847392)",
      createdBy: "staff-counter",
    });

    expect(invoiceEntry.referenceType).toBe("Repair");
    expect(invoiceEntry.debit).toBe(5000);

    const paymentEntry = new CustomerLedger({
      entryNumber: "CLG-20261016-0002",
      customer: new mongoose.Types.ObjectId(),
      type: "PAYMENT",
      debit: 0,
      credit: 2000,
      amount: 2000,
      runningOutstanding: 3000,
      runningAdvance: 0,
      referenceType: "Repair",
      referenceId: "REP-20261016-0001",
      notes: "Payment for Repair REP-20261016-0001 via CASH",
      createdBy: "staff-counter",
    });

    expect(paymentEntry.referenceType).toBe("Repair");
    expect(paymentEntry.credit).toBe(2000);
    expect(paymentEntry.runningOutstanding).toBe(3000);
  });

  it("should accurately compute repair net profit as Customer Bill minus total costs (repairCost + partsCostTotal)", () => {
    const repairWithDirectCost = new Repair({
      repairNumber: "REP-20261016-0002",
      customer: new mongoose.Types.ObjectId(),
      customerName: "Zubair Khan",
      customerPhone: "03001234567",
      productName: "PS4 Pro Console",
      faultReason: "Power Supply IC replacement",
      parts: [],
      laborCost: 3000,
      repairCost: 1800, // Shop's direct cost / kharcha
      partsCostTotal: 0,
      partsTotal: 0,
      totalAmount: 3000, // Customer Bill
      paidAmount: 3000,
      balanceDue: 0,
      paymentMethod: "CASH",
      status: "COMPLETED",
      repairedBy: "Kamran Tech",
      location: new mongoose.Types.ObjectId(),
      locationName: "Main Branch",
      createdBy: "admin",
    });

    expect(repairWithDirectCost.repairCost).toBe(1800);
    expect(repairWithDirectCost.totalAmount).toBe(3000);
    
    // Profit = Bill (3000) - Cost (1800) = 1200
    const netProfit = repairWithDirectCost.totalAmount - (repairWithDirectCost.repairCost + repairWithDirectCost.partsCostTotal);
    expect(netProfit).toBe(1200);
  });

  it("should support negative adjustmentAmount as discount/waiver reducing totalAmount and clearing balance", () => {
    const repair = new Repair({
      repairNumber: "REP-20261016-0003",
      customerName: "Waqas Ahmed",
      customerPhone: "03211112233",
      productName: "DualSense Edge Controller",
      faultReason: "Stick drift calibration",
      laborCost: 2000,
      totalAmount: 2000,
      paidAmount: 500,
      balanceDue: 1500,
      repairedBy: "Tech A",
      location: new mongoose.Types.ObjectId(),
      createdBy: "staff",
    });

    // Customer negotiates Rs. 200 discount at counter (-200 adjustment)
    const adjustment = -200;
    repair.totalAmount += adjustment; // 2000 - 200 = 1800
    repair.adjustmentAmount = adjustment;
    repair.adjustmentReason = "Customer settlement round-off";

    // Customer pays remaining 1300
    const collected = 1300;
    repair.paidAmount += collected;
    repair.balanceDue = Math.max(0, repair.totalAmount - repair.paidAmount); // 1800 - 1800 = 0

    if (repair.balanceDue === 0) {
      repair.status = "DELIVERED";
    }

    expect(repair.totalAmount).toBe(1800);
    expect(repair.adjustmentAmount).toBe(-200);
    expect(repair.balanceDue).toBe(0);
    expect(repair.status).toBe("DELIVERED");
  });

  it("should support positive adjustmentAmount as extra charge/surcharge increasing totalAmount", () => {
    const repair = new Repair({
      repairNumber: "REP-20261016-0004",
      customerName: "Rashid Ali",
      customerPhone: "03334445566",
      productName: "Xbox Series X",
      faultReason: "Overheating fan replacement",
      laborCost: 4000,
      totalAmount: 4000,
      paidAmount: 1000,
      balanceDue: 3000,
      repairedBy: "Tech B",
      location: new mongoose.Types.ObjectId(),
      createdBy: "staff",
    });

    // Customer requests express rush delivery fee (+500 adjustment)
    const adjustment = 500;
    repair.totalAmount += adjustment; // 4000 + 500 = 4500
    repair.adjustmentAmount = adjustment;
    repair.adjustmentReason = "Express rush service fee";

    // Customer pays 3500
    const collected = 3500;
    repair.paidAmount += collected;
    repair.balanceDue = Math.max(0, repair.totalAmount - repair.paidAmount); // 4500 - 4500 = 0

    if (repair.balanceDue === 0) {
      repair.status = "DELIVERED";
    }

    expect(repair.totalAmount).toBe(4500);
    expect(repair.adjustmentAmount).toBe(500);
    expect(repair.balanceDue).toBe(0);
    expect(repair.status).toBe("DELIVERED");
  });
});

