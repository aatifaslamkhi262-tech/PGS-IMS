import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Location } from "@/models/Location";
import { verifyRole } from "@/lib/auth/rbac";

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    // Allow Admin, Warehouse, Accountant, Branch, and Salesman to view locations
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Branch", "Salesman"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get("activeOnly") !== "false";

    const query: any = {};
    if (activeOnly) {
      query.active = true;
    }

    const locations = await Location.find(query).sort({ name: 1 }).lean();

    return NextResponse.json({ success: true, data: locations });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch locations." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    // Only Admin and Warehouse can create locations
    const auth = await verifyRole(["Admin", "Warehouse"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));
    const { name, code, type } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ success: false, error: "Location Name is required." }, { status: 400 });
    }
    if (!code || !code.trim()) {
      return NextResponse.json({ success: false, error: "Location Code is required." }, { status: 400 });
    }
    if (!type || !["Warehouse", "Branch", "Claim Godam"].includes(type)) {
      return NextResponse.json({ success: false, error: "Location Type must be Warehouse, Branch, or Claim Godam." }, { status: 400 });
    }

    const cleanCode = code.trim().toUpperCase();
    const cleanName = name.trim();

    // Check for duplicate code
    const existingCode = await Location.findOne({ code: cleanCode });
    if (existingCode) {
      return NextResponse.json({ success: false, error: `Location with Code "${cleanCode}" already exists.` }, { status: 400 });
    }

    // Check for duplicate name
    const existingName = await Location.findOne({ name: cleanName });
    if (existingName) {
      return NextResponse.json({ success: false, error: `Location with Name "${cleanName}" already exists.` }, { status: 400 });
    }

    const newLocation = await Location.create({
      name: cleanName,
      code: cleanCode,
      type,
      active: true,
    });

    return NextResponse.json({ success: true, data: newLocation });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create location." },
      { status: 500 }
    );
  }
}
