import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { ProductGroup } from "@/models/ProductGroup";
import "@/models/Category";

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");

    const query: any = { active: true };
    if (category) query.category = category;

    const groups = await ProductGroup.find(query)
      .populate("category", "name")
      .sort({ name: 1 })
      .lean();

    return NextResponse.json({ success: true, data: groups });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch product groups" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const body = await req.json();
    if (!body.name || !body.name.trim()) {
      return NextResponse.json(
        { success: false, error: "Product Group name is required" },
        { status: 400 }
      );
    }

    const existing = await ProductGroup.findOne({
      name: new RegExp(`^${body.name.trim()}$`, "i"),
    });

    if (existing) {
      return NextResponse.json({ success: true, data: existing });
    }

    const group = await ProductGroup.create({
      name: body.name.trim(),
      category: body.category || undefined,
      description: body.description ? body.description.trim() : undefined,
    });

    const populatedGroup = await ProductGroup.findById(group._id)
      .populate("category", "name");

    return NextResponse.json({ success: true, data: populatedGroup }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create product group" },
      { status: 500 }
    );
  }
}
