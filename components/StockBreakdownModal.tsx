"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { X, Building2, Package, PackageX, ExternalLink } from "lucide-react";
import {
  DEFAULT_PRODUCT_CONDITION,
  getConditionBadgeClasses,
  type ProductCondition,
} from "@/lib/productCondition";

export interface StockBreakdownItem {
  locationId: string;
  locationName: string;
  locationCode: string;
  locationType: string;
  quantity: number;
}

export interface StockProductInfo {
  _id: string;
  name: string;
  sku: string;
  barcode?: string;
  condition?: string;
  brand?: string;
  totalStock?: number;
  stockBreakdown?: StockBreakdownItem[];
}

interface StockBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: StockProductInfo | null;
}

export function StockBreakdownModal({
  isOpen,
  onClose,
  product,
}: StockBreakdownModalProps) {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !product) return null;

  const totalStock = product.totalStock ?? 0;
  const breakdown = product.stockBreakdown || [];
  const locationsWithStock = breakdown.filter((item) => item.quantity > 0).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Solid Slate Dark Style (No Glassmorphism) */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-start justify-between bg-slate-900">
          <div className="space-y-1 pr-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full ${getConditionBadgeClasses(
                  (product.condition as ProductCondition) || DEFAULT_PRODUCT_CONDITION
                )}`}
              >
                {product.condition || DEFAULT_PRODUCT_CONDITION}
              </span>
              <span className="font-mono text-xs text-slate-400 font-semibold">
                SKU: {product.sku}
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-slate-100 leading-snug">
              {product.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer shrink-0"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary Card */}
        <div className="p-4 bg-slate-950/70 border-b border-slate-800">
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-800">
            <div className="flex items-center gap-2.5">
              <div
                className={`p-2 rounded-lg ${
                  totalStock > 0
                    ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800/60"
                    : "bg-rose-950/80 text-rose-400 border border-rose-800/60"
                }`}
              >
                {totalStock > 0 ? (
                  <Package className="w-5 h-5" />
                ) : (
                  <PackageX className="w-5 h-5" />
                )}
              </div>
              <div>
                <span className="text-xs uppercase font-semibold text-slate-400 block">
                  Total Available Stock
                </span>
                <span className="text-[11px] text-slate-500">
                  {totalStock > 0
                    ? `Available across ${locationsWithStock} of ${breakdown.length} location${
                        breakdown.length === 1 ? "" : "s"
                      }`
                    : "Currently out of stock across all locations"}
                </span>
              </div>
            </div>
            <div className="text-right">
              <span
                className={`font-mono text-xl sm:text-2xl font-extrabold ${
                  totalStock > 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {totalStock.toLocaleString("en-PK")}
              </span>
              <span className="text-xs text-slate-400 block font-medium">units</span>
            </div>
          </div>
        </div>

        {/* Breakdown List / Table (Responsive, Scrollable, Clean Solid Dark) */}
        <div className="p-4 overflow-y-auto flex-1 space-y-2.5 max-h-[50vh]">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-slate-400 font-semibold px-1 pb-1">
            <span>Branch / Location</span>
            <span>Quantity</span>
          </div>

          {breakdown.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs bg-slate-950 rounded-lg border border-slate-800 p-4">
              No branch inventory records found for this product.
            </div>
          ) : (
            breakdown.map((item) => {
              const hasStock = item.quantity > 0;
              return (
                <div
                  key={item.locationId}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                    hasStock
                      ? "bg-slate-950 border-slate-800 hover:border-slate-700"
                      : "bg-slate-950/40 border-slate-800/60 opacity-75"
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-sm font-semibold ${
                          hasStock ? "text-slate-200" : "text-slate-400"
                        }`}
                      >
                        {item.locationName}
                      </span>
                      {item.locationCode && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          {item.locationCode}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Building2 className="w-3 h-3 text-slate-500 shrink-0" />
                      <span>{item.locationType || "Location"}</span>
                    </div>
                  </div>

                  <div className="text-right pl-3 shrink-0">
                    <div
                      className={`font-mono text-base font-bold ${
                        hasStock ? "text-emerald-400" : "text-slate-500"
                      }`}
                    >
                      {item.quantity.toLocaleString("en-PK")}
                    </div>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
                      {item.quantity === 1 ? "unit" : "units"}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-900 flex items-center justify-between gap-3">
          <Link
            href={`/inventory?search=${encodeURIComponent(product.sku || product.name)}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            <span>Full Inventory View</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
