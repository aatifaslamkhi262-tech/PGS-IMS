import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Not logged in." },
        { status: 401 }
      );
    }
    return NextResponse.json({
      success: true,
      data: {
        userId: session.userId,
        username: session.username,
        role: session.role,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch session." },
      { status: 500 }
    );
  }
}
