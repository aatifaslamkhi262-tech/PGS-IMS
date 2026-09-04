const mongoose = require("mongoose");

const MONGO_URI = "mongodb+srv://aatifaslamkhi262_db_user:d6NVyVP7vDn5vfd5@pgsgameshop.zkl5dcb.mongodb.net/pgs-ims?retryWrites=true&w=majority";

// Collections that will be CLEARED (test/business data)
const CLEAR_COLLECTIONS = [
  "products",
  "suppliers",
  "purchaseinvoices",
  "purchasereceivings",
  "inventories",
  "inventorymovements",
  "serialnumbers",
  "categories",
  "productgroups",
];

// Collections that will NEVER be touched
const PRESERVE_COLLECTIONS = ["users", "locations"];

async function run() {
  console.log("============================================");
  console.log("  PGS-IMS TEST DATA CLEANUP SCRIPT");
  console.log("============================================\n");

  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  console.log(`Database Name: ${db.databaseName}`);
  console.log(`MongoDB Host: ${mongoose.connection.host}\n`);

  // 1. List all collection names
  const allCollections = await db.listCollections().toArray();
  const allNames = allCollections.map((c) => c.name);
  console.log("All collections in database:", allNames.join(", "), "\n");

  // 2. Pre-cleanup counts for PRESERVED collections
  console.log("--- PRESERVED COLLECTIONS (will NOT be modified) ---");
  for (const col of PRESERVE_COLLECTIONS) {
    if (allNames.includes(col)) {
      const count = await db.collection(col).countDocuments();
      console.log(`  ${col}: ${count} documents -- PRESERVED`);
    } else {
      console.log(`  ${col}: not found in database`);
    }
  }

  // 3. Show users explicitly
  const userDocs = await db.collection("users").find({}, { projection: { username: 1, role: 1 } }).toArray();
  console.log("\n  Users to be preserved:");
  for (const u of userDocs) {
    console.log(`    - ${u.username} (${u.role})`);
  }

  // 4. Pre-cleanup counts for CLEAR collections
  console.log("\n--- COLLECTIONS TO BE CLEARED (test/business data) ---");
  const preCounts = {};
  for (const col of CLEAR_COLLECTIONS) {
    if (allNames.includes(col)) {
      const count = await db.collection(col).countDocuments();
      preCounts[col] = count;
      console.log(`  ${col}: ${count} documents -- WILL BE CLEARED`);
    } else {
      preCounts[col] = 0;
      console.log(`  ${col}: not found in database (skipping)`);
    }
  }

  // 5. Confirm safety: check no overlap
  for (const col of CLEAR_COLLECTIONS) {
    if (PRESERVE_COLLECTIONS.includes(col)) {
      throw new Error(`SAFETY ERROR: ${col} is in both CLEAR and PRESERVE lists!`);
    }
  }

  console.log("\n============================================");
  console.log("  EXECUTING CLEANUP...");
  console.log("============================================\n");

  const deletedCounts = {};
  for (const col of CLEAR_COLLECTIONS) {
    if (allNames.includes(col) && preCounts[col] > 0) {
      const result = await db.collection(col).deleteMany({});
      deletedCounts[col] = result.deletedCount;
      console.log(`  CLEARED ${col}: ${result.deletedCount} documents deleted`);
    } else {
      deletedCounts[col] = 0;
      console.log(`  SKIPPED ${col}: already empty or not found`);
    }
  }

  console.log("\n============================================");
  console.log("  POST-CLEANUP VERIFICATION");
  console.log("============================================\n");

  // Verify Users preserved
  const postUserCount = await db.collection("users").countDocuments();
  const postUsers = await db.collection("users").find({}, { projection: { username: 1, role: 1, active: 1 } }).toArray();
  console.log(`Users: ${userDocs.length} before -> ${postUserCount} after`);
  for (const u of postUsers) {
    console.log(`  ✓ ${u.username} (${u.role}) - active: ${u.active}`);
  }

  // Verify Locations preserved
  const preLocationCount = await db.collection("locations").countDocuments();
  const locations = await db.collection("locations").find({}, { projection: { name: 1, code: 1, type: 1 } }).toArray();
  console.log(`\nLocations: ${preLocationCount} preserved`);
  for (const l of locations) {
    console.log(`  ✓ ${l.name} (${l.code}) - ${l.type}`);
  }

  // Verify cleared collections are now empty
  console.log("\n--- Cleared collection counts (should all be 0) ---");
  let allClear = true;
  for (const col of CLEAR_COLLECTIONS) {
    if (allNames.includes(col)) {
      const count = await db.collection(col).countDocuments();
      const ok = count === 0;
      if (!ok) allClear = false;
      console.log(`  ${col}: ${count} documents ${ok ? "✓" : "✗ NOT EMPTY!"}`);
    }
  }

  console.log("\n============================================");
  if (postUserCount === userDocs.length && postUserCount >= 5 && allClear) {
    console.log("  ✓ CLEANUP COMPLETE - All verifications passed");
  } else {
    console.log("  ✗ WARNING - Some verifications failed! Check output above.");
  }
  console.log("============================================\n");

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Cleanup script failed:", err);
  process.exit(1);
});
