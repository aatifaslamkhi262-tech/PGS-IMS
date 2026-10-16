import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendCustomerOrderConfirmation, sendOwnerOrderAlert, OrderEmailInput } from "./emailService";
import { Sale } from "@/models/Sale";
import mongoose from "mongoose";

describe("Customer Order Email and Sale Model Verification", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should validate Sale model schema accepts and defaults customerEmail", () => {
    const saleInstance = new Sale({
      saleNumber: "WEB-TEST-001",
      creationMode: "WAREHOUSE_QUICK_SALE",
      saleSource: "WEBSITE",
      location: new mongoose.Types.ObjectId(),
      locationName: "Central Warehouse",
      customerName: "Ali Khan",
      customerPhone: "03001234567",
      customerEmail: "ali.khan@example.com",
      items: [
        {
          product: new mongoose.Types.ObjectId(),
          productName: "DualSense PS5 Controller",
          sku: "PS5-CTRL-01",
          barcode: "1234567890",
          condition: "New",
          quantity: 1,
          unitCost: 15000,
          unitPrice: 21500,
          minSellingPrice: 20000,
          lineTotal: 21500,
          grossProfit: 6500,
        },
      ],
      subtotal: 21500,
      deliveryCharges: 250,
      totalAmount: 21750,
      totalCost: 15000,
      netProfit: 6750,
      createdBy: "ecommerce-web",
    });

    expect(saleInstance.customerEmail).toBe("ali.khan@example.com");
    expect(saleInstance.customerName).toBe("Ali Khan");
  });

  it("should gracefully handle missing customer email in sendCustomerOrderConfirmation", async () => {
    const orderWithoutEmail: OrderEmailInput = {
      saleNumber: "WEB-TEST-002",
      customerName: "No Email User",
      items: [],
      totalAmount: 5000,
    };

    const res = await sendCustomerOrderConfirmation(orderWithoutEmail);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Customer email is not provided.");
  });

  it("should trigger Resend API call when customer email and API key are provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "msg_test_12345" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    process.env.RESEND_API_KEY = "re_mock_test_key";
    process.env.FROM_EMAIL = "PGS Game Shop <info@pgsgameshop.online>";

    const sampleOrder: OrderEmailInput = {
      saleNumber: "WEB-20261015-9999",
      customerName: "Hamza Siddiqui",
      customerPhone: "03120000000",
      customerEmail: "customer@gmail.com",
      shippingAddress: "House 45, Block 5, Gulshan, Karachi",
      paymentMethod: "CASH",
      deliveryCharges: 250,
      subtotal: 15000,
      totalAmount: 15250,
      items: [
        {
          productName: "EA Sports FC 25 (PS5)",
          condition: "New",
          quantity: 1,
          unitPrice: 15000,
          lineTotal: 15000,
        },
      ],
    };

    const res = await sendCustomerOrderConfirmation(sampleOrder);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(options.method).toBe("POST");

    const sentBody = JSON.parse(options.body);
    expect(sentBody.to).toEqual(["customer@gmail.com"]);
    expect(sentBody.from).toBe("PGS Game Shop <info@pgsgameshop.online>");
    expect(sentBody.subject).toContain("WEB-20261015-9999");
    expect(sentBody.html).toContain("+92 312 2319157");
    expect(sentBody.html).toContain("EA Sports FC 25 (PS5)");
    expect(sentBody.html).toContain("Rs. 15,250");
    expect(sentBody.html).toContain("pgs_logo.png");
    expect(res.success).toBe(true);
    expect(res.data.id).toBe("msg_test_12345");
  });
});
