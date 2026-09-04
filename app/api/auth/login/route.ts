import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { User } from "@/models/User";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const body = await req.json().catch(() => ({}));
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: "Username and password are required." },
        { status: 400 }
      );
    }

    // Auto-seed default test accounts if User collection is empty
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      const usersToSeed = [
        { username: "admin", password: "adminpassword", role: "Admin" },
        { username: "warehouse", password: "warehousepassword", role: "Warehouse" },
        { username: "accountant", password: "accountantpassword", role: "Accountant" },
        { username: "branch", password: "branchpassword", role: "Branch" },
        { username: "salesman", password: "salesmanpassword", role: "Salesman" },
      ];
      for (const u of usersToSeed) {
        const passwordHash = hashPassword(u.password);
        await User.create({
          username: u.username,
          passwordHash,
          role: u.role as any,
          active: true,
        });
      }
    }

    // Find user (lowercase match)
    const user = await User.findOne({ username: username.toLowerCase().trim() });
    if (!user || !user.active) {
      return NextResponse.json(
        { success: false, error: "Invalid username or password." },
        { status: 401 }
      );
    }

    // Verify PBKDF2 hash
    const isMatch = verifyPassword(password, user.passwordHash);
    if (!isMatch) {
      return NextResponse.json(
        { success: false, error: "Invalid username or password." },
        { status: 401 }
      );
    }

    // Establish cryptographic HTTP-only cookie
    const session = await createSession(user._id.toString(), user.username, user.role);

    return NextResponse.json({
      success: true,
      message: "Login successful.",
      data: {
        userId: session.userId,
        username: session.username,
        role: session.role,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to log in." },
      { status: 500 }
    );
  }
}
