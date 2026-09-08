"use client";

import React from "react";

interface TableSkeletonProps {
  rows?: number;
  type?: "products" | "inventory";
}

export const TableSkeleton: React.FC<TableSkeletonProps> = ({
  rows = 6,
  type = "products",
}) => {
  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Mobile Card Skeleton View (< md) */}
      <div className="grid grid-cols-1 gap-4 md:hidden">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div
            key={`mobile-skel-${idx}`}
            className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3"
          >
            {/* Top row */}
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2 flex-1">
                <div className="h-4 bg-slate-800 rounded-md w-3/4 animate-pulse" />
                <div className="h-3 bg-slate-800/60 rounded-md w-1/3 animate-pulse" />
                <div className="flex gap-2 pt-1">
                  <div className="h-4 bg-slate-800/70 rounded-full w-14 animate-pulse" />
                  <div className="h-4 bg-slate-800/70 rounded-full w-16 animate-pulse" />
                </div>
              </div>
              <div className="h-5 bg-slate-800 rounded-full w-16 animate-pulse shrink-0" />
            </div>

            {/* Middle info block */}
            <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/60 grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <div className="h-2.5 bg-slate-800/50 rounded w-10 animate-pulse" />
                <div className="h-3.5 bg-slate-800/80 rounded w-20 animate-pulse font-mono" />
              </div>
              <div className="space-y-1.5">
                <div className="h-2.5 bg-slate-800/50 rounded w-12 animate-pulse" />
                <div className="h-3.5 bg-slate-800/80 rounded w-24 animate-pulse font-mono" />
              </div>
            </div>

            {/* Bottom row */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800/50">
              <div className="space-y-1">
                <div className="h-2.5 bg-slate-800/50 rounded w-16 animate-pulse" />
                <div className="h-5 bg-slate-800 rounded w-24 animate-pulse" />
              </div>
              <div className="flex gap-2">
                <div className="h-8 bg-slate-800 rounded-lg w-16 animate-pulse" />
                <div className="h-8 bg-slate-800 rounded-lg w-16 animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Table Skeleton View (>= md) */}
      <div className="hidden md:block bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-slate-950 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-800">
              <tr>
                {type === "products" ? (
                  <>
                    <th className="px-5 py-4 w-1/4">Product Name</th>
                    <th className="px-4 py-4">Condition</th>
                    <th className="px-4 py-4">Group</th>
                    <th className="px-4 py-4">SKU / Barcode</th>
                    <th className="px-4 py-4">Selling Price</th>
                    <th className="px-4 py-4">Internal Cost</th>
                    <th className="px-4 py-4">Status</th>
                    <th className="px-5 py-4 text-right">Actions</th>
                  </>
                ) : (
                  <>
                    <th className="p-4 w-1/4">Product Details</th>
                    <th className="p-4">Model</th>
                    <th className="p-4 text-center">Color</th>
                    <th className="p-4 text-center">Condition</th>
                    <th className="p-4">Stock Breakdown</th>
                    <th className="p-4 text-center">Total Stock</th>
                    <th className="p-4 text-center">Status</th>
                    <th className="p-4 text-right">Actions</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {Array.from({ length: rows }).map((_, idx) => (
                <tr key={`skel-row-${idx}`} className="hover:bg-slate-800/20 transition-colors">
                  {type === "products" ? (
                    <>
                      {/* Product Name */}
                      <td className="px-5 py-4 space-y-2">
                        <div className="h-4 bg-slate-800 rounded w-3/4 animate-pulse" />
                        <div className="h-3 bg-slate-800/50 rounded w-1/2 animate-pulse" />
                      </td>

                      {/* Condition & Color */}
                      <td className="px-4 py-4 space-y-1.5">
                        <div className="h-4 bg-slate-800 rounded-full w-14 animate-pulse" />
                        <div className="h-3.5 bg-slate-800/60 rounded-full w-16 animate-pulse" />
                      </td>

                      {/* Group */}
                      <td className="px-4 py-4">
                        <div className="h-4 bg-slate-800/60 rounded w-20 animate-pulse" />
                      </td>

                      {/* SKU / Barcode */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-slate-800 rounded-lg shrink-0 animate-pulse" />
                          <div className="space-y-1.5 flex-1">
                            <div className="h-3.5 bg-slate-800 rounded w-20 animate-pulse font-mono" />
                            <div className="h-3 bg-slate-800/50 rounded w-24 animate-pulse font-mono" />
                          </div>
                        </div>
                      </td>

                      {/* Selling Price */}
                      <td className="px-4 py-4">
                        <div className="h-5 bg-slate-800 rounded w-24 animate-pulse" />
                      </td>

                      {/* Internal Cost */}
                      <td className="px-4 py-4">
                        <div className="h-4 bg-slate-800/60 rounded w-20 animate-pulse" />
                      </td>

                      {/* Status */}
                      <td className="px-4 py-4">
                        <div className="h-5 bg-slate-800 rounded-full w-16 animate-pulse" />
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="w-8 h-8 bg-slate-800 rounded-lg animate-pulse" />
                          <div className="w-8 h-8 bg-slate-800 rounded-lg animate-pulse" />
                          <div className="w-8 h-8 bg-slate-800/60 rounded-lg animate-pulse" />
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      {/* Inventory Details */}
                      <td className="p-4 space-y-2">
                        <div className="h-4 bg-slate-800 rounded w-3/4 animate-pulse" />
                        <div className="h-3 bg-slate-800/50 rounded w-1/2 font-mono animate-pulse" />
                      </td>

                      {/* Model */}
                      <td className="p-4">
                        <div className="h-3.5 bg-slate-800/60 rounded w-16 font-mono animate-pulse" />
                      </td>

                      {/* Color */}
                      <td className="p-4 text-center">
                        <div className="h-4 bg-slate-800/70 rounded-full w-14 mx-auto animate-pulse" />
                      </td>

                      {/* Condition */}
                      <td className="p-4 text-center">
                        <div className="h-4 bg-slate-800/70 rounded-full w-12 mx-auto animate-pulse" />
                      </td>

                      {/* Stock Breakdown */}
                      <td className="p-4">
                        <div className="flex gap-3">
                          <div className="h-4 bg-slate-800/60 rounded w-12 animate-pulse" />
                          <div className="h-4 bg-slate-800/60 rounded w-12 animate-pulse" />
                          <div className="h-4 bg-slate-800/60 rounded w-12 animate-pulse" />
                        </div>
                      </td>

                      {/* Total Stock */}
                      <td className="p-4 text-center">
                        <div className="h-5 bg-slate-800 rounded w-10 mx-auto animate-pulse" />
                      </td>

                      {/* Status */}
                      <td className="p-4 text-center">
                        <div className="h-4 bg-slate-800/70 rounded w-16 mx-auto animate-pulse" />
                      </td>

                      {/* Actions */}
                      <td className="p-4 text-right">
                        <div className="h-7 bg-slate-800 rounded w-24 ml-auto animate-pulse" />
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
