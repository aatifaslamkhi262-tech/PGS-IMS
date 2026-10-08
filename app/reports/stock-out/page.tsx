"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface StockOutItem {
  _id: string;
  date: string;
  reference: string;
  type: string;
  sourceName: string;
  destinationName: string;
  product: { name: string; sku: string; barcode: string; serialTracking: boolean };
  quantity: number;
  unitCost?: number;
  totalCost?: number;
  sellingPrice?: number;
  totalSellingValue?: number;
  condition: string;
  serialNumbers: string[];
  carrierName: string;
  carrierUsername: string;
  dispatchedBy: string;
  performedBy: string;
  reason: string;
}

interface LocationOption {
  _id: string;
  name: string;
  code: string;
}

interface ReportSummary {
  totalMovements: number;
  totalQuantity: number;
  totalCostValuation: number;
  totalSellingValuation: number;
}

export default function StockOutReportPage() {
  const [items, setItems] = useState<StockOutItem[]>([]);
  const [summary, setSummary] = useState<ReportSummary>({
    totalMovements: 0,
    totalQuantity: 0,
    totalCostValuation: 0,
    totalSellingValuation: 0,
  });
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [locationId, setLocationId] = useState("");
  const [destinationLocationId, setDestinationLocationId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [carrierFilter, setCarrierFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [search, setSearch] = useState("");

  const setDatePreset = (preset: "today" | "yesterday" | "clear") => {
    if (preset === "clear") {
      setStartDate("");
      setEndDate("");
      return;
    }
    const today = new Date();
    if (preset === "today") {
      const dStr = today.toISOString().slice(0, 10);
      setStartDate(dStr);
      setEndDate(dStr);
    } else if (preset === "yesterday") {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const yStr = y.toISOString().slice(0, 10);
      setStartDate(yStr);
      setEndDate(yStr);
    }
  };

  const fetchLocations = async () => {
    try {
      const res = await fetch("/api/locations");
      const data = await res.json();
      if (data.success) setLocations(data.data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchReport = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (locationId) params.append("location", locationId);
      if (destinationLocationId) params.append("destinationLocation", destinationLocationId);
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);
      if (carrierFilter.trim()) params.append("carrier", carrierFilter.trim());
      if (userFilter.trim()) params.append("user", userFilter.trim());
      if (search.trim()) params.append("search", search.trim());

      const res = await fetch(`/api/reports/stock-out?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setItems(data.data);
        if (data.summary) {
          setSummary(data.summary);
        } else {
          setSummary({
            totalMovements: data.data.length,
            totalQuantity: data.data.reduce((sum: number, it: any) => sum + (it.quantity || 0), 0),
            totalCostValuation: Math.round(data.data.reduce((sum: number, it: any) => sum + (it.totalCost || 0), 0) * 100) / 100,
            totalSellingValuation: Math.round(data.data.reduce((sum: number, it: any) => sum + (it.totalSellingValue || 0), 0) * 100) / 100,
          });
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLocations();
    fetchReport();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight">
              Branch Stock Out Activity Report
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Audit log of stock dispatched OUT of branches & warehouse with cost, selling price & carrier tracking
            </p>
          </div>
          <Link
            href="/transfers"
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700"
          >
            ← Back to Transfers Directory
          </Link>
        </div>

        {/* Summary Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Total Dispatches</span>
            <span className="text-2xl font-bold text-indigo-400 mt-1 block">{summary.totalMovements} Records</span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Total Units Out</span>
            <span className="text-2xl font-bold text-rose-400 mt-1 block">-{summary.totalQuantity} Pcs</span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Total Cost Valuation</span>
            <span className="text-2xl font-bold text-amber-400 font-mono mt-1 block">Rs. {summary.totalCostValuation.toLocaleString("en-PK")}</span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Total Selling Valuation</span>
            <span className="text-2xl font-bold text-emerald-400 font-mono mt-1 block">Rs. {summary.totalSellingValuation.toLocaleString("en-PK")}</span>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="bg-slate-900/80 p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Filter Report Records
            </h2>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 text-[11px]">Quick Date:</span>
              <button
                onClick={() => setDatePreset("today")}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] font-semibold"
              >
                Today
              </button>
              <button
                onClick={() => setDatePreset("yesterday")}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] font-semibold"
              >
                Yesterday
              </button>
              {(startDate || endDate) && (
                <button
                  onClick={() => setDatePreset("clear")}
                  className="px-2 py-1 rounded-lg text-rose-400 hover:underline text-[11px]"
                >
                  Clear Date
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Source Location (From)</label>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200"
              >
                <option value="">-- All Source Locations --</option>
                {locations.map((loc) => (
                  <option key={loc._id} value={loc._id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Destination Branch (To)</label>
              <select
                value={destinationLocationId}
                onChange={(e) => setDestinationLocationId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200"
              >
                <option value="">-- All Destination Locations --</option>
                {locations.map((loc) => (
                  <option key={loc._id} value={loc._id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200"
              >
              </input>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200"
              >
              </input>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Physical Carrier</label>
              <input
                type="text"
                placeholder="e.g. Bilal, Ali..."
                value={carrierFilter}
                onChange={(e) => setCarrierFilter(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Dispatched By</label>
              <input
                type="text"
                placeholder="e.g. staff username..."
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Search Keywords</label>
              <input
                type="text"
                placeholder="Search reference, product, SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200"
              />
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              onClick={fetchReport}
              className="w-full sm:w-auto px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow cursor-pointer transition"
            >
              Apply Filters
            </button>
          </div>
        </div>

        {/* Report Table */}
        <div className="bg-slate-900/80 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
          {loading ? (
            <div className="p-12 text-center text-slate-400 animate-pulse">Generating Stock Out Activity report...</div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center text-slate-400">No stock out activity records found for selected criteria.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-3">Date / Time</th>
                    <th className="py-3 px-3">Reference</th>
                    <th className="py-3 px-3">Type</th>
                    <th className="py-3 px-3">From</th>
                    <th className="py-3 px-3">To</th>
                    <th className="py-3 px-3">Product</th>
                    <th className="py-3 px-3 text-center">Qty</th>
                    <th className="py-3 px-3 text-right">Cost Price</th>
                    <th className="py-3 px-3 text-right">Selling Price</th>
                    <th className="py-3 px-3">Carried By</th>
                    <th className="py-3 px-3">Dispatched By</th>
                    <th className="py-3 px-3">Serials</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {items.map((it) => {
                    const unitCost = it.unitCost || 0;
                    const totalCost = it.totalCost || Math.round(it.quantity * unitCost * 100) / 100;
                    const sellingPrice = it.sellingPrice || 0;
                    const totalSelling = it.totalSellingValue || Math.round(it.quantity * sellingPrice * 100) / 100;

                    return (
                      <tr key={it._id} className="hover:bg-slate-800/40 transition">
                        <td className="py-3 px-3 text-slate-400 whitespace-nowrap">
                          {new Date(it.date).toLocaleString()}
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-blue-400">{it.reference}</td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                              it.type === "Customer Sale"
                                ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                                : it.type === "Transfer Return"
                                ? "bg-amber-950 text-amber-300 border-amber-800"
                                : it.type === "Damage / Loss"
                                ? "bg-red-950 text-red-300 border-red-800"
                                : "bg-indigo-950 text-indigo-300 border-indigo-800"
                            }`}
                          >
                            {it.type}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-medium text-slate-200">{it.sourceName}</td>
                        <td className="py-3 px-3 font-medium text-slate-200">{it.destinationName}</td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-100">{it.product?.name || "Product"}</div>
                          <div className="text-[10px] text-slate-400">
                            {it.product?.sku && <span className="font-mono">SKU: {it.product.sku} | </span>}
                            <span>({it.condition})</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-rose-400 text-sm text-center">
                          -{it.quantity}
                        </td>
                        <td className="py-3 px-3 text-right font-mono">
                          <div className="font-bold text-amber-300 text-xs">Rs. {unitCost.toLocaleString("en-PK")}</div>
                          <div className="text-[10px] text-slate-400">Total: Rs. {totalCost.toLocaleString("en-PK")}</div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono">
                          <div className="font-bold text-emerald-400 text-xs">Rs. {sellingPrice.toLocaleString("en-PK")}</div>
                          <div className="text-[10px] text-slate-400">Total: Rs. {totalSelling.toLocaleString("en-PK")}</div>
                        </td>
                        <td className="py-3 px-3 font-semibold text-purple-300">
                          {it.carrierName !== "N/A" && it.carrierName !== "—" ? `🚶 ${it.carrierName}` : "—"}
                        </td>
                        <td className="py-3 px-3 text-slate-400">{it.dispatchedBy}</td>
                        <td className="py-3 px-3">
                          {it.serialNumbers && it.serialNumbers.length > 0 ? (
                            <div className="flex flex-wrap gap-1 max-w-[200px]">
                              {it.serialNumbers.map((s, idx) => (
                                <span
                                  key={idx}
                                  className="px-1.5 py-0.5 bg-slate-950 text-blue-300 border border-slate-800 rounded font-mono text-[10px]"
                                >
                                  {s}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
