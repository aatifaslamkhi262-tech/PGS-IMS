import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Product } from "@/models/Product";
import { Location } from "@/models/Location";
import "@/models/Category"; // Ensure Category model is registered for populate
import mongoose from "mongoose";

export async function GET(req: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const category = searchParams.get("category") || "";
    const brand = searchParams.get("brand") || "";
    const condition = searchParams.get("condition") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "24", 10)));
    const skip = (page - 1) * limit;

    // 1. Identify Central Warehouse Location
    let warehouseLocation = await Location.findOne({ type: "Warehouse", active: true }).lean();
    if (!warehouseLocation) {
      warehouseLocation = await Location.findOne({ active: true }).lean();
    }

    // 2. Build Base Match Query
    const matchQuery: any = {
      isDeleted: { $ne: true },
      active: { $ne: false },
    };

    if (search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      matchQuery.$or = [
        { name: searchRegex },
        { sku: searchRegex },
        { barcode: searchRegex },
        { brand: searchRegex },
        { model: searchRegex },
      ];
    }

    if (category) {
      matchQuery.category = mongoose.Types.ObjectId.isValid(category)
        ? new mongoose.Types.ObjectId(category)
        : category;
    }

    if (brand) {
      matchQuery.brand = new RegExp(brand.trim(), "i");
    }

    if (condition) {
      matchQuery.condition = condition;
    }

    // 3. Build Aggregation Pipeline
    const warehouseLocationId = warehouseLocation ? warehouseLocation._id : null;

    const pipeline: any[] = [{ $match: matchQuery }];

    if (warehouseLocationId) {
      const invMatch: any[] = [
        { $eq: ["$product", "$$productId"] },
        { $eq: ["$location", warehouseLocationId] },
      ];
      if (condition) {
        invMatch.push({ $eq: ["$condition", condition] });
      }

      pipeline.push({
        $lookup: {
          from: "inventories",
          let: { productId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $and: invMatch },
              },
            },
            {
              $project: {
                availableQty: {
                  $max: [
                    0,
                    {
                      $subtract: [
                        { $ifNull: ["$quantity", 0] },
                        { $ifNull: ["$reservedQuantity", 0] },
                      ],
                    },
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                totalStock: { $sum: "$availableQty" },
              },
            },
          ],
          as: "invData",
        },
      });

      pipeline.push({
        $addFields: {
          warehouseStock: {
            $ifNull: [{ $arrayElemAt: ["$invData.totalStock", 0] }, 0],
          },
          inStock: {
            $gt: [{ $ifNull: [{ $arrayElemAt: ["$invData.totalStock", 0] }, 0] }, 0],
          },
        },
      });
    } else {
      pipeline.push({
        $addFields: {
          warehouseStock: 0,
          inStock: false,
        },
      });
    }

    // 4. Facet Stage: Primary sort by stock status (inStock: true first), then latest created date BEFORE pagination
    pipeline.push({
      $facet: {
        metadata: [{ $count: "total" }],
        data: [
          { $sort: { inStock: -1, createdAt: -1 } },
          { $skip: skip },
          { $limit: limit },
          {
            $lookup: {
              from: "categories",
              localField: "category",
              foreignField: "_id",
              as: "categoryDoc",
            },
          },
          {
            $unwind: { path: "$categoryDoc", preserveNullAndEmptyArrays: true },
          },
        ],
      },
    });

    const aggregateResult = await Product.aggregate(pipeline);
    const resultFacet = aggregateResult[0] || { metadata: [], data: [] };
    const total = resultFacet.metadata[0] ? resultFacet.metadata[0].total : 0;
    const products = resultFacet.data || [];

    const formattedProducts = products.map((p: any) => {
      const categoryObj = p.categoryDoc
        ? { _id: p.categoryDoc._id, name: p.categoryDoc.name, slug: p.categoryDoc.slug }
        : p.category;

      return {
        _id: p._id,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        category: categoryObj,
        brand: p.brand || "",
        model: p.model || "",
        color: p.color || "Unspecified",
        condition: p.condition || "New",
        sellingPrice: p.sellingPrice || 0,
        minSellingPrice: p.minSellingPrice || 0,
        images: p.images || [],
        description: p.description || "",
        serialTracking: Boolean(p.serialTracking),
        warehouseStock: p.warehouseStock || 0,
        inStock: Boolean(p.inStock),
      };
    });

    return NextResponse.json({
      success: true,
      data: formattedProducts,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch public products." },
      { status: 500 }
    );
  }
}
