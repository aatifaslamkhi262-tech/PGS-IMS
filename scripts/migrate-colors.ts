import { dbConnect } from "@/lib/db";
import { Product } from "@/models/Product";

/**
 * Explicit One-Time Admin Migration Script
 * Safely updates existing Product documents missing color/brand/modelNumber.
 * Sets color: "Unspecified", brand: "", modelNumber: model if missing.
 */
export async function runColorMigration() {
  await dbConnect();
  console.log("Starting explicit one-time color migration...");

  const products = await Product.find({ isDeleted: false });
  let updatedCount = 0;

  for (const product of products) {
    let modified = false;
    const p = product as any;

    if (!p.color) {
      p.color = "Unspecified";
      modified = true;
    }

    if (p.brand === undefined || p.brand === null) {
      p.brand = "";
      modified = true;
    }

    if (!p.modelNumber && p.model) {
      p.modelNumber = p.model;
      modified = true;
    } else if (!p.model && p.modelNumber) {
      p.model = p.modelNumber;
      modified = true;
    }

    if (modified) {
      await product.save({ validateBeforeSave: false });
      updatedCount++;
    }
  }

  console.log(`Color migration complete. Updated ${updatedCount} products.`);
  return { updatedCount, totalCount: products.length };
}
