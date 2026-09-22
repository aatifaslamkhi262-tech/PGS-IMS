import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Sale } from "@/models/Sale";

export async function GET(request: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get("locationId");

    const query: any = {
      status: { $in: ["DRAFT", "CHECKOUT", "PAYMENT_PENDING"] },
    };

    if (locationId) {
      query.location = locationId;
    }

    const sales = await Sale.find(query)
      .populate("location", "name code")
      .populate("salesman", "name code")
      .populate("customer", "name phone")
      .sort({ createdAt: -1 });

    return NextResponse.json({
      success: true,
      data: sales,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch warehouse queue." },
      { status: 500 }
    );
  }
}
