// Check PS4 FC 26 cost from PurchaseInvoice items directly
import mongoose from "mongoose";
import * as dotenv from "fs";

const envRaw = dotenv.readFileSync(".env", "utf-8");
const mongoUriLine = envRaw.split("\n").find(l => l.startsWith("MONGO_URI="));
const MONGO_URI = mongoUriLine?.split("=").slice(1).join("=").trim();

await mongoose.connect(MONGO_URI, { bufferCommands: false });
console.log("✅ Connected\n");

// PS4 FC 26 product IDs found earlier:
// NEW:  6aa056f6250929aa1e03657c  (SKU: PF2-NEW-767)   currentCost: Rs.8100
// USED: 6ac515ee9d4c24ae27082b42 (SKU: PF2-USED-657)  currentCost: Rs.4500

const ProductSchema = new mongoose.Schema({}, { strict: false });
const PurchaseInvoiceSchema = new mongoose.Schema({
  invoiceNumber: String,
  invoiceDate: Date,
  status: String,
  createdAt: Date,
  items: [{ product: mongoose.Types.ObjectId, name: String, quantity: Number, unitCost: Number, amount: Number, condition: String }]
}, { strict: false });

const PurchaseReceivingSchema = new mongoose.Schema({
  receivingNumber: String,
  approvedAt: Date,
  createdAt: Date,
  items: [{ product: mongoose.Types.ObjectId, name: String, quantityReceived: Number, unitCost: Number, condition: String }]
}, { strict: false });

const Product = mongoose.models.Product || mongoose.model("Product", ProductSchema, "products");
const PurchaseInvoice = mongoose.models.PurchaseInvoice || mongoose.model("PurchaseInvoice", PurchaseInvoiceSchema, "purchaseinvoices");
const PurchaseReceiving = mongoose.models.PurchaseReceiving || mongoose.model("PurchaseReceiving", PurchaseReceivingSchema, "purchasereceivings");

const PS4_NEW_ID  = new mongoose.Types.ObjectId("6aa056f6250929aa1e03657c");
const PS4_USED_ID = new mongoose.Types.ObjectId("6ac515ee9d4c24ae27082b42");
const INV0381_DATE = new Date("2026-10-28T00:00:00Z"); // Invoice was on 27 Oct

// ─── PurchaseInvoice items for PS4 FC 26 BEFORE INV0381 ───
const invoices = await PurchaseInvoice.find({
  "items.product": { $in: [PS4_NEW_ID, PS4_USED_ID] },
  invoiceDate: { $lt: INV0381_DATE },
  status: { $in: ["Inventory_Updated", "Receiving_Approved", "Receiving", "Approved"] }
}).sort({ invoiceDate: -1 }).lean();

console.log("═══ PURCHASE INVOICES (before INV0381) ═══");
if (!invoices.length) {
  console.log("⚠️  No previous approved invoices found for PS4 FC 26");
} else {
  for (const inv of invoices) {
    const matchItems = inv.items.filter(it =>
      it.product?.toString() === PS4_NEW_ID.toString() ||
      it.product?.toString() === PS4_USED_ID.toString()
    );
    for (const item of matchItems) {
      const isNew = item.product?.toString() === PS4_NEW_ID.toString();
      console.log(`📄 Invoice: ${inv.invoiceNumber} | Date: ${new Date(inv.invoiceDate).toLocaleDateString('en-PK')} | ${isNew ? 'NEW' : 'USED'} | Qty: ${item.quantity} | UnitCost: Rs.${item.unitCost}`);
    }
  }
}

// ─── PurchaseReceiving items for PS4 FC 26 BEFORE INV0381 ───
const receivings = await PurchaseReceiving.find({
  "items.product": { $in: [PS4_NEW_ID, PS4_USED_ID] },
  createdAt: { $lt: INV0381_DATE }
}).sort({ createdAt: -1 }).lean();

console.log("\n═══ PURCHASE RECEIVINGS (before INV0381) ═══");
if (!receivings.length) {
  console.log("⚠️  No receivings found before INV0381");
} else {
  for (const rec of receivings) {
    const matchItems = rec.items.filter(it =>
      it.product?.toString() === PS4_NEW_ID.toString() ||
      it.product?.toString() === PS4_USED_ID.toString()
    );
    for (const item of matchItems) {
      const isNew = item.product?.toString() === PS4_NEW_ID.toString();
      console.log(`📦 Receiving: ${rec.receivingNumber} | Date: ${new Date(rec.approvedAt || rec.createdAt).toLocaleDateString('en-PK')} | ${isNew ? 'NEW' : 'USED'} | Qty: ${item.quantityReceived} | UnitCost: Rs.${item.unitCost}`);
    }
  }
}

// ─── Also show INV0381 PS4 line for reference ───
const inv0381 = await PurchaseInvoice.findOne({ invoiceNumber: "INV0381" }).lean();
if (inv0381) {
  const ps4Line = inv0381.items?.find(it =>
    it.product?.toString() === PS4_NEW_ID.toString() ||
    it.product?.toString() === PS4_USED_ID.toString()
  );
  if (ps4Line) {
    console.log(`\n═══ INV0381 PS4 FC 26 LINE (the wrong entry) ═══`);
    console.log(`❌ Qty: ${ps4Line.quantity} | UnitCost: Rs.${ps4Line.unitCost} | Condition: ${ps4Line.condition}`);
  }
}

// Current costPrice from Product
const p1 = await Product.findById(PS4_NEW_ID).lean();
const p2 = await Product.findById(PS4_USED_ID).lean();
console.log(`\n═══ CURRENT costPrice IN PRODUCT MASTER ═══`);
console.log(`PS4 FC 26 NEW:  Rs.${p1?.costPrice}`);
console.log(`PS4 FC 26 USED: Rs.${p2?.costPrice}`);

await mongoose.disconnect();
console.log("\n✅ Done");
