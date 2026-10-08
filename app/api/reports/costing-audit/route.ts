import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Product } from "@/models/Product";
import { verifyRole } from "@/lib/auth/rbac";

export async function GET() {
  try {
    await dbConnect();
    const auth = await verifyRole(["Admin", "Warehouse", "Accountant"]);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const products = await Product.find({ isDeleted: { $ne: true } })
      .populate("category", "name")
      .sort({ updatedAt: -1 })
      .lean();

    let sellingBelowCostCount = 0;
    let minPriceErrorCount = 0;
    let zeroCostCount = 0;
    let suspiciousGapCount = 0;
    let zeroPriceCount = 0;

    const auditedProducts = products.map((prod: any) => {
      const cost = Number(prod.costPrice || 0);
      const sell = Number(prod.sellingPrice || 0);
      const minSell = Number(prod.minSellingPrice || 0);

      const reasons: Array<{ code: string; label: string; severity: "HIGH" | "MEDIUM" | "LOW" }> = [];

      // 1. Selling Below Cost (Loss)
      if (cost > 0 && sell > 0 && cost >= sell) {
        sellingBelowCostCount++;
        reasons.push({
          code: "SELLING_BELOW_COST",
          label: `Cost (Rs. ${cost.toLocaleString()}) >= Selling Price (Rs. ${sell.toLocaleString()}) - Direct Loss Risk`,
          severity: "HIGH",
        });
      }

      // 2. Zero / Missing Cost Price
      if (cost === 0) {
        zeroCostCount++;
        reasons.push({
          code: "ZERO_COST",
          label: "Cost Price is Rs. 0 (Missing Costing)",
          severity: "MEDIUM",
        });
      }

      // 3. Zero Selling Price
      if (sell === 0) {
        zeroPriceCount++;
        reasons.push({
          code: "ZERO_SELLING_PRICE",
          label: "Selling Price is Rs. 0 (Not Priced)",
          severity: "HIGH",
        });
      }

      // 4. Invalid Min Selling Price
      if (minSell > 0 && (minSell > sell || minSell < cost)) {
        minPriceErrorCount++;
        if (minSell > sell) {
          reasons.push({
            code: "MIN_PRICE_EXCEEDS_SELL",
            label: `Min Price (Rs. ${minSell.toLocaleString()}) > Selling Price (Rs. ${sell.toLocaleString()})`,
            severity: "MEDIUM",
          });
        } else if (minSell < cost && cost > 0) {
          reasons.push({
            code: "MIN_PRICE_BELOW_COST",
            label: `Min Price (Rs. ${minSell.toLocaleString()}) < Cost Price (Rs. ${cost.toLocaleString()})`,
            severity: "HIGH",
          });
        }
      }

      // 5. Suspicious Cost Gap (Cost is unusually low compared to selling price, e.g. < 15% for items selling above 3,000)
      if (cost > 0 && sell >= 3000 && cost < sell * 0.15) {
        suspiciousGapCount++;
        reasons.push({
          code: "SUSPICIOUS_LOW_COST",
          label: `Cost (Rs. ${cost.toLocaleString()}) is unusually low (${Math.round((cost / sell) * 100)}% of selling price Rs. ${sell.toLocaleString()})`,
          severity: "LOW",
        });
      }

      const marginPercent = sell > 0 ? Math.round(((sell - cost) / sell) * 100) : 0;

      return {
        _id: prod._id,
        name: prod.name,
        sku: prod.sku,
        barcode: prod.barcode,
        condition: prod.condition || "New",
        categoryName: prod.category?.name || "General",
        costPrice: cost,
        minSellingPrice: minSell,
        sellingPrice: sell,
        marginPercent,
        hasAnomaly: reasons.length > 0,
        reasons,
      };
    });

    const totalScanned = auditedProducts.length;
    const totalAnomalies = auditedProducts.filter((p: any) => p.hasAnomaly).length;

    return NextResponse.json({
      success: true,
      summary: {
        totalScanned,
        totalAnomalies,
        sellingBelowCostCount,
        minPriceErrorCount,
        zeroCostCount,
        suspiciousGapCount,
        zeroPriceCount,
      },
      data: auditedProducts,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to generate costing audit report." },
      { status: 500 }
    );
  }
}
