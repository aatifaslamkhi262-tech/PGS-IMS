import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Supplier } from "@/models/Supplier";
import { verifyRole } from "@/lib/auth/rbac";

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    // Allow Admin, Warehouse, Accountant, and Branch to view
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Branch"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    // Get search query from URL
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const activeOnly = searchParams.get("activeOnly") === "true";

    const query: any = {};
    if (activeOnly) {
      query.active = true;
    }
    if (search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [
        { name: searchRegex },
        { code: searchRegex },
        { contactPerson: searchRegex },
      ];
    }

    const suppliers = await Supplier.find(query).sort({ name: 1 }).lean();
    return NextResponse.json({ success: true, data: suppliers });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch suppliers." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    // Only Admin and Warehouse can create
    const auth = await verifyRole(["Admin", "Warehouse"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));
    const { name, code, contactPerson, phone, email, address, active } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ success: false, error: "Supplier Name is required." }, { status: 400 });
    }
    if (!code || !code.trim()) {
      return NextResponse.json({ success: false, error: "Supplier Code is required." }, { status: 400 });
    }

    const cleanCode = code.trim().toUpperCase();

    // Check code duplicate
    const existingCode = await Supplier.findOne({ code: cleanCode });
    if (existingCode) {
      return NextResponse.json(
        { success: false, error: `Supplier with Code "${cleanCode}" already exists.` },
        { status: 400 }
      );
    }

    // Check name duplicate
    const existingName = await Supplier.findOne({ name: name.trim() });
    if (existingName) {
      return NextResponse.json(
        { success: false, error: `Supplier with Name "${name.trim()}" already exists.` },
        { status: 400 }
      );
    }

    const supplier = await Supplier.create({
      name: name.trim(),
      code: cleanCode,
      contactPerson: contactPerson?.trim(),
      phone: phone?.trim(),
      email: email?.trim()?.toLowerCase(),
      address: address?.trim(),
      active: active !== undefined ? Boolean(active) : true,
    });

    return NextResponse.json({ success: true, data: supplier });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create supplier." },
      { status: 500 }
    );
  }
}
