import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { runColorMigration } from "@/scripts/migrate-colors";
import { verifyRole } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const result = await runColorMigration();
    return NextResponse.json({ success: true, message: "Color migration executed successfully.", data: result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Migration failed" }, { status: 500 });
  }
}
