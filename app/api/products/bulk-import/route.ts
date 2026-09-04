import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { verifyRole } from "@/lib/auth/rbac";
import {
  parseExcelBuffer,
  validateExcelRows,
  executeBulkImport,
  generateReportExcelBuffer,
} from "@/lib/productBulkImport";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    // Strict server-side RBAC: Admin & Warehouse only
    const auth = await verifyRole(["Admin", "Warehouse"]);
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error || "Access Denied. Admin or Warehouse role required." },
        { status: auth.status }
      );
    }

    const contentType = req.headers.get("content-type") || "";

    // 1. Multipart FormData Upload (Preview Mode from File)
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      const action = formData.get("action") as string || "preview";

      if (!file) {
        return NextResponse.json(
          { success: false, error: "No Excel file uploaded." },
          { status: 400 }
        );
      }

      const fileName = file.name.toLowerCase();
      if (!fileName.endsWith(".xlsx") && !fileName.endsWith(".xls")) {
        return NextResponse.json(
          { success: false, error: "Only .xlsx and .xls Excel files are allowed." },
          { status: 400 }
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const rawRows = parseExcelBuffer(buffer);
      if (rawRows.length === 0) {
        return NextResponse.json(
          { success: false, error: "The uploaded Excel file contains no data rows." },
          { status: 400 }
        );
      }

      const validatedRows = await validateExcelRows(rawRows);

      const totalRows = validatedRows.length;
      const readyCount = validatedRows.filter((r) => r.status === "Ready").length;
      const duplicateCount = validatedRows.filter((r) => r.status === "Duplicate").length;
      const invalidCount = validatedRows.filter((r) => r.status === "Invalid").length;

      return NextResponse.json({
        success: true,
        summary: {
          totalRows,
          readyCount,
          duplicateCount,
          invalidCount,
        },
        rows: validatedRows,
      });
    }

    // 2. JSON Body Execution / Direct API Execution
    const body = await req.json();
    const action = body.action || "execute";

    if (action === "export-report") {
      const reports = body.reports || [];
      const buffer = generateReportExcelBuffer(reports);
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": 'attachment; filename="Import_Report.xlsx"',
        },
      });
    }

    if (action === "execute") {
      const validRows = body.rows;
      if (!validRows || !Array.isArray(validRows) || validRows.length === 0) {
        return NextResponse.json(
          { success: false, error: "No valid rows provided for import." },
          { status: 400 }
        );
      }

      const result = await executeBulkImport(validRows);
      return NextResponse.json({
        success: true,
        message: "Bulk import execution completed.",
        data: result,
      });
    }

    return NextResponse.json(
      { success: false, error: "Unsupported action." },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Bulk import processing failed." },
      { status: 500 }
    );
  }
}
