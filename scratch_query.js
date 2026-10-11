const mongoose = require("mongoose");

const MONGO_URI = "mongodb+srv://aatifaslamkhi262_db_user:d6NVyVP7vDn5vfd5@pgsgameshop.zkl5dcb.mongodb.net/pgs-ims?retryWrites=true&w=majority";

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB.");

  const Product = mongoose.models.Product || mongoose.model("Product", new mongoose.Schema({}, { strict: false }));
  const Inventory = mongoose.models.Inventory || mongoose.model("Inventory", new mongoose.Schema({}, { strict: false }));
  const InventoryMovement = mongoose.models.InventoryMovement || mongoose.model("InventoryMovement", new mongoose.Schema({}, { strict: false }));
  const CostAdjustment = mongoose.models.CostAdjustment || mongoose.model("CostAdjustment", new mongoose.Schema({}, { strict: false }));
  const Location = mongoose.models.Location || mongoose.model("Location", new mongoose.Schema({}, { strict: false }));
  const User = mongoose.models.User || mongoose.model("User", new mongoose.Schema({}, { strict: false }));

  // 1. Find all products matching "PS5 Slim"
  const products = await Product.find({ name: new RegExp("PS5 Slim", "i") }).lean();
  console.log(`\n=================== PRODUCTS MATCHING 'PS5 Slim' (${products.length}) ===================`);
  products.forEach(p => {
    console.log(`ID: ${p._id} | Name: "${p.name}" | Condition: "${p.condition}" | SKU: "${p.sku}" | CostPrice: ${p.costPrice} | SellingPrice: ${p.sellingPrice} | MinSellingPrice: ${p.minSellingPrice} | UpdatedAt: ${p.updatedAt}`);
  });

  const productIds = products.map(p => p._id);

  // 2. Find all Inventory documents for these products
  const inventories = await Inventory.find({ product: { $in: productIds } }).populate("location", "name code").lean();
  console.log(`\n=================== INVENTORY POOLS (${inventories.length}) ===================`);
  inventories.forEach(inv => {
    const locName = inv.location ? inv.location.name : inv.location;
    console.log(`ID: ${inv._id} | ProdId: ${inv.product} | Loc: ${locName} | Condition: "${inv.condition}" | Qty: ${inv.quantity} | AvgCost: ${inv.averageCost} | TotalCostValue: ${inv.totalCostValue} | UpdatedAt: ${inv.updatedAt}`);
  });

  // 3. Find all CostAdjustment records for these products
  const costAdjustments = await CostAdjustment.find({ product: { $in: productIds } }).populate("changedBy", "name username role").sort({ createdAt: 1 }).lean();
  console.log(`\n=================== COST ADJUSTMENTS LOGS (${costAdjustments.length}) ===================`);
  costAdjustments.forEach(ca => {
    const userStr = ca.changedBy ? `${ca.changedBy.username || ca.changedBy.name} (${ca.changedBy.role || ca.userRole})` : ca.userRole;
    console.log(`Date: ${ca.createdAt ? new Date(ca.createdAt).toISOString() : "N/A"} | ProdId: ${ca.product} | PrevCost: ${ca.previousCost} | NewCost: ${ca.newCost} | Type: ${ca.costType} | User: ${userStr} | Reason: "${ca.reason}" | Ref: "${ca.reference}"`);
  });

  // 4. Find all InventoryMovement records from Sep 25 to Oct 10
  const startDate = new Date("2026-09-25T00:00:00.000Z");
  const endDate = new Date("2026-10-10T23:59:59.000Z");

  const movements = await InventoryMovement.find({
    product: { $in: productIds },
    date: { $gte: startDate, $lte: endDate }
  }).sort({ date: 1 }).lean();

  console.log(`\n=================== INVENTORY MOVEMENTS (${movements.length}) [Sep 25 - Oct 10] ===================`);
  movements.forEach(m => {
    console.log(`Date: ${m.date ? new Date(m.date).toISOString() : "N/A"} | Type: ${m.type} | ProdId: ${m.product} | Condition: "${m.condition}" | Qty: ${m.quantity} | Source: "${m.sourceName}" | Dest: "${m.destinationName}" | Ref: "${m.referenceTransaction}" | User: "${m.performedBy}" | Notes: "${m.notes}" | BeforeQty: ${m.beforeQuantity} | AfterQty: ${m.afterQuantity}`);
  });

  await mongoose.disconnect();
}

run().catch(console.error);
