const mongoose = require("mongoose");

const MONGO_URI = "mongodb+srv://aatifaslamkhi262_db_user:d6NVyVP7vDn5vfd5@pgsgameshop.zkl5dcb.mongodb.net/pgs-ims?retryWrites=true&w=majority";

async function run() {
  await mongoose.connect(MONGO_URI);

  const Product = mongoose.models.Product || mongoose.model("Product", new mongoose.Schema({}, { strict: false }));

  console.log("=== FULL PRODUCT DOC: PS4 FAT 500GB UNSEALED ===");
  const p1 = await Product.findById("6a9c07918aa26ed7e41dfb1a").lean();
  console.log(JSON.stringify(p1, null, 2));

  console.log("\n=== FULL PRODUCT DOC: PS4 SLIM 500GB UNSEALED ===");
  const p2 = await Product.findById("6a9c07928aa26ed7e41dfb1c").lean();
  console.log(JSON.stringify(p2, null, 2));

  await mongoose.disconnect();
}

run().catch(console.error);
