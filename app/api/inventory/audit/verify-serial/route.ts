import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { verifyRole } from "@/lib/auth/rbac";
import { Location } from "@/models/Location";
import { SerialNumber } from "@/models/SerialNumber";
import { Product } from "@/models/Product";

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant", "Owner"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const { serialNumber, locationId } = body;

    const cleanSn = (serialNumber || "").trim();
    if (!cleanSn) {
      return NextResponse.json({ success: false, error: "Serial number is required" }, { status: 400 });
    }

    const isConsolidated = locationId === "ALL";
    let targetLoc: any = null;
    if (isConsolidated) {
      targetLoc = { _id: "ALL", name: "All Branches" };
    } else {
      targetLoc = await Location.findById(locationId).lean();
      if (!targetLoc) {
        return NextResponse.json({ success: false, error: "Target location not found" }, { status: 404 });
      }
    }

    const serialDoc = await SerialNumber.findOne({
      serialNumber: new RegExp(`^${cleanSn}$`, "i"),
    })
      .populate("product", "name sku barcode condition serialTracking")
      .lean();

    if (!serialDoc) {
      // Check if this barcode matches a Non-Serialized Product in catalog
      const cleanSnRegex = new RegExp(`^${cleanSn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
      const matchedProduct = await Product.findOne({
        $or: [
          { barcode: cleanSn },
          { sku: cleanSnRegex },
        ],
      }).lean();

      if (matchedProduct && !matchedProduct.serialTracking) {
        return NextResponse.json({
          success: true,
          data: {
            serialNumber: cleanSn,
            type: "NON_SERIALIZED_PRODUCT",
            badgeColor: "indigo",
            label: "Non-Serialized Product",
            product: matchedProduct,
            message: `Counted +1 for ${matchedProduct.name} (Non-serialized shelf stock).`,
          },
        });
      }

      return NextResponse.json({
        success: true,
        data: {
          serialNumber: cleanSn,
          type: "UNREGISTERED",
          badgeColor: "rose",
          label: "Unregistered Serial",
          message: "Serial not found in database. Can be registered as new found stock.",
        },
      });
    }

    const docLocStr = (serialDoc.location || "").trim();
    const isLocal =
      isConsolidated ||
      docLocStr === targetLoc._id.toString() ||
      docLocStr.toLowerCase() === targetLoc.name.toLowerCase().trim();

    if (serialDoc.status === "Available") {
      if (isLocal) {
        return NextResponse.json({
          success: true,
          data: {
            serialNumber: serialDoc.serialNumber,
            type: "MATCHED_LOCAL",
            badgeColor: "emerald",
            label: isConsolidated ? "In Stock (Company)" : "Matched (Local)",
            product: serialDoc.product,
            message: isConsolidated
              ? `Verified in stock across mall (Assigned to: ${serialDoc.location || "Branch"}).`
              : `Verified in stock at ${targetLoc.name}.`,
          },
        });
      } else {
        const otherLoc = await Location.findOne({
          $or: [{ _id: docLocStr }, { name: new RegExp(`^${docLocStr}$`, "i") }],
        }).lean();
        const otherLocName = otherLoc?.name || docLocStr || "Another Branch";

        return NextResponse.json({
          success: true,
          data: {
            serialNumber: serialDoc.serialNumber,
            type: "CROSS_BRANCH",
            badgeColor: "amber",
            label: `Belongs to ${otherLocName}`,
            fromLocationId: otherLoc?._id || null,
            fromLocationName: otherLocName,
            product: serialDoc.product,
            message: `Currently registered at ${otherLocName}. Will auto-transfer to ${targetLoc.name}.`,
          },
        });
      }
    } else if (serialDoc.status === "Reserved") {
      return NextResponse.json({
        success: true,
        data: {
          serialNumber: serialDoc.serialNumber,
          type: "RESERVED",
          badgeColor: "cyan",
          label: "Reserved for Customer",
          product: serialDoc.product,
          message: "Locked for Advance Booking or Order. Do NOT sell as free stock.",
        },
      });
    } else if (serialDoc.status === "Sold" || serialDoc.status === "Returned") {
      return NextResponse.json({
        success: true,
        data: {
          serialNumber: serialDoc.serialNumber,
          type: "PREVIOUSLY_SOLD",
          badgeColor: "purple",
          label: `Previously ${serialDoc.status}`,
          product: serialDoc.product,
          message: `Was marked as ${serialDoc.status}. Can be reactivated into shelf stock.`,
        },
      });
    } else {
      return NextResponse.json({
        success: true,
        data: {
          serialNumber: serialDoc.serialNumber,
          type: "OTHER_STATUS",
          badgeColor: "slate",
          label: `Status: ${serialDoc.status}`,
          product: serialDoc.product,
          message: `Current database status is '${serialDoc.status}'.`,
        },
      });
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to verify serial" },
      { status: 500 }
    );
  }
}
