import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { HRSettings } from "@/models/HRSettings";
import { verifyRole } from "@/lib/auth/rbac";
import fs from "fs";
import path from "path";

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "HR", "Warehouse"]);
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    const setting = await HRSettings.findOne({ key: "HR_CARD_SETTINGS" }).lean();
    let signatureDataUrl = setting?.signatureDataUrl || "";
    const signatoryTitle = setting?.signatoryTitle || "AUTHORIZED SIGN";

    if (!signatureDataUrl) {
      const fallbackFile = path.resolve("public/card/admin-signature.png");
      if (fs.existsSync(fallbackFile)) {
        const b64 = fs.readFileSync(fallbackFile).toString("base64");
        signatureDataUrl = `data:image/png;base64,${b64}`;
      }
    }

    return NextResponse.json({
      success: true,
      signatureDataUrl,
      signatoryTitle,
      updatedAt: setting?.updatedAt || null,
      updatedBy: setting?.updatedBy || null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load signature" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "HR"]);
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error || "Only Admin and HR can update signature" },
        { status: auth.status }
      );
    }

    const body = await req.json();
    const { signatureDataUrl, signatoryTitle } = body;

    if (!signatureDataUrl || typeof signatureDataUrl !== "string") {
      return NextResponse.json(
        { success: false, error: "signatureDataUrl is required" },
        { status: 400 }
      );
    }

    // Upsert into MongoDB
    const setting = await HRSettings.findOneAndUpdate(
      { key: "HR_CARD_SETTINGS" },
      {
        signatureDataUrl,
        signatoryTitle: signatoryTitle || "AUTHORIZED SIGN",
        updatedBy: auth.user?.username || "Admin",
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    // Also update public/card/admin-signature.png if possible
    try {
      const matches = signatureDataUrl.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const buffer = Buffer.from(matches[2], "base64");
        const filePath = path.resolve("public/card/admin-signature.png");
        fs.writeFileSync(filePath, buffer);
      }
    } catch (fsErr) {
      // Vercel serverless filesystem might be read-only, which is fine since MongoDB holds it
      console.warn("Could not write signature file to public directory:", fsErr);
    }

    return NextResponse.json({
      success: true,
      message: "Authorized signature updated successfully!",
      setting,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update signature" },
      { status: 500 }
    );
  }
}

