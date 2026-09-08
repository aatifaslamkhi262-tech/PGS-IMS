import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { User } from "@/models/User";
import { hashPassword } from "@/lib/auth/password";
import { verifyRole } from "@/lib/auth/rbac";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const userToUpdate = await User.findById(id);
    if (!userToUpdate) {
      return NextResponse.json({ success: false, error: "User not found." }, { status: 404 });
    }

    const body = await req.json();
    const { name, role, assignedLocation, active, newPassword } = body;

    if (name !== undefined) userToUpdate.name = name.trim();
    if (role !== undefined) userToUpdate.role = role;
    if (assignedLocation !== undefined) userToUpdate.assignedLocation = assignedLocation || undefined;
    if (active !== undefined) userToUpdate.active = active;

    if (newPassword && newPassword.trim()) {
      userToUpdate.passwordHash = hashPassword(newPassword.trim());
    }

    await userToUpdate.save();

    const updated = await User.findById(userToUpdate._id)
      .select("-passwordHash")
      .populate("assignedLocation", "name code type");

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update user." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const user = await User.findById(id);
    if (!user) {
      return NextResponse.json({ success: false, error: "User not found." }, { status: 404 });
    }

    user.active = !user.active;
    await user.save();

    return NextResponse.json({
      success: true,
      message: `User status set to ${user.active ? "Active" : "Inactive"}.`,
      data: { active: user.active },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to modify user status." },
      { status: 500 }
    );
  }
}
