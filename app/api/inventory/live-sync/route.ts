import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Inventory } from "@/models/Inventory";
import { Product } from "@/models/Product";
import { Location } from "@/models/Location";
import { SerialNumber } from "@/models/SerialNumber";
import { InventoryMovement } from "@/models/InventoryMovement";
import { verifyRole } from "@/lib/auth/rbac";
import { getInventoryCostMap } from "@/lib/pricing";

// Helper to ensure the Two-Way "Damage & Claim" location exists in MongoDB
async function ensureDamageClaimLocation() {
  let claimLoc = await Location.findOne({
    $or: [
      { type: "Claim Godam" },
      { code: "DMG-CLM" },
      { name: { $regex: /^damage\s*&\s*claim$/i } },
    ],
  }).lean();

  if (!claimLoc) {
    const created = await Location.create({
      name: "Damage & Claim",
      code: "DMG-CLM",
      type: "Claim Godam",
      active: true,
    });
    claimLoc = created.toObject();
  }
  return claimLoc as any;
}

// Normalize strings like "G 14", "G-14", "g14" -> "g14" for rock-solid matching
function normalizeLocKey(str: string): string {
  return (str || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Match SerialNumber.location (which may be stored as Location Name, Code, or _id) to a branch._id
function resolveSerialBranchId(
  rawLocation: string | undefined,
  status: string | undefined,
  branches: Array<{ _id: string; name: string; code: string; type: string }>,
  claimLoc: { _id: any; name: string; code: string },
  systemBranchQty?: Record<string, number>
): string {
  if (status === "Claim" || status === "Damaged") {
    return "DAMAGE_CLAIM";
  }

  const raw = (rawLocation || "").trim();
  const norm = normalizeLocKey(raw);
  const claimIdStr = claimLoc._id.toString();

  if (
    raw === claimIdStr ||
    norm === normalizeLocKey(claimLoc.name) ||
    norm === normalizeLocKey(claimLoc.code) ||
    norm.includes("claim") ||
    norm.includes("damage")
  ) {
    return "DAMAGE_CLAIM";
  }

  if (raw) {
    // 1. Exact ID, Name, or Code match
    for (const b of branches) {
      if (
        raw === b._id ||
        raw.toLowerCase() === b.name.trim().toLowerCase() ||
        raw.toLowerCase() === b.code.trim().toLowerCase()
      ) {
        return b._id;
      }
    }

    // 2. Normalized alphanumeric match (e.g. "G 14" == "G14" == "G-14")
    for (const b of branches) {
      if (
        norm &&
        (norm === normalizeLocKey(b.name) || norm === normalizeLocKey(b.code))
      ) {
        return b._id;
      }
    }

    // 3. Warehouse / partial match (e.g. "Warehouse" matching "G-17-WAREHOUSE")
    if (norm.includes("warehouse") || norm === "wh") {
      const whBranch = branches.find(
        (b) =>
          b.type === "Warehouse" ||
          normalizeLocKey(b.name).includes("warehouse") ||
          normalizeLocKey(b.code).includes("warehouse")
      );
      if (whBranch) return whBranch._id;
    }

    for (const b of branches) {
      const bNameNorm = normalizeLocKey(b.name);
      const bCodeNorm = normalizeLocKey(b.code);
      if (
        norm &&
        ((bNameNorm && (bNameNorm.includes(norm) || norm.includes(bNameNorm))) ||
          (bCodeNorm && (bCodeNorm.includes(norm) || norm.includes(bCodeNorm))))
      ) {
        return b._id;
      }
    }
  }

  // 4. Fallback if serial has empty/legacy location: place in the first branch that has DB stock > 0, or first branch
  if (systemBranchQty) {
    const branchWithStock = branches.find((b) => (systemBranchQty[b._id] || 0) > 0);
    if (branchWithStock) return branchWithStock._id;
  }

  return branches[0]?._id || "";
}

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Branch", "Salesman"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const search = (searchParams.get("search") || "").trim();
    const tracking = searchParams.get("tracking") || "ALL"; // ALL | SERIAL | NON_SERIAL
    const category = (searchParams.get("category") || "").trim();
    const inStockOnly = searchParams.get("inStockOnly") === "true";
    const onlyDamageClaim = searchParams.get("onlyDamageClaim") === "true";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(250, Math.max(10, parseInt(searchParams.get("limit") || "100", 10)));

    const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // 1. Ensure Damage & Claim pool location exists, and load all active locations
    const claimLocation = await ensureDamageClaimLocation();
    const claimLocId = claimLocation._id.toString();

    const rawLocations = await Location.find({ active: true })
      .select("name code type")
      .lean();

    const branches = rawLocations
      .filter((l: any) => l._id.toString() !== claimLocId && l.type !== "Claim Godam")
      .map((l: any) => ({
        _id: l._id.toString(),
        name: l.name,
        code: l.code || l.name.slice(0, 4).toUpperCase(),
        type: l.type || "Branch",
      }))
      .sort((a, b) => {
        const aIsG14 =
          a.name.toLowerCase().includes("14") || a.code.toLowerCase().includes("14") ? -1 : 0;
        const bIsG14 =
          b.name.toLowerCase().includes("14") || b.code.toLowerCase().includes("14") ? -1 : 0;
        return aIsG14 - bIsG14;
      });

    // 2. If searching by serial number, find matching product IDs first
    let serialMatchedProductIds: string[] = [];
    if (search) {
      const regex = new RegExp(escapeRegex(search), "i");
      const serialDocs = await SerialNumber.find({
        serialNumber: regex,
        status: { $in: ["Available", "Claim", "Damaged"] },
      })
        .select("product")
        .limit(100)
        .lean();
      serialMatchedProductIds = serialDocs.map((s: any) => s.product.toString());
    }

    // 3. If filtering by only items currently in Damage & Claim
    let damageClaimProductIds: string[] | null = null;
    if (onlyDamageClaim) {
      const [invInClaim, serialsInClaim] = await Promise.all([
        Inventory.find({ location: claimLocation._id, quantity: { $gt: 0 } })
          .select("product")
          .lean(),
        SerialNumber.find({
          $or: [
            { location: { $in: [claimLocId, claimLocation.name, claimLocation.code] }, status: { $in: ["Available", "Claim", "Damaged"] } },
            { status: { $in: ["Claim", "Damaged"] } },
          ],
        })
          .select("product")
          .lean(),
      ]);
      const idSet = new Set<string>();
      for (const i of invInClaim) idSet.add(i.product.toString());
      for (const s of serialsInClaim) idSet.add(s.product.toString());
      damageClaimProductIds = Array.from(idSet);
    }

    // 4. Build Product query
    const prodQuery: any = { isDeleted: false };
    if (tracking === "SERIAL") {
      prodQuery.serialTracking = true;
    } else if (tracking === "NON_SERIAL") {
      prodQuery.serialTracking = false;
    }
    if (category) {
      prodQuery.category = category;
    }

    if (damageClaimProductIds !== null) {
      prodQuery._id = { $in: damageClaimProductIds };
    } else if (inStockOnly) {
      const [inStockInvIds, inStockSerialIds] = await Promise.all([
        Inventory.distinct("product", { quantity: { $gt: 0 } }),
        SerialNumber.distinct("product", { status: { $in: ["Available", "Claim", "Damaged"] } }),
      ]);
      const activeSet = new Set<string>();
      for (const id of inStockInvIds) if (id) activeSet.add(id.toString());
      for (const id of inStockSerialIds) if (id) activeSet.add(id.toString());
      prodQuery._id = { $in: Array.from(activeSet) };
    }

    if (search) {
      const regex = new RegExp(escapeRegex(search), "i");
      prodQuery.$or = [
        { name: regex },
        { sku: regex },
        { barcode: regex },
        { modelNumber: regex },
        { model: regex },
        { brand: regex },
      ];
      if (serialMatchedProductIds.length > 0) {
        prodQuery.$or.push({ _id: { $in: serialMatchedProductIds } });
      }
    }

    const totalProducts = await Product.countDocuments(prodQuery);
    const totalPages = Math.ceil(totalProducts / limit) || 1;
    const validPage = Math.min(page, totalPages);
    const skip = (validPage - 1) * limit;

    const products = await Product.find(prodQuery)
      .select(
        "name sku barcode brand model modelNumber color condition serialTracking costPrice sellingPrice"
      )
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const productIds = products.map((p: any) => p._id.toString());

    if (productIds.length === 0) {
      return NextResponse.json({
        success: true,
        damageClaimLocationId: claimLocId,
        branches,
        rows: [],
        pagination: { total: 0, page: 1, limit, totalPages: 1 },
      });
    }

    // 5. Bulk fetch real Inventory records, real Weighted Cost Map, and real SerialNumbers
    const [inventoryDocs, costMap, serialDocs] = await Promise.all([
      Inventory.find({ product: { $in: productIds } })
        .select("product location condition quantity averageCost")
        .lean(),
      getInventoryCostMap(productIds),
      SerialNumber.find({
        product: { $in: productIds },
        status: { $in: ["Available", "Claim", "Damaged"] },
      })
        .select("serialNumber product location condition status")
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    const invByProduct: Record<string, any[]> = {};
    for (const inv of inventoryDocs) {
      const pid = inv.product.toString();
      if (!invByProduct[pid]) invByProduct[pid] = [];
      invByProduct[pid].push(inv);
    }

    const serialsByProduct: Record<string, any[]> = {};
    for (const s of serialDocs) {
      const pid = s.product.toString();
      if (!serialsByProduct[pid]) serialsByProduct[pid] = [];
      serialsByProduct[pid].push(s);
    }

    // 6. Build rows with smart SerialNumber.location -> Branch ID resolution
    const rows = products.map((prod: any) => {
      const pid = prod._id.toString();
      const cond = prod.condition || "New";
      const invLines = invByProduct[pid] || [];

      const systemBranchQty: Record<string, number> = {};
      for (const b of branches) {
        systemBranchQty[b._id] = 0;
      }

      let dbDamageClaimQty = 0;
      let fallbackInvAvgCost = 0;

      for (const line of invLines) {
        const locId = line.location?.toString();
        if (locId === claimLocId) {
          dbDamageClaimQty += Number(line.quantity || 0);
        } else if (locId && systemBranchQty[locId] !== undefined) {
          systemBranchQty[locId] += Number(line.quantity || 0);
        }
        if (Number(line.averageCost) > 1 && fallbackInvAvgCost === 0) {
          fallbackInvAvgCost = Number(line.averageCost);
        }
      }

      const realAvgCost =
        costMap[`${pid}:${cond}`] ??
        costMap[pid] ??
        (fallbackInvAvgCost > 0 ? fallbackInvAvgCost : Number(prod.costPrice || 0));

      const prodSerials = (serialsByProduct[pid] || []).map((s: any) => {
        const resolvedLocId = resolveSerialBranchId(
          s.location?.toString(),
          s.status,
          branches,
          claimLocation,
          systemBranchQty
        );
        const isInClaim = resolvedLocId === "DAMAGE_CLAIM";
        return {
          serialNumber: s.serialNumber,
          originalLocationId: resolvedLocId,
          currentLocationId: resolvedLocId,
          condition: s.condition || cond,
          status: isInClaim ? "DAMAGE_CLAIM" : "UNCHECKED",
          checkedOutBranches: [],
        };
      });

      if (prod.serialTracking) {
        dbDamageClaimQty = prodSerials.filter(
          (s: any) => s.currentLocationId === "DAMAGE_CLAIM"
        ).length;
      }

      return {
        productId: pid,
        name: prod.name,
        brand: prod.brand || "",
        sku: prod.sku || "",
        barcode: prod.barcode || "",
        model: prod.modelNumber || prod.model || "",
        condition: cond,
        serialTracking: Boolean(prod.serialTracking),
        lockedAvgCost: Math.round(realAvgCost * 100) / 100,
        systemBranchQty,
        physicalBranchQty: { ...systemBranchQty },
        systemDamageClaimQty: dbDamageClaimQty,
        physicalDamageClaimQty: dbDamageClaimQty,
        serials: prodSerials,
        rowVerified: false,
      };
    });

    return NextResponse.json({
      success: true,
      damageClaimLocationId: claimLocId,
      branches,
      rows,
      pagination: {
        total: totalProducts,
        page: validPage,
        limit,
        totalPages,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load real inventory data." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Branch"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const {
      action = "SYNC_ROW", // "SYNC_ROW" | "RESTORE_FROM_DAMAGE_CLAIM"
      productId,
      condition = "New",
      lockedAvgCost = 0,
      serialTracking = false,
      snapshotBranchQty = {},
      physicalBranchQty = {},
      physicalDamageClaimQty,
      serials = [],
      targetBranchId,
      transferQty = 0,
      specificSerialNumber,
    } = body;

    if (!productId) {
      return NextResponse.json({ success: false, error: "productId is required." }, { status: 400 });
    }

    const product = await Product.findById(productId).lean();
    if (!product) {
      return NextResponse.json({ success: false, error: "Product not found." }, { status: 404 });
    }

    const claimLocation = await ensureDamageClaimLocation();
    const claimLocId = claimLocation._id.toString();

    const allLocations = await Location.find({ active: true }).select("name code type").lean();
    const locationMap = new Map<string, any>();
    const branchesList: Array<{ _id: string; name: string; code: string; type: string }> = [];

    for (const loc of allLocations) {
      const idStr = loc._id.toString();
      if (idStr !== claimLocId && (loc as any).type !== "Claim Godam") {
        locationMap.set(idStr, loc);
        branchesList.push({
          _id: idStr,
          name: (loc as any).name,
          code: (loc as any).code || (loc as any).name.slice(0, 4).toUpperCase(),
          type: (loc as any).type || "Branch",
        });
      }
    }

    const costMap = await getInventoryCostMap([productId]);
    const prodCond = (product as any).condition || condition || "New";
    const resolvedLockedCost =
      Number(lockedAvgCost) > 0
        ? Number(lockedAvgCost)
        : costMap[`${productId}:${prodCond}`] ??
          costMap[productId] ??
          Number((product as any).costPrice || 0);

    const operator = auth.user?.username || "Admin";
    const syncRef = `DMG-SYNC-${Date.now().toString().slice(-6)}`;

    const setLocationInventory = async (locId: string, newQty: number, isSerialized: boolean) => {
      const cleanQty = Math.max(0, Math.round(newQty));
      const existingInv = await Inventory.findOne({
        product: product._id,
        location: locId,
      });
      const beforeQty = existingInv ? Number(existingInv.quantity || 0) : 0;
      const finalCost =
        resolvedLockedCost > 0
          ? resolvedLockedCost
          : existingInv?.averageCost || Number((product as any).costPrice || 0);

      if (existingInv) {
        await Inventory.deleteMany({
          product: product._id,
          location: locId,
          _id: { $ne: existingInv._id },
        });
        existingInv.quantity = cleanQty;
        existingInv.averageCost = finalCost;
        existingInv.totalCostValue = Math.round(cleanQty * finalCost * 100) / 100;
        existingInv.status = cleanQty > 0 ? "In Stock" : "Out of Stock";
        await existingInv.save();
      } else if (cleanQty > 0) {
        await Inventory.create({
          product: product._id,
          location: locId,
          condition: prodCond,
          quantity: cleanQty,
          averageCost: finalCost,
          totalCostValue: Math.round(cleanQty * finalCost * 100) / 100,
          serialTracking: isSerialized,
          status: "In Stock",
        });
      }
      return { beforeQty, afterQty: cleanQty, finalCost };
    };

    // Recount all serials for this product by resolving their location string -> branch ID
    const syncAllSerializedBranchCounts = async () => {
      const allActiveSerials = await SerialNumber.find({
        product: product._id,
        status: { $in: ["Available", "Claim", "Damaged"] },
      })
        .select("serialNumber location status")
        .lean();

      const countsByBranch: Record<string, number> = {};
      for (const locId of locationMap.keys()) {
        countsByBranch[locId] = 0;
      }
      let claimCount = 0;

      for (const s of allActiveSerials) {
        const resolvedId = resolveSerialBranchId(
          (s as any).location?.toString(),
          (s as any).status,
          branchesList,
          claimLocation
        );
        if (resolvedId === "DAMAGE_CLAIM") {
          claimCount += 1;
        } else if (countsByBranch[resolvedId] !== undefined) {
          countsByBranch[resolvedId] += 1;
        }
      }

      for (const [locId, locObj] of locationMap.entries()) {
        const count = countsByBranch[locId] || 0;
        const { beforeQty, afterQty, finalCost } = await setLocationInventory(locId, count, true);
        if (beforeQty !== afterQty) {
          const delta = Math.abs(afterQty - beforeQty);
          await InventoryMovement.create({
            product: product._id,
            productName: (product as any).name,
            sku: (product as any).sku,
            quantity: delta,
            unitCost: finalCost,
            totalCost: Math.round(delta * finalCost * 100) / 100,
            sourceLocation: locObj._id,
            sourceName: locObj.name,
            destinationLocation: locObj._id,
            destinationName: locObj.name,
            type: "ADJUSTMENT",
            referenceType: "LIVE_STOCK_SYNC",
            referenceTransaction: syncRef,
            reason: `Live Serial Sync (${beforeQty} -> ${afterQty})`,
            beforeQuantity: beforeQty,
            afterQuantity: afterQty,
            performedBy: operator,
            approvedBy: operator,
            condition: prodCond,
            date: new Date(),
          });
        }
      }

      await setLocationInventory(claimLocId, claimCount, true);
    };

    const buildFreshProductState = async () => {
      const invDocs = await Inventory.find({ product: product._id }).lean();
      const updatedBranchQty: Record<string, number> = {};
      for (const locId of locationMap.keys()) {
        updatedBranchQty[locId] = 0;
      }
      let updatedClaimQty = 0;
      for (const doc of invDocs) {
        const lid = doc.location.toString();
        if (lid === claimLocId) {
          updatedClaimQty += Number(doc.quantity || 0);
        } else if (updatedBranchQty[lid] !== undefined) {
          updatedBranchQty[lid] += Number(doc.quantity || 0);
        }
      }

      const freshSerials = await SerialNumber.find({
        product: product._id,
        status: { $in: ["Available", "Claim", "Damaged"] },
      })
        .select("serialNumber location status condition")
        .sort({ createdAt: -1 })
        .lean();

      const formattedSerials = freshSerials.map((s: any) => {
        const resolvedId = resolveSerialBranchId(
          s.location?.toString(),
          s.status,
          branchesList,
          claimLocation,
          updatedBranchQty
        );
        const isInClaim = resolvedId === "DAMAGE_CLAIM";
        return {
          serialNumber: s.serialNumber,
          originalLocationId: resolvedId,
          currentLocationId: resolvedId,
          status: isInClaim ? "DAMAGE_CLAIM" : "VERIFIED",
          checkedOutBranches: [],
        };
      });

      if ((product as any).serialTracking) {
        updatedClaimQty = formattedSerials.filter(
          (s: any) => s.currentLocationId === "DAMAGE_CLAIM"
        ).length;
      }

      return {
        success: true,
        productId,
        lockedAvgCost: resolvedLockedCost,
        systemBranchQty: updatedBranchQty,
        systemDamageClaimQty: updatedClaimQty,
        serials: formattedSerials,
      };
    };

    // =========================================================================
    // ACTION 1: RESTORE PARTIAL QTY OR SPECIFIC SERIAL FROM DAMAGE & CLAIM -> BRANCH
    // =========================================================================
    if (action === "RESTORE_FROM_DAMAGE_CLAIM") {
      if (!targetBranchId || !locationMap.has(targetBranchId)) {
        return NextResponse.json(
          { success: false, error: "Please select a valid target branch." },
          { status: 400 }
        );
      }
      const targetLoc = locationMap.get(targetBranchId);

      if ((product as any).serialTracking || specificSerialNumber) {
        if (!specificSerialNumber) {
          return NextResponse.json(
            { success: false, error: "Serial number is required for serialized restore." },
            { status: 400 }
          );
        }
        // Save location as targetLoc.name so the rest of the app (Transfers, POS, Ledger) matches it
        await SerialNumber.findOneAndUpdate(
          { serialNumber: specificSerialNumber },
          {
            $set: {
              product: product._id,
              status: "Available",
              location: targetLoc.name,
              transactionReference: syncRef,
              notes: `Restored from Damage & Claim to ${targetLoc.name}`,
            },
          },
          { upsert: true }
        );

        await syncAllSerializedBranchCounts();
        return NextResponse.json(await buildFreshProductState());
      } else {
        const qtyToMove = Math.max(1, Math.round(Number(transferQty) || 0));
        const claimInv = await Inventory.findOne({
          product: product._id,
          location: claimLocId,
        });
        const currentClaimQty = claimInv ? Number(claimInv.quantity || 0) : 0;
        const actualMove = Math.min(qtyToMove, currentClaimQty);

        if (actualMove <= 0) {
          return NextResponse.json(
            { success: false, error: "Damage & Claim has 0 quantity to restore." },
            { status: 400 }
          );
        }

        const branchInv = await Inventory.findOne({
          product: product._id,
          location: targetBranchId,
        });
        const currentBranchQty = branchInv ? Number(branchInv.quantity || 0) : 0;

        await setLocationInventory(claimLocId, currentClaimQty - actualMove, false);
        const { beforeQty, afterQty, finalCost } = await setLocationInventory(
          targetBranchId,
          currentBranchQty + actualMove,
          false
        );

        await InventoryMovement.create({
          product: product._id,
          productName: (product as any).name,
          sku: (product as any).sku,
          quantity: actualMove,
          unitCost: finalCost,
          totalCost: Math.round(actualMove * finalCost * 100) / 100,
          sourceLocation: claimLocation._id,
          sourceName: "Damage & Claim",
          destinationLocation: targetLoc._id,
          destinationName: targetLoc.name,
          type: "TRANSFER",
          referenceType: "DAMAGE_CLAIM_RESTORE",
          referenceTransaction: syncRef,
          reason: `Restored ${actualMove} pcs from Damage & Claim to ${targetLoc.name} (Avg Cost Locked)`,
          beforeQuantity: beforeQty,
          afterQuantity: afterQty,
          performedBy: operator,
          approvedBy: operator,
          condition: prodCond,
          date: new Date(),
        });

        return NextResponse.json(await buildFreshProductState());
      }
    }

    // =========================================================================
    // ACTION 2: FULL ROW SYNC (SERIAL OR NON-SERIAL) WITH LIVE POS SALE PROTECTION
    // =========================================================================
    const posProtectedSerials: string[] = [];
    const posProtectedBranchSales: Record<string, number> = {};

    if (serialTracking || (product as any).serialTracking) {
      for (const s of serials) {
        const sn = (s.serialNumber || "").trim();
        if (!sn) continue;

        // Check if this serial was JUST SOLD on POS while user had screen open
        const liveSerialDoc = await SerialNumber.findOne({ serialNumber: sn })
          .select("status transactionReference")
          .lean();

        if (
          liveSerialDoc &&
          (liveSerialDoc as any).status === "Sold" &&
          s.status !== "SOLD" &&
          s.currentLocationId !== "SOLD"
        ) {
          // Protect POS Sale! Never overwrite a POS-sold serial back to Available or Claim
          posProtectedSerials.push(sn);
          continue;
        }

        if (s.status === "SOLD" || s.currentLocationId === "SOLD") {
          await SerialNumber.findOneAndUpdate(
            { serialNumber: sn },
            {
              $set: {
                status: "Sold",
                saleDate: new Date(),
                transactionReference: syncRef,
                notes: "Marked Sold via All-Branch Live Sync",
              },
            }
          );
        } else if (
          s.status === "DAMAGE_CLAIM" ||
          s.currentLocationId === "DAMAGE_CLAIM"
        ) {
          await SerialNumber.findOneAndUpdate(
            { serialNumber: sn },
            {
              $set: {
                product: product._id,
                serialNumber: sn,
                status: "Claim",
                location: claimLocation.name,
                damageDate: new Date(),
                transactionReference: syncRef,
                notes: "Moved to Damage & Claim Pool via Live Sync",
              },
            },
            { upsert: true }
          );
        } else if (s.currentLocationId && locationMap.has(s.currentLocationId)) {
          const targetLocObj = locationMap.get(s.currentLocationId);
          await SerialNumber.findOneAndUpdate(
            { serialNumber: sn },
            {
              $set: {
                product: product._id,
                serialNumber: sn,
                status: "Available",
                location: targetLocObj.name,
                transactionReference: syncRef,
              },
            },
            { upsert: true }
          );
        }
      }

      await syncAllSerializedBranchCounts();
      const freshState = await buildFreshProductState();
      return NextResponse.json({
        ...freshState,
        posProtectedSerials,
      });
    }

    // NON-SERIALIZED ROW SYNC (WITH LIVE POS SALE AUTO-DEDUCTION):
    let totalBeforeBranches = 0;
    let totalAfterBranches = 0;

    for (const [locId, locObj] of locationMap.entries()) {
      const existingInv = await Inventory.findOne({
        product: product._id,
        location: locId,
      });
      const currentDbQty = existingInv ? Number(existingInv.quantity || 0) : 0;
      const snapQty =
        snapshotBranchQty[locId] !== undefined
          ? Number(snapshotBranchQty[locId])
          : currentDbQty;

      // If DB stock dropped since screen loaded (e.g. POS sale happened while counting), auto-deduct that POS sale!
      const posSoldMeanwhile = Math.max(0, snapQty - currentDbQty);
      if (posSoldMeanwhile > 0) {
        posProtectedBranchSales[locId] = posSoldMeanwhile;
      }

      const rawUserQty =
        physicalBranchQty[locId] !== undefined
          ? Math.max(0, Math.round(Number(physicalBranchQty[locId]) || 0))
          : currentDbQty;

      const afterQty = Math.max(0, rawUserQty - posSoldMeanwhile);

      totalBeforeBranches += currentDbQty;
      totalAfterBranches += afterQty;

      const { finalCost } = await setLocationInventory(locId, afterQty, false);

      if (currentDbQty !== afterQty) {
        const delta = Math.abs(afterQty - currentDbQty);
        await InventoryMovement.create({
          product: product._id,
          productName: (product as any).name,
          sku: (product as any).sku,
          quantity: delta,
          unitCost: finalCost,
          totalCost: Math.round(delta * finalCost * 100) / 100,
          sourceLocation: locObj._id,
          sourceName: locObj.name,
          destinationLocation:
            afterQty < currentDbQty ? claimLocation._id : locObj._id,
          destinationName:
            afterQty < currentDbQty ? "Damage & Claim" : locObj.name,
          type: afterQty < currentDbQty ? "CLAIM" : "ADJUSTMENT",
          referenceType: "LIVE_STOCK_SYNC",
          referenceTransaction: syncRef,
          reason:
            afterQty < currentDbQty
              ? `Shortage ${delta} pcs moved to Damage & Claim (${currentDbQty} -> ${afterQty})`
              : `Branch Stock Adjusted (${currentDbQty} -> ${afterQty}) @ Locked Cost`,
          beforeQuantity: currentDbQty,
          afterQuantity: afterQty,
          performedBy: operator,
          approvedBy: operator,
          condition: prodCond,
          date: new Date(),
        });
      }
    }

    const existingClaimInv = await Inventory.findOne({
      product: product._id,
      location: claimLocId,
    });
    const currentClaimQty = existingClaimInv ? Number(existingClaimInv.quantity || 0) : 0;
    const netShortage = Math.max(0, totalBeforeBranches - totalAfterBranches);

    const baseClaimTarget =
      physicalDamageClaimQty !== undefined
        ? Math.max(0, Math.round(Number(physicalDamageClaimQty) || 0))
        : currentClaimQty;

    const finalClaimQty = baseClaimTarget + netShortage;
    await setLocationInventory(claimLocId, finalClaimQty, false);

    const freshState = await buildFreshProductState();
    return NextResponse.json({
      ...freshState,
      posProtectedBranchSales,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to save stock sync to database." },
      { status: 500 }
    );
  }
}
