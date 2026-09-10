"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Package, ExternalLink, User, Clock, CheckCircle2, Truck } from "lucide-react";

interface TransferItem {
  _id?: string;
  transferNumber: string;
  type: string;
  sourceLocation?: { _id: string; name: string; code: string };
  destinationLocation?: { _id: string; name: string; code: string };
  status: string;
  items: Array<{
    product: { name: string; sku: string; barcode: string; serialTracking: boolean; costPrice?: number; sellingPrice?: number };
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
  const [expandedTransferId, setExpandedTransferId] = useState<string | null>(null);

  const toggleExpand = (id?: string) => {
    if (!id) return;
    setExpandedTransferId((prev) => (prev === id ? null : id));
  };

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
            <div>
              {/* Mobile Card View (< md) */}
              <div className="block md:hidden divide-y divide-slate-800">
                {transfers.map((tr) => {
                  const totalValuation = tr.items.reduce((sum, item) => {
                    const selling = (item.product as any)?.sellingPrice;
                    const cost = (item.product as any)?.costPrice;
                    const rate = (selling && selling > 1) ? selling : (cost || 0);
                    return sum + ((item.quantity || 1) * rate);
                  }, 0);
                  const isExpanded = expandedTransferId === tr._id;

                  return (
                    <div
                      key={tr._id}
                      className={`p-4 space-y-3 transition ${
                        isExpanded ? "bg-indigo-950/30 border-l-4 border-l-indigo-500" : ""
                      }`}
                    >
                      {/* Card Header Bar */}
                      <div
                        onClick={() => toggleExpand(tr._id)}
                        className="flex items-start justify-between gap-2 cursor-pointer select-none"
                      >
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                          )}
                          <div>
                            <span className="font-mono font-bold text-indigo-400 text-sm block">
                              {tr.transferNumber}
                            </span>
                            <div className="text-[11px] text-slate-400 font-medium">
                              {tr.sourceLocation?.name || "N/A"} → {tr.destinationLocation?.name || "N/A"}
                            </div>
                          </div>
                        </div>
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-semibold border whitespace-nowrap ${getStatusBadge(
                            tr.status
                          )}`}
                        >
                          {tr.status.replace("_", " ")}
                        </span>
                      </div>

                      {/* Compact Item Preview */}
                      <div
                        onClick={() => toggleExpand(tr._id)}
                        className="p-2.5 rounded-xl bg-slate-950 border border-slate-850 text-xs space-y-1 cursor-pointer"
                      >
                        {tr.items.slice(0, 2).map((item, idx) => (
                          <div key={idx} className="text-slate-300 truncate flex justify-between gap-2">
                            <span className="truncate">{item.product?.name || "Item"} ({item.condition})</span>
                            <strong className="text-indigo-400 font-mono shrink-0">x{item.quantity}</strong>
                          </div>
                        ))}
                        {tr.items.length > 2 && (
                          <div className="text-[10px] font-semibold text-indigo-400 pt-0.5">
                            + {tr.items.length - 2} more item{tr.items.length - 2 > 1 ? "s" : ""} ({tr.items.reduce((s, i) => s + (i.quantity || 1), 0)} Total Qty)
                          </div>
                        )}
                      </div>

                      {/* Total Valuation & Action Bar */}
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/60">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-emerald-400">Rs. {totalValuation.toLocaleString("en-PK")}</span>
                          <button
                            onClick={() => toggleExpand(tr._id)}
                            className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold underline flex items-center gap-0.5"
                          >
                            <span>{isExpanded ? "Hide Details" : "Quick Audit"}</span>
                            {isExpanded ? <ChevronUp className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />}
                          </button>
                        </div>
                        <Link
                          href={`/transfers/${tr._id}`}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 font-semibold border border-indigo-500/30 text-xs flex items-center gap-1"
                        >
                          <span>Full Audit</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </Link>
                      </div>

                      {/* Expandable Mobile Accordion Drawer */}
                      {isExpanded && (
                        <div className="pt-3 border-t border-indigo-900/50 space-y-3">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                            <div className="flex items-center gap-1.5">
                              <Package className="w-4 h-4 text-indigo-400 shrink-0" />
                              <span>Line Items ({tr.items.reduce((s, i) => s + (i.quantity || 1), 0)} Total Qty)</span>
                            </div>
                          </div>

                          {/* Mobile Vertical Cards Stack (Zero Horizontal Scroll!) */}
                          <div className="space-y-2">
                            {tr.items.map((it, iIdx) => {
                              const selling = (it.product as any)?.sellingPrice;
                              const cost = (it.product as any)?.costPrice;
                              const unitRate = (selling && selling > 1) ? selling : (cost || 0);
                              const lineTotal = (it.quantity || 1) * unitRate;
                              return (
                                <div
                                  key={iIdx}
                                  className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col gap-2"
                                >
                                  {/* Header: Item Name, Condition & Line Total */}
                                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-bold text-slate-100 text-xs">{it.product?.name || "Item"}</span>
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-800 text-slate-300 border border-slate-700 uppercase">
                                        {it.condition}
                                      </span>
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-800/60 font-mono">
                                        x{it.quantity}
                                      </span>
                                    </div>
                                    <div className="font-mono text-right">
                                      <span className="text-[9px] text-slate-500 uppercase block font-semibold">Total</span>
                                      <span className="font-bold text-emerald-400 text-xs">Rs. {lineTotal.toLocaleString("en-PK")}</span>
                                    </div>
                                  </div>

                                  {/* SKU, Barcode & Rate */}
                                  <div className="flex flex-wrap items-center justify-between text-[10px] gap-1 pt-1 border-t border-slate-900 font-mono text-slate-400">
                                    <div className="truncate max-w-[200px]">
                                      {it.product?.sku && <span>SKU: {it.product.sku}</span>}
                                      {it.product?.barcode && <span className="ml-1.5">| {it.product.barcode}</span>}
                                    </div>
                                    <div>
                                      <span>Rate: </span>
                                      <span className="text-slate-200 font-semibold">Rs. {unitRate.toLocaleString("en-PK")}</span>
                                    </div>
                                  </div>

                                  {/* Serial Numbers Badges */}
                                  {it.serialNumbers && it.serialNumbers.length > 0 && (
                                    <div className="pt-1 border-t border-slate-900">
                                      <span className="text-[9px] uppercase font-semibold text-indigo-400 block mb-1">
                                        Serials ({it.serialNumbers.length}):
                                      </span>
                                      <div className="flex flex-wrap gap-1">
                                        {it.serialNumbers.map((sn, sIdx) => (
                                          <span
                                            key={sIdx}
                                            className="px-1.5 py-0.5 bg-slate-900 text-indigo-300 border border-indigo-900/60 rounded font-mono text-[9px] font-semibold break-all"
                                          >
                                            {sn}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {/* Mobile Custody Audit Trail */}
                          <div className="grid grid-cols-2 gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-850 text-[10px]">
                            <div>
                              <span className="text-slate-500 block uppercase font-semibold text-[8px]">Created By</span>
                              <span className="text-slate-200 font-bold">{tr.createdBy}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block uppercase font-semibold text-[8px]">Dispatched By</span>
                              <span className="text-slate-200 font-bold">{tr.dispatchedBy || "Not Dispatched"}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block uppercase font-semibold text-[8px]">Physical Carrier</span>
                              <span className="text-purple-300 font-bold">{tr.carrierName ? `🚶 ${tr.carrierName}` : "N/A"}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block uppercase font-semibold text-[8px]">Received By</span>
                              <span className="text-emerald-400 font-bold">{tr.receivedBy || "Pending Receipt"}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Desktop View (>= md) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300 min-w-[850px]">
                  <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3.5 px-4 whitespace-nowrap">Transfer Ref</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">Type</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">From</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">To</th>
                      <th className="py-3.5 px-4">Items / Qty</th>
                      <th className="py-3.5 px-4 text-right whitespace-nowrap">Total Valuation</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">Carried By</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">Dispatched By</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">Status</th>
                      <th className="py-3.5 px-4 text-right whitespace-nowrap">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {transfers.map((tr) => {
                      const totalValuation = tr.items.reduce((sum, item) => {
                        const cost = (item.product as any)?.costPrice;
                        const selling = (item.product as any)?.sellingPrice;
                        const rate = (selling && selling > 1) ? selling : (cost || 0);
                        return sum + ((item.quantity || 1) * rate);
                      }, 0);
                      const isExpanded = expandedTransferId === tr._id;
                      return (
                        <React.Fragment key={tr._id}>
                          <tr
                            onClick={() => toggleExpand(tr._id)}
                            className={`cursor-pointer transition ${
                              isExpanded ? "bg-indigo-950/40 border-l-4 border-l-indigo-500" : "hover:bg-slate-800/40"
                            }`}
                          >
                            <td className="py-3.5 px-4 font-mono font-bold text-indigo-400 whitespace-nowrap flex items-center gap-2">
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4 text-indigo-400 shrink-0" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                              )}
                              <span>{tr.transferNumber}</span>
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
                            <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-400 whitespace-nowrap">
                              Rs. {totalValuation.toLocaleString("en-PK")}
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
                            <td className="py-3.5 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              <Link
                                href={`/transfers/${tr._id}`}
                                className="inline-block px-3 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition"
                              >
                                Full Audit →
                              </Link>
                            </td>
                          </tr>

                          {/* Accordion Drawer */}
                          {isExpanded && (
                            <tr className="bg-slate-950/90 border-b border-indigo-900/40">
                              <td colSpan={10} className="p-4 sm:p-5">
                                <div className="space-y-4 text-xs">
                                  {/* Header bar */}
                                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
                                    <div className="flex items-center gap-2">
                                      <Package className="w-4 h-4 text-indigo-400" />
                                      <span className="font-bold text-slate-200">
                                        Transfer Line Items ({tr.items.reduce((s, i) => s + (i.quantity || 1), 0)} Total Qty)
                                      </span>
                                    </div>
                                    <Link
                                      href={`/transfers/${tr._id}`}
                                      className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 rounded-lg text-xs font-semibold border border-indigo-500/30 transition cursor-pointer"
                                    >
                                      <span>Open Full Transfer Audit Page</span>
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </Link>
                                  </div>

                                  {/* Items & Serials List (Vertical Cards Layout - No Horizontal Scroll) */}
                                  <div className="space-y-2.5">
                                    {tr.items.map((it, iIdx) => {
                                      const selling = (it.product as any)?.sellingPrice;
                                      const cost = (it.product as any)?.costPrice;
                                      const unitRate = (selling && selling > 1) ? selling : (cost || 0);
                                      const lineTotal = (it.quantity || 1) * unitRate;
                                      return (
                                        <div
                                          key={iIdx}
                                          className="bg-slate-900 border border-slate-800/80 rounded-xl p-3.5 flex flex-col gap-2 hover:border-slate-700 transition"
                                        >
                                          {/* Product Header & Pricing */}
                                          <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <span className="font-bold text-slate-100 text-sm">{it.product?.name || "Item"}</span>
                                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700 uppercase">
                                                {it.condition}
                                              </span>
                                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-800/60 font-mono">
                                                Qty: {it.quantity}
                                              </span>
                                            </div>
                                            <div className="text-right font-mono">
                                              <span className="text-[9px] text-slate-400 block uppercase font-semibold">Line Total</span>
                                              <span className="font-bold text-emerald-400 text-sm">Rs. {lineTotal.toLocaleString("en-PK")}</span>
                                            </div>
                                          </div>

                                          {/* SKU, Barcode & Unit Price Bar */}
                                          <div className="flex flex-wrap items-center justify-between text-[11px] gap-2 pt-1 border-t border-slate-800/60 font-mono text-slate-400">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              {it.product?.sku && (
                                                <span className="bg-slate-950 px-2 py-0.5 rounded border border-slate-850">
                                                  SKU: <span className="text-slate-200">{it.product.sku}</span>
                                                </span>
                                              )}
                                              {it.product?.barcode && (
                                                <span className="bg-slate-950 px-2 py-0.5 rounded border border-slate-850">
                                                  Barcode: <span className="text-slate-200">{it.product.barcode}</span>
                                                </span>
                                              )}
                                            </div>
                                            <div>
                                              <span className="text-slate-400">Unit Price: </span>
                                              <span className="text-slate-200 font-semibold">Rs. {unitRate.toLocaleString("en-PK")}</span>
                                            </div>
                                          </div>

                                          {/* Serial Numbers Badge List */}
                                          {it.serialNumbers && it.serialNumbers.length > 0 && (
                                            <div className="pt-1.5 border-t border-slate-800/40">
                                              <span className="text-[10px] uppercase font-semibold text-indigo-400 block mb-1">
                                                Serial Numbers ({it.serialNumbers.length}):
                                              </span>
                                              <div className="flex flex-wrap gap-1.5">
                                                {it.serialNumbers.map((sn, sIdx) => (
                                                  <span
                                                    key={sIdx}
                                                    className="px-2 py-0.5 bg-slate-950 text-indigo-300 border border-indigo-900/50 rounded font-mono text-[10px] font-semibold"
                                                  >
                                                    {sn}
                                                  </span>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {/* Custody Summary Trail */}
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950 p-3 rounded-xl border border-slate-850 text-[11px]">
                                    <div>
                                      <span className="text-slate-500 block uppercase font-semibold text-[9px]">Created By</span>
                                      <span className="text-slate-200 font-bold">{tr.createdBy}</span>
                                    </div>
                                    <div>
                                      <span className="text-slate-500 block uppercase font-semibold text-[9px]">Dispatched By</span>
                                      <span className="text-slate-200 font-bold">{tr.dispatchedBy || "Not Dispatched"}</span>
                                    </div>
                                    <div>
                                      <span className="text-slate-500 block uppercase font-semibold text-[9px]">Physical Carrier</span>
                                      <span className="text-purple-300 font-bold">{tr.carrierName ? `🚶 ${tr.carrierName}` : "N/A"}</span>
                                    </div>
                                    <div>
                                      <span className="text-slate-500 block uppercase font-semibold text-[9px]">Received By</span>
                                      <span className="text-emerald-400 font-bold">{tr.receivedBy || "Pending Receipt"}</span>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
