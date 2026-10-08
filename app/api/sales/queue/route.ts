 import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Sale } from "@/models/Sale";

export async function GET(request: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get("locationId");
    const statusParam = searchParams.get("status") || "PENDING";
    const search = searchParams.get("search");

    const query: any = {};

    if (statusParam === "COMPLETED") {
      query.status = "COMPLETED";
    } else if (statusParam === "CANCELLED") {
      query.status = "CANCELLED";
    } else if (statusParam === "ALL") {
      query.status = { $in: ["DRAFT", "CHECKOUT", "PAYMENT_PENDING", "COMPLETED", "CANCELLED"] };
    } else {
      query.status = { $in: ["DRAFT", "CHECKOUT", "PAYMENT_PENDING"] };
    }

    const salesmanId = searchParams.get("salesmanId");

    if (locationId && locationId !== "ALL") {
      query.location = locationId;
    }

    if (salesmanId && salesmanId !== "ALL") {
      if (salesmanId === "DIRECT") {
        query.$or = [{ salesman: { $exists: false } }, { salesman: null }];
      } else {
        query.salesman = salesmanId;
      }
    }

    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [
        { saleNumber: searchRegex },
        { customerName: searchRegex },
        { customerPhone: searchRegex },
        { "items.productName": searchRegex },
        { "items.serialNumbers": searchRegex },
      ];
    }

    const sales = await Sale.find(query)
      .populate("location", "name code")
      .populate("salesman", "name code")
      .populate("customer", "name phone")
      .sort({ createdAt: -1 })
      .limit(search ? 300 : 100);

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


