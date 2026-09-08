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

export default function StockOutReportPage() {
  const [items, setItems] = useState<StockOutItem[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [locationId, setLocationId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [carrierFilter, setCarrierFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [search, setSearch] = useState("");

  const fetchLocations = async () => {
    try {
      const res = await fetch("/api/locations");
      const data = await res.json();
      if (data.success) setLocations(d => data.data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchReport = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (locationId) params.append("location", locationId);
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);
      if (carrierFilter.trim()) params.append("carrier", carrierFilter.trim());
      if (userFilter.trim()) params.append("user", userFilter.trim());
      if (search.trim()) params.append("search", search.trim());

      const res = await fetch(`/api/reports/stock-out?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setItems(data.data);
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
              Audit log of stock dispatched OUT of branches & warehouse with physical carrier accountability
            </p>
          </div>
          <Link
            href="/transfers"
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700"
          >
            ← Back to Transfers Directory
          </Link>
        </div>

        {/* Filter Controls */}
        <div className="bg-slate-900/80 p-6 rounded-2xl border border-slate-800 space-y-4">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Filter Report Records
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Filter Location</label>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200"
              >
                <option value="">-- All Locations --</option>
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
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200"
              />
            </div>

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
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-2">
            <div className="w-full sm:w-80">
              <input
                type="text"
                placeholder="Search reference, product, user..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200"
              />
            </div>

            <button
              onClick={fetchReport}
              className="w-full sm:w-auto px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow"
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
                    <th className="py-3 px-4">Date / Time</th>
                    <th className="py-3 px-4">Reference</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">From</th>
                    <th className="py-3 px-4">To</th>
                    <th className="py-3 px-4">Product</th>
                    <th className="py-3 px-4">Qty</th>
                    <th className="py-3 px-4">Carried By</th>
                    <th className="py-3 px-4">Dispatched By</th>
                    <th className="py-3 px-4">Serials</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {items.map((it) => (
                    <tr key={it._id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                        {new Date(it.date).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-blue-400">{it.reference}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                            it.type === "Transfer Return"
                              ? "bg-amber-950 text-amber-300 border-amber-800"
                              : "bg-purple-950 text-purple-300 border-purple-800"
                          }`}
                        >
                          {it.type}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-200">{it.sourceName}</td>
                      <td className="py-3 px-4 font-medium text-slate-200">{it.destinationName}</td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-100">{it.product?.name || "Product"}</span>{" "}
                        <span className="text-slate-400">({it.condition})</span>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-rose-400 text-sm">-{it.quantity}</td>
                      <td className="py-3 px-4 font-semibold text-emerald-400">
                        {it.carrierName !== "N/A" ? `🚶 ${it.carrierName}` : "—"}
                      </td>
                      <td className="py-3 px-4 text-slate-400">{it.dispatchedBy}</td>
                      <td className="py-3 px-4">
                        {it.serialNumbers && it.serialNumbers.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
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
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
