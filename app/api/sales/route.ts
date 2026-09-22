import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { Sale } from "@/models/Sale";
import { Invoice } from "@/models/Invoice";
import { User } from "@/models/User";
import { createSaleInput, completeSale } from "@/lib/salesEngine";
import { verifyRole } from "@/lib/auth/rbac";
import { lockIdempotencyKey, completeIdempotencyKey, failIdempotencyKey } from "@/lib/idempotencyEngine";

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Salesman", "Branch"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const salesmanId = searchParams.get("salesmanId");
    const locationId = searchParams.get("locationId");
    const search = searchParams.get("search");

    const query: any = {};
    if (status && status !== "ALL") {
      query.status = status;
    }
    if (salesmanId) {
      query.salesman = salesmanId;
    }
    if (locationId) {
      query.location = locationId;
    }

    if (search && search.trim()) {
      const cleanTerm = search.trim();
      const escaped = cleanTerm.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
      const searchRegex = new RegExp(escaped, "i");

      const matchingInvoices = await Invoice.find({ invoiceNumber: searchRegex })
        .select("sale invoiceNumber")
        .lean();
      const invoiceSaleIds = matchingInvoices.map((inv: any) => inv.sale);

      const serialMatchingSales = await Sale.find({ "items.serialNumbers": searchRegex })
        .select("_id")
        .lean();
      const serialSaleIds = serialMatchingSales.map((s: any) => s._id);

      let hexMatchedSaleIds: any[] = [];
      const hexSuffix = cleanTerm.replace(/^INV-/i, "").trim().toLowerCase();
      if (hexSuffix.length >= 4) {
        const allSales = await Sale.find({}).select("_id").lean();
        hexMatchedSaleIds = allSales
          .filter((s: any) => s._id.toString().toLowerCase().endsWith(hexSuffix))
          .map((s: any) => s._id);
      }

      const matchingIds = [...invoiceSaleIds, ...serialSaleIds, ...hexMatchedSaleIds];
      if (Types.ObjectId.isValid(cleanTerm)) {
        matchingIds.push(new Types.ObjectId(cleanTerm));
      }

      const searchOr: any[] = [
        { saleNumber: searchRegex },
        { customerName: searchRegex },
        { customerPhone: searchRegex },
        { salesmanName: searchRegex },
      ];

      if (matchingIds.length > 0) {
        searchOr.push({ _id: { $in: matchingIds } });
      }

      query.$or = searchOr;
    }

    const sales = await Sale.find(query)
      .populate("location", "name")
      .populate("salesman", "name username")
      .populate("customer", "name phone")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const saleIds = sales.map((s: any) => s._id);
    const invoices = await Invoice.find({ sale: { $in: saleIds } }).lean();
    const invoiceMap = new Map(invoices.map((inv: any) => [inv.sale.toString(), inv.invoiceNumber]));

    const salesWithInvoice = sales.map((s: any) => ({
      ...s,
      invoiceNumber:
        invoiceMap.get(s._id.toString()) || `INV-${s._id.toString().slice(-6).toUpperCase()}`,
    }));

    return NextResponse.json({ success: true, data: salesWithInvoice });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch sales." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  let idempotencyKeyHeader = "";
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Salesman", "Branch"]);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    idempotencyKeyHeader = req.headers.get("x-idempotency-key") || body.idempotencyKey || "";

    if (idempotencyKeyHeader) {
      const lockRes = await lockIdempotencyKey(idempotencyKeyHeader, body, "/api/sales");
      if (lockRes.isDuplicate) {
        return NextResponse.json(
          lockRes.responseBody || { success: false, error: lockRes.error },
          { status: lockRes.statusCode || 409 }
        );
      }
    }

    const {
      creationMode,
      saleSource,
      locationId,
      salesmanId,
      salesmanName,
      customerId,
      customerName,
      customerPhone,
      items,
      discountAmount,
      deliveryCharges,
      notes,
      directComplete,
      paymentAllocations,
    } = body;

    if (!locationId) {
      if (idempotencyKeyHeader) await failIdempotencyKey(idempotencyKeyHeader);
      return NextResponse.json({ success: false, error: "Location ID is required." }, { status: 400 });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      if (idempotencyKeyHeader) await failIdempotencyKey(idempotencyKeyHeader);
      return NextResponse.json({ success: false, error: "Sale must contain at least 1 item." }, { status: 400 });
    }

    const sId = salesmanId || (auth.user.role === "Salesman" ? (auth.user as any)._id?.toString() : undefined);
    let sName = salesmanName || (auth.user.role === "Salesman" ? (auth.user as any).name : undefined);

    if (sId && !sName) {
      const salesmanDoc = await User.findById(sId).lean();
      if (salesmanDoc) {
        sName = (salesmanDoc as any).name;
      }
    }

    const source = saleSource || (sId ? "SALESMAN" : "DIRECT_COUNTER");
    const mode = creationMode || (auth.user.role === "Salesman" ? "SALESMAN_CHECKOUT" : "DIRECT_COUNTER");

    const createResult = await createSaleInput({
      creationMode: mode,
      saleSource: source,
      locationId,
      salesmanId: sId,
      salesmanName: sName,
      customerId,
      customerName,
      customerPhone,
      items,
      discountAmount,
      deliveryCharges,
      notes,
      createdBy: auth.user.username,
    });

    if (createResult.isDuplicate) {
      const respData = {
        success: true,
        message: "Opened existing pending sale.",
        isDuplicate: true,
        data: createResult.sale,
      };
      if (idempotencyKeyHeader) await completeIdempotencyKey(idempotencyKeyHeader, 200, respData);
      return NextResponse.json(respData);
    }

    if (directComplete && paymentAllocations && Array.isArray(paymentAllocations)) {
      const completeResult = await completeSale({
        saleId: createResult.sale._id.toString(),
        completedBy: auth.user.username,
        paymentAllocations,
        notes,
      });

      const respData = {
        success: true,
        message: "Sale completed successfully.",
        data: completeResult.sale,
        invoice: completeResult.invoice,
      };
      if (idempotencyKeyHeader) await completeIdempotencyKey(idempotencyKeyHeader, 200, respData);
      return NextResponse.json(respData);
    }

    const respData = {
      success: true,
      message: mode === "SALESMAN_CHECKOUT"
        ? "Sale checked out by salesman and queued for warehouse billing."
        : "Sale created successfully.",
      data: createResult.sale,
    };
    if (idempotencyKeyHeader) await completeIdempotencyKey(idempotencyKeyHeader, 200, respData);
    return NextResponse.json(respData);
  } catch (error: any) {
    if (idempotencyKeyHeader) await failIdempotencyKey(idempotencyKeyHeader);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process sale creation." },
      { status: 500 }
    );
  }
}
