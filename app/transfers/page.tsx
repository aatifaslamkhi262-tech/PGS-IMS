"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface TransferItem {
  _id?: string;
  transferNumber: string;
  type: string;
  sourceLocation?: { _id: string; name: string; code: string };
  destinationLocation?: { _id: string; name: string; code: string };
  status: string;
  items: Array<{
    product: { name: string; sku: string; barcode: string; serialTracking: boolean };
    condition: string;
    quantity: number;
    serialNumbers?: string[];
  }>;
  reason?: string;
  createdBy: string;
  dispatchedBy?: string;
  carrierName?: string;
  dispatchedAt?: string;
  receivedBy?: string;
  receivedAt?: string;
  createdAt: string;
}

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [error, setError] = useState("");

  const fetchTransfers = async () => {
    try {
      setLoading(true);
      setError("");
      let url = "/api/transfers";
      const params = new URLSearchParams();
      if (search.trim()) params.append("search", search.trim());
      if (statusFilter !== "ALL") params.append("status", statusFilter);
      if (params.toString()) url += `?${params.toString()}`;

      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setTransfers(data.data);
      } else {
        setError(data.error || "Failed to load transfers.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to connect to server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransfers();
  }, [statusFilter]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Draft":
        return "bg-gray-700 text-gray-300 border-gray-600";
      case "Pending_Approval":
        return "bg-amber-950 text-amber-300 border-amber-800 animate-pulse";
      case "Approved":
        return "bg-blue-950 text-blue-300 border-blue-800";
      case "Dispatched":
        return "bg-purple-950 text-purple-300 border-purple-800";
      case "Received":
        return "bg-emerald-950 text-emerald-300 border-emerald-800";
      case "Rejected":
      case "Cancelled":
        return "bg-rose-950 text-rose-300 border-rose-800";
      default:
        return "bg-gray-800 text-gray-300 border-gray-700";
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight">
              Stock Transfers Directory
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Multi-branch custody transfer management & real-time in-transit tracking
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/reports/stock-out"
              className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
            >
              Stock Out Report
            </Link>
            <Link
              href="/transfers/new"
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition"
            >
              + Create Transfer
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="flex flex-wrap gap-2 w-full md:w-auto">
            {["ALL", "Pending_Approval", "Approved", "Dispatched", "Received", "Rejected"].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  statusFilter === st
                    ? "bg-blue-600 text-white shadow"
                    : "bg-slate-800/90 hover:bg-slate-700 text-slate-300 border border-slate-700/60"
                }`}
              >
                {st === "ALL" ? "All Transfers" : st.replace("_", " ")}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              fetchTransfers();
            }}
            className="flex gap-2 w-full md:w-80"
          >
            <input
              type="text"
              placeholder="Search ref, carrier, user..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-lg border border-slate-700"
            >
              Search
            </button>
          </form>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-sm">
            ❌ {error}
          </div>
        )}

        {/* Table */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
          {loading ? (
            <div className="p-12 text-center text-slate-400 animate-pulse">Loading stock transfers...</div>
          ) : transfers.length === 0 ? (
            <div className="p-12 text-center text-slate-400">No stock transfers found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300 min-w-[850px]">
                <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4 whitespace-nowrap">Transfer Ref</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">Type</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">From</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">To</th>
                    <th className="py-3.5 px-4">Items / Qty</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">Carried By</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">Dispatched By</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">Status</th>
                    <th className="py-3.5 px-4 text-right whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {transfers.map((tr) => (
                    <tr key={tr._id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-4 font-mono font-bold text-indigo-400 whitespace-nowrap">
                        <Link href={`/transfers/${tr._id}`} className="hover:underline">
                          {tr.transferNumber}
                        </Link>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                            tr.type === "Return"
                              ? "bg-amber-950 text-amber-300 border-amber-800"
                              : tr.type === "Direct_Reject"
                              ? "bg-rose-950 text-rose-300 border-rose-800"
                              : "bg-indigo-950 text-indigo-300 border-indigo-800"
                          }`}
                        >
                          {tr.type}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-200 whitespace-nowrap">
                        {tr.sourceLocation?.name || "N/A"}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-200 whitespace-nowrap">
                        {tr.destinationLocation?.name || "N/A"}
                      </td>
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="space-y-1">
                          {tr.items.slice(0, 2).map((item, idx) => (
                            <div key={idx} className="text-slate-300 truncate">
                              <span className="font-semibold text-slate-100">{item.product?.name || "Item"}</span>{" "}
                              <span className="text-slate-400">({item.condition})</span> x{item.quantity}
                            </div>
                          ))}
                          {tr.items.length > 2 && (
                            <div className="text-[11px] font-semibold text-indigo-400 pt-0.5">
                              + {tr.items.length - 2} more item{tr.items.length - 2 > 1 ? "s" : ""} ({tr.items.reduce((acc, curr) => acc + (curr.quantity || 1), 0)} total qty)
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {tr.carrierName ? (
                          <div className="font-semibold text-emerald-400">🚶 {tr.carrierName}</div>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap">{tr.dispatchedBy || tr.createdBy}</td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold border whitespace-nowrap ${getStatusBadge(
                            tr.status
                          )}`}
                        >
                          {tr.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <Link
                          href={`/transfers/${tr._id}`}
                          className="inline-block px-3 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition"
                        >
                          View Details →
                        </Link>
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
