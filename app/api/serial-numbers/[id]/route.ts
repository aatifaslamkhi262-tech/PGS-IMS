import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { SerialNumber } from "@/models/SerialNumber";
import { verifyRole } from "@/lib/auth/rbac";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Branch", "Salesman"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;

    const serialNumber = await SerialNumber.findById(id)
      .populate("product", "name sku barcode condition serialTracking")
      .lean();

    if (!serialNumber) {
      return NextResponse.json(
        { success: false, error: "Serial number not found" },
        { status: 404 }
      );
    }

    const isAuthorizedForProvenance = ["Admin", "Warehouse", "Accountant"].includes(auth.user?.role || "");
    let provenance: any = null;

    if (isAuthorizedForProvenance && serialNumber.transactionReference) {
      const { PurchaseReceiving } = await import("@/models/PurchaseReceiving");
      const { PurchaseInvoice } = await import("@/models/PurchaseInvoice");

      const receiving = await PurchaseReceiving.findOne({
        receivingNumber: serialNumber.transactionReference,
        status: "Approved",
      })
        .populate({
          path: "purchaseInvoice",
          populate: { path: "supplier", select: "name contactPerson email phone" },
        })
        .lean();

      if (receiving) {
        provenance = {
          supplierName: (receiving.purchaseInvoice as any)?.supplier?.name || "Unknown Supplier",
          invoiceNumber: (receiving.purchaseInvoice as any)?.invoiceNumber || "N/A",
          receivingNumber: receiving.receivingNumber,
          receivedDate: receiving.approvedAt || receiving.createdAt,
        };
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ...serialNumber,
        ...(isAuthorizedForProvenance && { provenance }),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch serial number" },
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
    const { id } = await params;
    const body = await req.json();

    const serialNumber = await SerialNumber.findById(id);
    if (!serialNumber) {
      return NextResponse.json(
        { success: false, error: "Serial number not found" },
        { status: 404 }
      );
    }

    // Validate status change based on current status
    const validTransitions: Record<string, string[]> = {
      "Available": ["Sold", "Damaged", "Transferred"],
      "Sold": ["Returned", "Damaged"],
      "Returned": ["Sold", "Damaged"],
      "Damaged": ["Claim", "Available"],
      "Claim": ["Available"],
      "Transferred": ["Available"],
    };

    if (body.status !== undefined && body.status !== serialNumber.status) {
      const allowedTransitions = validTransitions[serialNumber.status] || [];
      if (!allowedTransitions.includes(body.status)) {
        return NextResponse.json(
          { 
            success: false, 
            error: `Invalid status transition from ${serialNumber.status} to ${body.status}. Allowed: ${allowedTransitions.join(", ")}` 
          },
          { status: 400 }
        );
      }
    }

    // Update fields
    if (body.status !== undefined) {
      serialNumber.status = body.status;
      
      // Update relevant date fields based on status
      if (body.status === "Sold") {
        serialNumber.saleDate = new Date();
      } else if (body.status === "Returned") {
        serialNumber.returnDate = new Date();
      } else if (body.status === "Damaged") {
        serialNumber.damageDate = new Date();
      }
    }
    
    if (body.location !== undefined) serialNumber.location = body.location;
    if (body.transactionReference !== undefined) serialNumber.transactionReference = body.transactionReference;
    if (body.invoiceId !== undefined) serialNumber.invoiceId = body.invoiceId;
    if (body.notes !== undefined) serialNumber.notes = body.notes;

    await serialNumber.save();

    const updatedSerial = await SerialNumber.findById(serialNumber._id)
      .populate("product", "name sku barcode");

    return NextResponse.json({ success: true, data: updatedSerial });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update serial number" },
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
    const { id } = await params;

    const serialNumber = await SerialNumber.findById(id);
    if (!serialNumber) {
      return NextResponse.json(
        { success: false, error: "Serial number not found" },
        { status: 404 }
      );
    }

    // Prevent deletion of serial numbers that are not in Available status
    if (serialNumber.status !== "Available") {
      return NextResponse.json(
        { success: false, error: `Cannot delete serial number with status "${serialNumber.status}". Only Available serial numbers can be deleted.` },
        { status: 400 }
      );
    }

    await SerialNumber.findByIdAndDelete(id);

    return NextResponse.json({ success: true, message: "Serial number deleted successfully" });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete serial number" },
      { status: 500 }
    );
  }
}
