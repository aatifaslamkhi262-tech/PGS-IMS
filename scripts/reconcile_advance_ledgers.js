const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGODB_URI || "mongodb+srv://aatifaslamkhi262_db_user:d6NVyVP7vDn5vfd5@pgsgameshop.zkl5dcb.mongodb.net/pgs-ims?retryWrites=true&w=majority";

async function run() {
  console.log("Connecting to Database...");
  await mongoose.connect(MONGO_URI);

  const Sale = mongoose.models.Sale || mongoose.model("Sale", new mongoose.Schema({}, { strict: false }));
  const SerialNumber = mongoose.models.SerialNumber || mongoose.model("SerialNumber", new mongoose.Schema({}, { strict: false }));
  const Customer = mongoose.models.Customer || mongoose.model("Customer", new mongoose.Schema({}, { strict: false }));
  const CustomerLedger = mongoose.models.CustomerLedger || mongoose.model("CustomerLedger", new mongoose.Schema({}, { strict: false }));
  const Payment = mongoose.models.Payment || mongoose.model("Payment", new mongoose.Schema({}, { strict: false }));

  console.log("\n=== 1. UNRESERVING SERIAL NUMBERS BELONGING TO CANCELLED SALES ===");
  const cancelledSales = await Sale.find({ status: "CANCELLED" }).lean();
  let unreservedCount = 0;

  for (const sale of cancelledSales) {
    for (const item of sale.items || []) {
      if (item.serialNumbers && item.serialNumbers.length > 0) {
        const res = await SerialNumber.updateMany(
          { serialNumber: { $in: item.serialNumbers }, status: "Reserved" },
          { $set: { status: "Available", location: sale.locationName || "Warehouse" } }
        );
        if (res.modifiedCount > 0) {
          unreservedCount += res.modifiedCount;
          console.log(`Unreserved ${res.modifiedCount} serial(s) from cancelled sale ${sale.saleNumber}`);
        }
      }
    }
  }
  console.log(`Total serial numbers unreserved: ${unreservedCount}`);

  console.log("\n=== 2. RECONCILING CUSTOMER ADVANCE BALANCES ===");
  const customers = await Customer.find({ active: true }).lean();

  for (const cust of customers) {
    const custId = cust._id;

    // Get all completed/active sales for this customer
    const activeSales = await Sale.find({
      customer: custId,
      status: { $in: ["COMPLETED", "PAYMENT_PENDING", "CHECKOUT", "DRAFT"] }
    }).lean();

    // Get all paid payments for active sales or standalone advance deposits
    const activeSaleIds = activeSales.map(s => s._id);
    const activePayments = await Payment.find({
      $or: [
        { sale: { $in: activeSaleIds }, status: "PAID" },
        { customer: custId, sale: { $exists: false }, status: "PAID" }
      ]
    }).lean();

    // Recalculate advance deposit balance:
    // Only count payments for PAYMENT_PENDING advance bookings, or standalone CUSTOMER_ADVANCE payments
    let expectedAdvance = 0;
    for (const s of activeSales) {
      if (s.status === "PAYMENT_PENDING") {
        const paymentsForSale = await Payment.find({ sale: s._id, status: "PAID" }).lean();
        const paidForPending = paymentsForSale.reduce((sum, p) => sum + Number(p.amount || 0), 0);
        expectedAdvance += paidForPending;
      }
    }

    // Add standalone customer advance payments without sale
    const standaloneAdvances = await Payment.find({
      customer: custId,
      $or: [{ sale: { $exists: false } }, { sale: null }],
      paymentMethod: "CUSTOMER_ADVANCE",
      status: "PAID"
    }).lean();

    for (const sa of standaloneAdvances) {
      expectedAdvance += Number(sa.amount || 0);
    }

    // Recalculate outstanding balance from active COMPLETED sales
    let expectedOutstanding = 0;
    for (const s of activeSales) {
      if (s.status === "COMPLETED") {
        const paymentsForSale = await Payment.find({ sale: s._id, status: "PAID" }).lean();
        const totalPaid = paymentsForSale.reduce((sum, p) => sum + Number(p.amount || 0), 0);
        const due = Math.max(0, (s.totalAmount || 0) - totalPaid);
        expectedOutstanding += due;
      }
    }

    if (cust.advanceBalance !== expectedAdvance || cust.outstandingBalance !== expectedOutstanding) {
      console.log(`Customer '${cust.name}' (${cust.phone}):`);
      console.log(`  Advance Balance: Current=${cust.advanceBalance} -> Corrected=${expectedAdvance}`);
      console.log(`  Outstanding Balance: Current=${cust.outstandingBalance} -> Corrected=${expectedOutstanding}`);

      await Customer.updateOne(
        { _id: custId },
        { $set: { advanceBalance: expectedAdvance, outstandingBalance: expectedOutstanding } }
      );
    }
  }

  console.log("\n=== RECONCILIATION COMPLETE ===");
  await mongoose.disconnect();
}

run().catch(console.error);
