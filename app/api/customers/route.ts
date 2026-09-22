import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Customer } from "@/models/Customer";
import { verifyRole } from "@/lib/auth/rbac";

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Salesman", "Branch"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";

    const query: any = { active: true };
    if (search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [{ name: searchRegex }, { phone: searchRegex }, { email: searchRegex }];
    }

    const customers = await Customer.find(query).sort({ name: 1 }).limit(50).lean();
    return NextResponse.json({ success: true, data: customers });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch customers." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Salesman", "Branch"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const { name, phone, email, address, notes } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ success: false, error: "Customer Name is required." }, { status: 400 });
    }
    if (!phone || !phone.trim()) {
      return NextResponse.json({ success: false, error: "Customer Phone is required." }, { status: 400 });
    }

    // Check existing by phone
    const existing = await Customer.findOne({ phone: phone.trim() });
    if (existing) {
      return NextResponse.json({ success: true, message: "Customer already exists.", data: existing });
    }

    const customer = new Customer({
      name: name.trim(),
      phone: phone.trim(),
      email: email?.trim(),
      address: address?.trim(),
      notes: notes?.trim(),
    });

    await customer.save();
    return NextResponse.json({ success: true, message: "Customer created successfully.", data: customer });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create customer." },
      { status: 500 }
    );
  }
}
