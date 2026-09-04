import mongoose from "mongoose";

// Register all schemas globally to prevent "Schema hasn't been registered" errors in serverless routes
import "@/models/Supplier";
import "@/models/Product";
import "@/models/Location";
import "@/models/PurchaseInvoice";
import "@/models/PurchaseReceiving";
import "@/models/Inventory";
import "@/models/SerialNumber";
import "@/models/InventoryMovement";
import "@/models/User";
import "@/models/Category";
import "@/models/ProductGroup";

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongoose: MongooseCache | undefined;
}

const g = global as unknown as { mongoose: MongooseCache };

if (!g.mongoose) {
  g.mongoose = { conn: null, promise: null };
}

const cached = g.mongoose;

export async function dbConnect(): Promise<typeof mongoose> {
  const MONGO_URI = process.env.MONGO_URI;

  if (!MONGO_URI) {
    throw new Error(
      "Please define the MONGO_URI environment variable inside .env"
    );
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose.connect(MONGO_URI, opts).then((mongooseInstance) => {
      return mongooseInstance;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}
