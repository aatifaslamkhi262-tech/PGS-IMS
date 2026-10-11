const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function loadEnv() {
  const envPath = path.resolve(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, "utf8");
  const env = {};
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...vals] = line.split("=");
    const val = vals.join("=").replace(/^["']|["']$/g, "").trim();
    env[key.trim()] = val;
  }
  return env;
}

const env = loadEnv();
const mongoUri = process.env.MONGO_URI || env.MONGO_URI;
const backupBaseDir = path.resolve(__dirname, "..", process.env.BACKUP_DIR || env.BACKUP_DIR || "./backups");

if (!mongoUri) {
  console.error("❌ Error: MONGO_URI is missing from .env!");
  process.exit(1);
}

// Find the target backup folder (either passed as argument or latest backup)
let backupFolder = process.argv[2];

if (!backupFolder) {
  // Find latest folder in backupBaseDir
  if (!fs.existsSync(backupBaseDir)) {
    console.error(`❌ Error: Backup directory '${backupBaseDir}' does not exist.`);
    process.exit(1);
  }

  const entries = fs.readdirSync(backupBaseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith("backup_"))
    .map((d) => d.name)
    .sort()
    .reverse();

  if (entries.length === 0) {
    console.error(`❌ No backup folders found in '${backupBaseDir}'.`);
    process.exit(1);
  }

  backupFolder = path.join(backupBaseDir, entries[0]);
  console.log(`ℹ️ No folder specified. Using latest backup: ${entries[0]}`);
} else {
  backupFolder = path.resolve(backupFolder);
}

if (!fs.existsSync(backupFolder)) {
  console.error(`❌ Error: Specified backup folder does not exist: ${backupFolder}`);
  process.exit(1);
}

console.log(`=======================================================`);
console.log(`🔄 PGS-IMS MONGODB RESTORE`);
console.log(`=======================================================`);
console.log(`📂 Source Backup: ${backupFolder}`);
console.log(`🔗 Target DB: ${mongoUri.split("@")[1] || "MongoDB Cluster"}`);

async function runRestore() {
  const mongoose = require("mongoose");
  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;

  const files = fs.readdirSync(backupFolder).filter((f) => f.endsWith(".json") && f !== "_manifest.json");

  console.log(`📊 Found ${files.length} collections to restore.\n`);

  for (const file of files) {
    const colName = file.replace(/\.json$/, "");
    const filePath = path.join(backupFolder, file);
    const content = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const docs = content.data || [];

    if (docs.length === 0) {
      console.log(`  ⚪ [${colName}] -> 0 documents (skipped)`);
      continue;
    }

    const collection = db.collection(colName);
    
    // Clear and restore documents
    await collection.deleteMany({});
    await collection.insertMany(docs);

    // Restore custom indexes if present
    if (Array.isArray(content.indexes)) {
      for (const idx of content.indexes) {
        if (idx.name === "_id_") continue; // Default index
        try {
          const key = idx.key;
          delete idx.key;
          delete idx.v;
          delete idx.ns;
          await collection.createIndex(key, idx);
        } catch {
          // Ignore index creation errors if conflict
        }
      }
    }

    console.log(`  ✔ [${colName}] -> ${docs.length} documents restored!`);
  }

  await mongoose.disconnect();
  console.log(`\n=======================================================`);
  console.log(`✅ RESTORE COMPLETED SUCCESSFULLY!`);
  console.log(`=======================================================`);
}

runRestore().catch((err) => {
  console.error("❌ Restore failed with error:", err);
  process.exit(1);
});
