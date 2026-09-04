import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Category } from "@/models/Category";
import { ProductGroup } from "@/models/ProductGroup";
import { Product } from "@/models/Product";
import { User } from "@/models/User";
import { Location } from "@/models/Location";
import { hashPassword } from "@/lib/auth/password";

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const allowSeed =
      process.env.NODE_ENV === "development" || searchParams.get("dev") === "true";

    if (!allowSeed) {
      return NextResponse.json(
        {
          success: false,
          error: "Seeding sample data is restricted to explicit development requests.",
        },
        { status: 403 }
      );
    }

    await dbConnect();

    // 0. Seed Users
    const usersToSeed = [
      { username: "admin", password: "adminpassword", role: "Admin" },
      { username: "warehouse", password: "warehousepassword", role: "Warehouse" },
      { username: "accountant", password: "accountantpassword", role: "Accountant" },
      { username: "branch", password: "branchpassword", role: "Branch" },
      { username: "salesman", password: "salesmanpassword", role: "Salesman" },
    ];

    const seededUsers = [];
    for (const u of usersToSeed) {
      const passwordHash = hashPassword(u.password);
      await User.findOneAndUpdate(
        { username: u.username },
        { username: u.username, passwordHash, role: u.role, active: true },
        { upsert: true, new: true }
      );
      seededUsers.push(u.username);
    }

    // 0.5 Seed Locations
    const locationsToSeed = [
      { name: "Warehouse", code: "WH", type: "Warehouse" as const },
      { name: "G-17", code: "G17", type: "Branch" as const },
      { name: "G-39", code: "G39", type: "Branch" as const },
      { name: "G-14", code: "G14", type: "Branch" as const },
      { name: "Claim Godam", code: "CG", type: "Claim Godam" as const },
    ];
    const seededLocations = [];
    for (const loc of locationsToSeed) {
      const l = await Location.findOneAndUpdate(
        { code: loc.code },
        { name: loc.name, code: loc.code, type: loc.type, active: true },
        { upsert: true, new: true }
      );
      seededLocations.push(l.name);
    }

    // 1. Create Categories
    const accessories = await Category.findOneAndUpdate(
      { name: "Accessories" },
      { name: "Accessories", code: "ACC" },
      { upsert: true, new: true }
    );
    const consoles = await Category.findOneAndUpdate(
      { name: "Consoles" },
      { name: "Consoles", code: "CNSL" },
      { upsert: true, new: true }
    );

    // 2. Create Product Groups
    const dualSenseGroup = await ProductGroup.findOneAndUpdate(
      { name: "DualSense Controller" },
      {
        name: "DualSense Controller",
        category: accessories._id,
        description: "Official PlayStation 5 DualSense Wireless Controller Family",
      },
      { upsert: true, new: true }
    );

    const ps5ConsoleGroup = await ProductGroup.findOneAndUpdate(
      { name: "PlayStation 5 Console" },
      {
        name: "PlayStation 5 Console",
        category: consoles._id,
        description: "Sony PlayStation 5 Home Entertainment Console Family",
      },
      { upsert: true, new: true }
    );

    const ps5SlimDiscGroup = await ProductGroup.findOneAndUpdate(
      { name: "PS5 Slim Disc Edition" },
      {
        name: "PS5 Slim Disc Edition",
        category: consoles._id,
        description:
          "Sony PlayStation 5 Slim Disc Edition — New and Used sell as separate products under this group",
      },
      { upsert: true, new: true }
    );

    // 3. Sample Products — New and Used are separate records with separate SKU, barcode, and price
    const sampleProducts = [
      {
        name: "DualSense White - New",
        category: accessories._id,
        productGroup: dualSenseGroup._id,
        condition: "New",
        model: "CFI-ZCT1W",
        sku: "SONY-DS-WHT-NEW",
        barcode: "711719542152",
        costPrice: 55,
        sellingPrice: 70,
        minSellingPrice: 65,
        description: "Standard DualSense Controller in White color",
        images: ["https://images.unsplash.com/photo-1606813907291-d86efa9b94db?auto=format&fit=crop&w=600&q=80"],
        active: true,
      },
      {
        name: "DualSense Midnight Black - New",
        category: accessories._id,
        productGroup: dualSenseGroup._id,
        condition: "New",
        model: "CFI-ZCT1B",
        sku: "SONY-DS-BLK-NEW",
        barcode: "711719542169",
        costPrice: 55,
        sellingPrice: 70,
        minSellingPrice: 65,
        description: "DualSense Controller in Midnight Black finish",
        images: ["https://images.unsplash.com/photo-1606813907291-d86efa9b94db?auto=format&fit=crop&w=600&q=80"],
        active: true,
      },
      {
        name: "DualSense Cosmic Red - New",
        category: accessories._id,
        productGroup: dualSenseGroup._id,
        condition: "New",
        model: "CFI-ZCT1R",
        sku: "SONY-DS-RED-NEW",
        barcode: "711719542176",
        costPrice: 58,
        sellingPrice: 75,
        minSellingPrice: 68,
        description: "DualSense Controller in Cosmic Red color",
        images: ["https://images.unsplash.com/photo-1606813907291-d86efa9b94db?auto=format&fit=crop&w=600&q=80"],
        active: true,
      },
      {
        name: "PlayStation 5 Slim Digital Edition - New",
        category: consoles._id,
        productGroup: ps5ConsoleGroup._id,
        condition: "New",
        model: "CFI-2000B01",
        sku: "SONY-PS5-SLIM-DIG-NEW",
        barcode: "711719542190",
        costPrice: 400,
        sellingPrice: 450,
        minSellingPrice: 430,
        description: "PS5 Slim Digital Edition Console (New)",
        images: ["https://images.unsplash.com/photo-1606813907291-d86efa9b94db?auto=format&fit=crop&w=600&q=80"],
        active: true,
      },
      {
        name: "PS5 Slim Disc Edition - New",
        category: consoles._id,
        productGroup: ps5SlimDiscGroup._id,
        condition: "New",
        model: "CFI-2015A01",
        sku: "SONY-PS5-SLIM-DISC-NEW",
        barcode: "711719542201",
        costPrice: 420,
        sellingPrice: 499,
        minSellingPrice: 470,
        description: "PS5 Slim Disc Edition Console (New) — separate product, SKU, barcode, and stock",
        images: ["https://images.unsplash.com/photo-1606813907291-d86efa9b94db?auto=format&fit=crop&w=600&q=80"],
        active: true,
        serialTracking: true,
      },
      {
        name: "PS5 Slim Disc Edition - Used",
        category: consoles._id,
        productGroup: ps5SlimDiscGroup._id,
        condition: "Used",
        model: "CFI-2015A01",
        sku: "SONY-PS5-SLIM-DISC-USED",
        barcode: "711719542218",
        costPrice: 280,
        sellingPrice: 349,
        minSellingPrice: 320,
        description: "PS5 Slim Disc Edition Console (Used) — separate product, SKU, barcode, and stock; same Product Group as New",
        images: ["https://images.unsplash.com/photo-1606813907291-d86efa9b94db?auto=format&fit=crop&w=600&q=80"],
        active: true,
        serialTracking: true,
      },
    ];

    const seeded = [];
    for (const p of sampleProducts) {
      const prod = await Product.findOneAndUpdate(
        { sku: p.sku },
        { ...p, isDeleted: false },
        { upsert: true, new: true }
      );
      seeded.push(prod);
    }

    return NextResponse.json({
      success: true,
      message: "Development seed executed successfully",
      data: {
        categories: [accessories.name, consoles.name],
        productGroups: [dualSenseGroup.name, ps5ConsoleGroup.name, ps5SlimDiscGroup.name],
        productsCount: seeded.length,
        usersCount: seededUsers.length,
        locations: seededLocations,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to seed data" },
      { status: 500 }
    );
  }
}
