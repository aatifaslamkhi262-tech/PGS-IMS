import { NextResponse } from "next/server";
import { generateExcelTemplateBuffer } from "@/lib/productBulkImport";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const buffer = generateExcelTemplateBuffer();
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="Product_Import_Template.xlsx"',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to generate Excel template" },
      { status: 500 }
    );
  }
}
