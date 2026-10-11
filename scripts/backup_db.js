const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// 1. Load Environment Variables from .env
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

// 2. Prepare Backup Target Directory with Timestamp
const now = new Date();
const dateStr = now.toISOString().slice(0, 10);
const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, "-");
const folderName = `backup_${dateStr}_${timeStr}`;
const targetDir = path.join(backupBaseDir, folderName);

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

console.log(`=======================================================`);
console.log(`📦 PGS-IMS MONGODB FULL BACKUP`);
console.log(`=======================================================`);
console.log(`📂 Destination: ${targetDir}`);
console.log(`🔗 Target DB URI: ${mongoUri.split("@")[1] || "MongoDB Cluster"}`);

// 3. Check if mongodump CLI tool is installed
let hasMongodump = false;
try {
  execSync("mongodump --version", { stdio: "ignore" });
  hasMongodump = true;
} catch {
  hasMongodump = false;
}

async function runBackup() {
  if (hasMongodump) {
    console.log(`\n🚀 'mongodump' detected. Running high-speed native BSON dump...`);
    try {
      execSync(`mongodump --uri="${mongoUri}" --out="${targetDir}"`, { stdio: "inherit" });
      console.log(`\n✅ Backup completed successfully via mongodump!`);
      console.log(`📁 Files saved in: ${targetDir}`);
      return;
    } catch (err) {
      console.warn(`⚠️ mongodump encountered an error, falling back to direct JSON extractor...`);
    }
  }

  // Fallback: Direct Node.js / Mongoose extractor (Zero dependencies needed, with auto-retry)
  console.log(`\nℹ️ Native mongodump CLI not in PATH. Using high-fidelity Node.js extractor...`);
  const mongoose = require("mongoose");
  
  async function connectWithRetry() {
    if (mongoose.connection.readyState === 1) return mongoose.connection.db;
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
    });
    return mongoose.connection.db;
  }

  let db = await connectWithRetry();
  const collections = await db.listCollections().toArray();

  console.log(`📊 Found ${collections.length} database collections to export.\n`);

  const summary = [];

  for (const colInfo of collections) {
    const colName = colInfo.name;
    if (colName.startsWith("system.")) continue;

    let retries = 3;
    let docs = [];
    let indexes = [];

    while (retries > 0) {
      try {
        db = await connectWithRetry();
        const collection = db.collection(colName);
        docs = await collection.find({}).toArray();
        indexes = await collection.indexes();
        break;
      } catch (colErr) {
        retries--;
        console.warn(`  ⚠️ Connection hiccup on [${colName}]. Retrying (${retries} left)...`);
        try { await mongoose.disconnect(); } catch {}
        await new Promise((r) => setTimeout(r, 2000));
        if (retries === 0) throw colErr;
      }
    }

    const dumpData = {
      collection: colName,
      exportedAt: new Date().toISOString(),
      count: docs.length,
      indexes,
      data: docs,
    };

    const filePath = path.join(targetDir, `${colName}.json`);
    fs.writeFileSync(filePath, JSON.stringify(dumpData, null, 2), "utf8");

    console.log(`  ✔ [${colName}] -> ${docs.length} documents saved (${filePath.split(path.sep).pop()})`);
    summary.push({ collection: colName, count: docs.length });
  }

  // Write backup manifest
  const manifest = {
    backupDate: new Date().toISOString(),
    totalCollections: summary.length,
    totalDocuments: summary.reduce((sum, s) => sum + s.count, 0),
    collections: summary,
  };
  fs.writeFileSync(path.join(targetDir, "_manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  await mongoose.disconnect();

  console.log(`\n=======================================================`);
  console.log(`✅ FULL BACKUP COMPLETED SUCCESSFULLY!`);
  console.log(`📁 Location: ${targetDir}`);
  console.log(`📊 Total Collections Exported: ${manifest.totalCollections}`);
  console.log(`📄 Total Documents Saved: ${manifest.totalDocuments}`);
  console.log(`=======================================================`);
}

runBackup().catch((err) => {
  console.error("❌ Backup failed with error:", err);
  process.exit(1);
});
