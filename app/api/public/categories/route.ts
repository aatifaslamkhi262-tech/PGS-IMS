import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Category } from "@/models/Category";

export async function GET() {
  try {
    await dbConnect();
    const categories = await Category.find({}).sort({ name: 1 }).lean();

    return NextResponse.json({
      success: true,
      data: categories,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch public categories." },
      { status: 500 }
    );
  }
}
