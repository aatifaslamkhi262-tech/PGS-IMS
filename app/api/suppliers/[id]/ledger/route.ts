import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/lib/db";
import { Supplier } from "@/models/Supplier";
import { PurchaseInvoice } from "@/models/PurchaseInvoice";
import { SupplierLedger } from "@/models/SupplierLedger";
import { verifyRole } from "@/lib/auth/rbac";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: "Invalid supplier ID." }, { status: 400 });
    }

    const [supplier, invoices, ledgerDocs] = await Promise.all([
      Supplier.findById(id).lean(),
      PurchaseInvoice.find({
        supplier: id,
        status: { $ne: "Rejected" },
      })
        .select("invoiceNumber invoiceDate createdAt total subtotal status items.name items.quantity")
        .sort({ invoiceDate: 1, createdAt: 1 })
        .lean(),
      SupplierLedger.find({ supplier: id }).sort({ date: 1, createdAt: 1 }).lean(),
    ]);

    if (!supplier) {
      return NextResponse.json({ success: false, error: "Supplier not found." }, { status: 404 });
    }

    const combinedEvents: any[] = [];

    for (const inv of invoices as any[]) {
      const itemSummary = (inv.items || [])
        .slice(0, 2)
        .map((it: any) => `${it.quantity}x ${it.name}`)
        .join(", ");
      const moreCount = (inv.items || []).length > 2 ? ` +${inv.items.length - 2} more` : "";

      combinedEvents.push({
        _id: `INV-${inv._id.toString()}`,
        invoiceId: inv._id.toString(),
        date: inv.invoiceDate || inv.createdAt,
        referenceNumber: inv.invoiceNumber,
        particulars: `${inv.invoiceNumber}${itemSummary ? ` (${itemSummary}${moreCount})` : ""}`,
        type: "BILL_IN",
        debit: Number(inv.total || inv.subtotal || 0),
        credit: 0,
        attachmentUrl: inv.attachmentUrls?.[0] || undefined,
        status: inv.status,
      });
    }

    for (const entry of ledgerDocs as any[]) {
      combinedEvents.push({
        _id: entry._id.toString(),
        date: entry.date || entry.createdAt,
        referenceNumber: entry.referenceNumber || "",
        particulars: entry.particulars,
        type: entry.type,
        debit: Number(entry.debit || 0),
        credit: Number(entry.credit || 0),
        paymentMethod: entry.paymentMethod,
        bankName: entry.bankName,
        transactionId: entry.transactionId,
        attachmentUrl: entry.attachmentUrl,
      });
    }

    combinedEvents.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    let runningBalance = 0;
    let totalDebit = 0;
    let totalCredit = 0;

    const computedRows = combinedEvents.map((ev) => {
      totalDebit += ev.debit;
      totalCredit += ev.credit;
      runningBalance += ev.debit - ev.credit;
      return {
        ...ev,
        runningBalance,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        currentOutstanding: runningBalance,
        totalDebit,
        totalCredit,
        entries: computedRows.reverse(), // Show newest at top with accurate historical running balance
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load vendor ledger." },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant"]);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: "Invalid supplier ID." }, { status: 400 });
    }

    const supplier = await Supplier.findById(id);
    if (!supplier) {
      return NextResponse.json({ success: false, error: "Supplier not found." }, { status: 404 });
    }

    const body = await req.json();
    const {
      type,
      date,
      particulars,
      referenceNumber,
      amount,
      paymentMethod,
      bankName,
      transactionId,
      attachmentUrl,
      notes,
    } = body;

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      return NextResponse.json(
        { success: false, error: "Amount must be greater than 0." },
        { status: 400 }
      );
    }

    const entryType = type || "PAYMENT";
    const isDebit = entryType === "BILL_IN" || entryType === "OPENING_BALANCE";

    const created = await SupplierLedger.create({
      supplier: supplier._id,
      date: date ? new Date(date) : new Date(),
      type: entryType,
      referenceNumber: referenceNumber?.trim() || undefined,
      particulars:
        particulars?.trim() ||
        (entryType === "SR_RETURN"
          ? "Stock Return (S/R) to Vendor"
          : `Payment (${paymentMethod || "ONLINE"}${bankName ? ` - ${bankName}` : ""}${transactionId ? ` TID #${transactionId}` : ""})`),
      debit: isDebit ? numAmount : 0,
      credit: isDebit ? 0 : numAmount,
      paymentMethod: paymentMethod || (entryType === "SR_RETURN" ? "SR_RETURN" : "ONLINE"),
      bankName: bankName?.trim() || undefined,
      transactionId: transactionId?.trim() || undefined,
      attachmentUrl: attachmentUrl || undefined,
      notes: notes?.trim() || undefined,
      createdBy: auth.user.username,
    });

    return NextResponse.json({ success: true, data: created });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to record vendor ledger entry." },
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
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const entryId = searchParams.get("entryId");
    if (!entryId || !mongoose.Types.ObjectId.isValid(entryId)) {
      return NextResponse.json({ success: false, error: "Valid entry ID is required." }, { status: 400 });
    }

    await SupplierLedger.findOneAndDelete({ _id: entryId, supplier: id });
    return NextResponse.json({ success: true, message: "Vendor ledger entry removed." });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete vendor ledger entry." },
      { status: 500 }
    );
  }
}
