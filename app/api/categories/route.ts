import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Category } from "@/models/Category";

export async function GET() {
  try {
    await dbConnect();
    const categories = await Category.find({ active: true }).sort({ name: 1 }).lean();
    return NextResponse.json({ success: true, data: categories });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch categories" },
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
        { success: false, error: "Category name is required" },
        { status: 400 }
      );
    }

    const existing = await Category.findOne({ name: new RegExp(`^${body.name.trim()}$`, "i") });
    if (existing) {
      return NextResponse.json({ success: true, data: existing });
    }

    const category = await Category.create({
      name: body.name.trim(),
      code: body.code ? body.code.trim() : undefined,
    });

    return NextResponse.json({ success: true, data: category }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create category" },
      { status: 500 }
    );
  }
}
