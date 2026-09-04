import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Supplier } from "@/models/Supplier";
import { PurchaseInvoice } from "@/models/PurchaseInvoice";
import { verifyRole } from "@/lib/auth/rbac";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Branch"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const supplier = await Supplier.findById(id).lean();

    if (!supplier) {
      return NextResponse.json({ success: false, error: "Supplier not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: supplier });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch supplier." },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    // Admin, Warehouse, and Accountant can edit
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { name, code, contactPerson, phone, email, address, active } = body;

    const supplier = await Supplier.findById(id);
    if (!supplier) {
      return NextResponse.json({ success: false, error: "Supplier not found." }, { status: 404 });
    }

    // Name validation if changed
    if (name !== undefined && (!name || !name.trim())) {
      return NextResponse.json({ success: false, error: "Supplier Name cannot be empty." }, { status: 400 });
    }

    // Code validation if changed
    if (code !== undefined && (!code || !code.trim())) {
      return NextResponse.json({ success: false, error: "Supplier Code cannot be empty." }, { status: 400 });
    }

    if (code !== undefined) {
      const cleanCode = code.trim().toUpperCase();
      if (cleanCode !== supplier.code) {
        const existingCode = await Supplier.findOne({ code: cleanCode, _id: { $ne: id } });
        if (existingCode) {
          return NextResponse.json(
            { success: false, error: `Supplier with Code "${cleanCode}" already exists.` },
            { status: 400 }
          );
        }
        supplier.code = cleanCode;
      }
    }

    if (name !== undefined && name.trim() !== supplier.name) {
      const existingName = await Supplier.findOne({ name: name.trim(), _id: { $ne: id } });
      if (existingName) {
        return NextResponse.json(
          { success: false, error: `Supplier with Name "${name.trim()}" already exists.` },
          { status: 400 }
        );
      }
      supplier.name = name.trim();
    }

    if (contactPerson !== undefined) supplier.contactPerson = contactPerson ? contactPerson.trim() : undefined;
    if (phone !== undefined) supplier.phone = phone ? phone.trim() : undefined;
    if (email !== undefined) supplier.email = email ? email.trim().toLowerCase() : undefined;
    if (address !== undefined) supplier.address = address ? address.trim() : undefined;
    if (active !== undefined) supplier.active = Boolean(active);

    await supplier.save();

    return NextResponse.json({ success: true, data: supplier });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update supplier." },
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
    // Accountant is strictly blocked from delete (only Admin & Warehouse can delete)
    const auth = await verifyRole(["Admin", "Warehouse"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const supplier = await Supplier.findById(id);

    if (!supplier) {
      return NextResponse.json({ success: false, error: "Supplier not found." }, { status: 404 });
    }

    // Block hard-delete if this supplier has historical purchase invoices.
    // Historical purchasing relationships must be preserved for audit and traceability.
    const invoiceCount = await PurchaseInvoice.countDocuments({ supplier: id });
    if (invoiceCount > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete "${supplier.name}" — this supplier has ${invoiceCount} purchase invoice(s) on record. Mark the supplier as Inactive instead to disable future purchases while preserving historical records.`,
        },
        { status: 409 }
      );
    }

    await Supplier.deleteOne({ _id: id });

    return NextResponse.json({
      success: true,
      message: "Supplier deleted successfully.",
      id,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete supplier." },
      { status: 500 }
    );
  }
}
