const mongoose = require("mongoose");

const MONGO_URI = "mongodb+srv://aatifaslamkhi262_db_user:d6NVyVP7vDn5vfd5@pgsgameshop.zkl5dcb.mongodb.net/pgs-ims?retryWrites=true&w=majority";

async function run() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGO_URI);
  console.log("Connected!");

  // List all products
  const Product = mongoose.models.Product || mongoose.model("Product", new mongoose.Schema({}, { strict: false }));
  const PurchaseInvoice = mongoose.models.PurchaseInvoice || mongoose.model("PurchaseInvoice", new mongoose.Schema({}, { strict: false }));
  const PurchaseReceiving = mongoose.models.PurchaseReceiving || mongoose.model("PurchaseReceiving", new mongoose.Schema({}, { strict: false }));

  console.log("\n--- PRODUCTS ---");
  const products = await Product.find({ isDeleted: false }).lean();
  for (const p of products) {
    console.log(`Product: "${p.name}" | ID: ${p._id} | Barcode: ${p.barcode} | Sells: Rs. ${p.sellingPrice} | Min Sell: Rs. ${p.minSellingPrice} | Cost: Rs. ${p.costPrice}`);
  }

  console.log("\n--- PURCHASE INVOICES ---");
  const invoices = await PurchaseInvoice.find().lean();
  for (const inv of invoices) {
    console.log(`Invoice: ${inv.invoiceNumber} | Status: ${inv.status} | Items:`);
    for (const item of inv.items || []) {
      console.log(`  - Product ID: ${item.product} | Name: ${item.name} | Qty: ${item.quantity} | Cost: ${item.unitCost} | Selling: ${item.sellingPrice} | Min Selling: ${item.minSellingPrice}`);
    }
  }

  console.log("\n--- PHYSICAL RECEIVINGS ---");
  const receivings = await PurchaseReceiving.find().lean();
  for (const r of receivings) {
    console.log(`Receiving: ${r.receivingNumber} | Invoice ID: ${r.purchaseInvoice} | Status: ${r.status} | Items:`);
    for (const item of r.items || []) {
      console.log(`  - Product ID: ${item.product} | Name: ${item.name} | QtyRec: ${item.quantityReceived}`);
    }
  }

  console.log("\nDisconnecting...");
  await mongoose.disconnect();
}

run().catch(console.error);
