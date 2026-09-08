import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { User } from "@/models/User";
import { hashPassword } from "@/lib/auth/password";
import { verifyRole } from "@/lib/auth/rbac";

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    // Admin and Warehouse managers can view & manage user accounts
    const auth = await verifyRole(["Admin", "Warehouse"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const role = searchParams.get("role") || "";

    const query: any = {};
    if (search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [{ username: searchRegex }, { name: searchRegex }];
    }
    if (role) {
      query.role = role;
    }

    const users = await User.find(query)
      .select("-passwordHash")
      .populate("assignedLocation", "name code type")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ success: true, data: users });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch users." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    // Admin and Warehouse managers can create user accounts for staff/salesmen
    const auth = await verifyRole(["Admin", "Warehouse"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const { name, username, password, role, assignedLocation, active } = body;

    if (!username || !password || !role) {
      return NextResponse.json(
        { success: false, error: "Username, password, and role are required." },
        { status: 400 }
      );
    }

    const cleanUsername = username.trim().toLowerCase();

    // Check if username already exists
    const existing = await User.findOne({ username: cleanUsername });
    if (existing) {
      return NextResponse.json(
        { success: false, error: `Username '${cleanUsername}' is already taken.` },
        { status: 400 }
      );
    }

    const passwordHash = hashPassword(password);

    const newUser = new User({
      name: name ? name.trim() : cleanUsername,
      username: cleanUsername,
      passwordHash,
      role,
      assignedLocation: assignedLocation || undefined,
      active: active !== undefined ? active : true,
    });

    await newUser.save();

    const created = await User.findById(newUser._id)
      .select("-passwordHash")
      .populate("assignedLocation", "name code type");

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create user account." },
      { status: 500 }
    );
  }
}
