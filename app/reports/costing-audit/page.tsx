"use client";

import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  Search,
  Printer,
  RefreshCw,
  TrendingDown,
  HelpCircle,
  CheckCircle2,
  Filter,
  DollarSign,
  Info,
} from "lucide-react";

interface AuditedProduct {
  _id: string;
  name: string;
  sku: string;
  barcode: string;
  condition: string;
  categoryName: string;
  costPrice: number;
  minSellingPrice: number;
  sellingPrice: number;
  marginPercent: number;
  hasAnomaly: boolean;
  reasons: Array<{
    code: string;
    label: string;
    severity: "HIGH" | "MEDIUM" | "LOW";
  }>;
}

interface AuditSummary {
  totalScanned: number;
  totalAnomalies: number;
  sellingBelowCostCount: number;
  minPriceErrorCount: number;
  zeroCostCount: number;
  suspiciousGapCount: number;
  zeroPriceCount: number;
}

export default function CostingAuditReportPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<AuditedProduct[]>([]);
  const [summary, setSummary] = useState<AuditSummary | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<
    "ANOMALIES_ONLY" | "BELOW_COST" | "ZERO_COST" | "MIN_PRICE" | "SUSPICIOUS_GAP" | "ALL"
  >("ANOMALIES_ONLY");

  const fetchAuditData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/reports/costing-audit");
      const data = await res.json();

      if (data.success) {
        setProducts(data.data || []);
        setSummary(data.summary || null);
      } else {
        setError(data.error || "Failed to load costing audit report.");
      }
    } catch (err: any) {
      setError(err.message || "Network error loading costing audit report.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditData();
  }, []);

  // Filter products based on selected tab & search query
  const filteredProducts = products.filter((prod) => {
    // Tab filter
    if (activeTab === "ANOMALIES_ONLY" && !prod.hasAnomaly) return false;
    if (activeTab === "BELOW_COST" && !prod.reasons.some((r) => r.code === "SELLING_BELOW_COST")) return false;
    if (activeTab === "ZERO_COST" && !prod.reasons.some((r) => r.code === "ZERO_COST")) return false;
    if (
      activeTab === "MIN_PRICE" &&
      !prod.reasons.some((r) => r.code.startsWith("MIN_PRICE"))
    )
      return false;
    if (
      activeTab === "SUSPICIOUS_GAP" &&
      !prod.reasons.some((r) => r.code === "SUSPICIOUS_LOW_COST")
    )
      return false;

    // Search query filter
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase().trim();
      const matchName = prod.name.toLowerCase().includes(q);
      const matchSku = prod.sku?.toLowerCase().includes(q);
      const matchBarcode = prod.barcode?.toLowerCase().includes(q);
      const matchReason = prod.reasons.some((r) => r.label.toLowerCase().includes(q));
      return matchName || matchSku || matchBarcode || matchReason;
    }

    return true;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-100 uppercase tracking-wide flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-amber-400" />
              Product Costing & Pricing Audit Report
            </h1>
            <span className="bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
              Read-Only Audit Mode
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            System audit report detecting price anomalies, zero costings, selling below cost, and min selling price errors.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => window.print()}
            className="bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs px-3.5 py-2 rounded-xl font-bold flex items-center gap-2 transition"
          >
            <Printer className="w-4 h-4 text-indigo-400" />
            Print Report
          </button>
          <button
            onClick={fetchAuditData}
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition shadow-lg shadow-indigo-600/20"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh Audit
          </button>
        </div>
      </div>

      {/* Read-Only Notice Box */}
      <div className="bg-indigo-950/30 border border-indigo-500/30 p-3.5 rounded-xl flex items-center gap-3 text-xs text-indigo-200">
        <Info className="w-4 h-4 text-indigo-400 shrink-0" />
        <span>
          <strong>Note:</strong> This report is in <strong>Strict Read-Only Mode</strong>. No product data can be edited or deleted from this page. Use this report solely to identify costing and pricing errors across inventory.
        </span>
      </div>

      {/* Summary Metric Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Scanned</span>
            <div className="text-xl font-black text-slate-100 font-mono">{summary.totalScanned.toLocaleString()}</div>
            <div className="text-[10px] text-slate-500">Active Products</div>
          </div>

          <div className="bg-slate-900 border border-amber-500/30 bg-amber-500/5 p-3.5 rounded-xl space-y-1">
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Flagged Anomalies
            </span>
            <div className="text-xl font-black text-amber-400 font-mono">{summary.totalAnomalies.toLocaleString()}</div>
            <div className="text-[10px] text-amber-500/80">Need Review</div>
          </div>

          <div className="bg-slate-900 border border-rose-500/30 bg-rose-500/5 p-3.5 rounded-xl space-y-1">
            <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1">
              <TrendingDown className="w-3 h-3" /> Below Cost (Loss)
            </span>
            <div className="text-xl font-black text-rose-400 font-mono">{summary.sellingBelowCostCount.toLocaleString()}</div>
            <div className="text-[10px] text-rose-500/80">Cost &gt;= Selling Price</div>
          </div>

          <div className="bg-slate-900 border border-yellow-500/30 bg-yellow-500/5 p-3.5 rounded-xl space-y-1">
            <span className="text-[10px] font-bold text-yellow-400 uppercase tracking-wider flex items-center gap-1">
              <HelpCircle className="w-3 h-3" /> Zero Cost (0)
            </span>
            <div className="text-xl font-black text-yellow-400 font-mono">{summary.zeroCostCount.toLocaleString()}</div>
            <div className="text-[10px] text-yellow-500/80">Cost Not Set</div>
          </div>

          <div className="bg-slate-900 border border-cyan-500/30 bg-cyan-500/5 p-3.5 rounded-xl space-y-1">
            <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1">
              <DollarSign className="w-3 h-3" /> Min Price Error
            </span>
            <div className="text-xl font-black text-cyan-400 font-mono">{summary.minPriceErrorCount.toLocaleString()}</div>
            <div className="text-[10px] text-cyan-500/80">Min Price Discrepancy</div>
          </div>

          <div className="bg-slate-900 border border-purple-500/30 bg-purple-500/5 p-3.5 rounded-xl space-y-1">
            <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">Low Cost Ratio</span>
            <div className="text-xl font-black text-purple-400 font-mono">{summary.suspiciousGapCount.toLocaleString()}</div>
            <div className="text-[10px] text-purple-500/80">Cost &lt; 15% Selling Price</div>
          </div>
        </div>
      )}

      {/* Control Bar: Filters & Search */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Tabs Filter */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setActiveTab("ANOMALIES_ONLY")}
              className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                activeTab === "ANOMALIES_ONLY"
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              All Anomalies ({summary?.totalAnomalies || 0})
            </button>
            <button
              onClick={() => setActiveTab("BELOW_COST")}
              className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                activeTab === "BELOW_COST"
                  ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              🔴 Below Cost ({summary?.sellingBelowCostCount || 0})
            </button>
            <button
              onClick={() => setActiveTab("ZERO_COST")}
              className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                activeTab === "ZERO_COST"
                  ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              ⚠️ Zero Cost ({summary?.zeroCostCount || 0})
            </button>
            <button
              onClick={() => setActiveTab("MIN_PRICE")}
              className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                activeTab === "MIN_PRICE"
                  ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              🟡 Min Price ({summary?.minPriceErrorCount || 0})
            </button>
            <button
              onClick={() => setActiveTab("SUSPICIOUS_GAP")}
              className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                activeTab === "SUSPICIOUS_GAP"
                  ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              📊 Low Cost Gap ({summary?.suspiciousGapCount || 0})
            </button>
            <button
              onClick={() => setActiveTab("ALL")}
              className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                activeTab === "ALL"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              🌐 All Products ({summary?.totalScanned || 0})
            </button>
          </div>

          {/* Search Box */}
          <div className="relative max-w-xs w-full">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search product, SKU, barcode or reason..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Main Read-Only Audit Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-400" />
            <p>Scanning all active products for costing & pricing anomalies...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-400 text-xs">{error}</div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
            <p className="font-bold text-slate-200">No products matching the selected audit criteria!</p>
            <p className="text-slate-500">All products in this category have clean costing and pricing structures.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                  <th className="p-3">#</th>
                  <th className="p-3">Product Name & Category</th>
                  <th className="p-3">SKU / Barcode</th>
                  <th className="p-3 text-right">Cost Price</th>
                  <th className="p-3 text-right">Min Sell Price</th>
                  <th className="p-3 text-right">Selling Price</th>
                  <th className="p-3 text-center">Profit Margin</th>
                  <th className="p-3">Identified Anomaly Reason (Wajah)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredProducts.map((prod, idx) => (
                  <tr
                    key={prod._id}
                    className={`hover:bg-slate-800/40 transition ${
                      prod.reasons.some((r) => r.code === "SELLING_BELOW_COST")
                        ? "bg-rose-950/10"
                        : prod.hasAnomaly
                        ? "bg-amber-950/10"
                        : ""
                    }`}
                  >
                    <td className="p-3 text-slate-500 font-sans text-[11px]">{idx + 1}</td>

                    <td className="p-3 font-sans">
                      <div className="font-bold text-slate-200">{prod.name}</div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-2">
                        <span className="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded text-[9px] font-semibold">
                          {prod.condition}
                        </span>
                        <span>{prod.categoryName}</span>
                      </div>
                    </td>

                    <td className="p-3 text-slate-400 text-[11px]">
                      <div>{prod.sku || "N/A"}</div>
                      {prod.barcode && <div className="text-[10px] text-slate-500">{prod.barcode}</div>}
                    </td>

                    <td
                      className={`p-3 text-right font-bold ${
                        prod.costPrice === 0 ? "text-yellow-400" : "text-slate-200"
                      }`}
                    >
                      Rs. {prod.costPrice.toLocaleString()}
                    </td>

                    <td
                      className={`p-3 text-right ${
                        prod.reasons.some((r) => r.code.startsWith("MIN_PRICE"))
                          ? "text-cyan-400 font-bold"
                          : "text-slate-400"
                      }`}
                    >
                      Rs. {prod.minSellingPrice.toLocaleString()}
                    </td>

                    <td
                      className={`p-3 text-right font-bold ${
                        prod.costPrice >= prod.sellingPrice && prod.sellingPrice > 0
                          ? "text-rose-400"
                          : "text-emerald-400"
                      }`}
                    >
                      Rs. {prod.sellingPrice.toLocaleString()}
                    </td>

                    <td className="p-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          prod.marginPercent < 0
                            ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                            : prod.marginPercent === 0
                            ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                            : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        }`}
                      >
                        {prod.marginPercent}%
                      </span>
                    </td>

                    <td className="p-3 font-sans">
                      {prod.reasons.length === 0 ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                          <CheckCircle2 className="w-3 h-3" /> Clean / Verified
                        </span>
                      ) : (
                        <div className="space-y-1">
                          {prod.reasons.map((r, rIdx) => (
                            <div
                              key={rIdx}
                              className={`p-1.5 rounded text-[11px] border leading-tight ${
                                r.severity === "HIGH"
                                  ? "bg-rose-950/40 text-rose-300 border-rose-500/40"
                                  : r.severity === "MEDIUM"
                                  ? "bg-amber-950/40 text-amber-300 border-amber-500/40"
                                  : "bg-slate-800 text-slate-300 border-slate-700"
                              }`}
                            >
                              <strong className="block text-[10px] uppercase font-bold text-slate-400">
                                ⚠️ Wajah #{rIdx + 1}:
                              </strong>
                              {r.label}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="p-3 bg-slate-950 border-t border-slate-800 text-[11px] text-slate-500 flex justify-between items-center">
          <span>Showing {filteredProducts.length} audited product entries</span>
          <span>Read-Only Mode &bull; PGS IMS Costing Audit Engine</span>
        </div>
      </div>
    </div>
  );
}
