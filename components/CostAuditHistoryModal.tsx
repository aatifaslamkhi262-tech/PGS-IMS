"use client";

import React, { useEffect, useState } from "react";
import { X, History, AlertCircle, ArrowUpRight, ArrowDownRight, Tag } from "lucide-react";

export interface CostAdjustmentItem {
  _id: string;
  previousCost: number;
  newCost: number;
  costType: "MANUAL_OVERRIDE" | "HISTORICAL_CORRECTION";
  reason: string;
  userRole: string;
  reference?: string;
  createdAt: string;
  changedBy?: {
    _id: string;
    name?: string;
    email?: string;
    role?: string;
  };
}

interface CostAuditHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
}

export function CostAuditHistoryModal({
  isOpen,
  onClose,
  productId,
  productName,
}: CostAuditHistoryModalProps) {
  const [logs, setLogs] = useState<CostAdjustmentItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!isOpen || !productId) return;

    const fetchHistory = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/cost-adjustments?productId=${productId}`);
        const data = await res.json();
        if (data.success) {
          setLogs(data.data || []);
        } else {
          setError(data.error || "Failed to load audit history.");
        }
      } catch (err: any) {
        setError(err.message || "Failed to fetch audit log.");
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [isOpen, productId]);

  if (!isOpen) return null;

  const formatCurrency = (val: number) => {
    return `Rs. ${val.toLocaleString("en-PK")}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 text-slate-100 rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Cost Adjustment Audit Trail</h2>
              <p className="text-xs text-slate-400 font-mono">Product: {productName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="space-y-3 py-8">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-16 bg-slate-800/50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12">
              <History className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <h3 className="text-slate-300 font-medium">No Cost Adjustments Found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                No manual cost overrides or historical cost corrections have been performed on this product yet.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 text-slate-400 font-medium border-b border-slate-800 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Date & Time</th>
                    <th className="py-3 px-4">Cost Type</th>
                    <th className="py-3 px-4">Previous Cost</th>
                    <th className="py-3 px-4">New Cost</th>
                    <th className="py-3 px-4">Change</th>
                    <th className="py-3 px-4">Reason & Reference</th>
                    <th className="py-3 px-4">User & Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {logs.map((log) => {
                    const diff = log.newCost - log.previousCost;
                    const isIncrease = diff > 0;
                    const isDecrease = diff < 0;

                    return (
                      <tr key={log._id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4 text-slate-400 whitespace-nowrap font-mono">
                          {new Date(log.createdAt).toLocaleString("en-PK", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {log.costType === "MANUAL_OVERRIDE" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                              <Tag className="w-3 h-3" /> Manual Override
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              <History className="w-3 h-3" /> Historical Correction
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono font-medium text-slate-400">
                          {formatCurrency(log.previousCost)}
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold text-white">
                          {formatCurrency(log.newCost)}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap font-mono">
                          {isIncrease && (
                            <span className="inline-flex items-center text-emerald-400 font-medium">
                              <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
                              +{formatCurrency(diff)}
                            </span>
                          )}
                          {isDecrease && (
                            <span className="inline-flex items-center text-red-400 font-medium">
                              <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
                              {formatCurrency(diff)}
                            </span>
                          )}
                          {!isIncrease && !isDecrease && (
                            <span className="text-slate-500">No Change</span>
                          )}
                        </td>
                        <td className="py-3 px-4 max-w-xs">
                          <p className="text-slate-200 font-medium truncate" title={log.reason}>
                            {log.reason}
                          </p>
                          {log.reference && (
                            <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                              Ref: {log.reference}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <p className="text-slate-300 font-medium">
                            {log.changedBy?.name || "System User"}
                          </p>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                            {log.userRole || log.changedBy?.role || "User"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors"
          >
            Close Audit Log
          </button>
        </div>
      </div>
    </div>
  );
}
