import { NextRequest, NextResponse } from "next/server";
import { deleteSession } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  try {
    await deleteSession();
    return NextResponse.json({
      success: true,
      message: "Logout successful.",
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to log out." },
      { status: 500 }
    );
  }
}
