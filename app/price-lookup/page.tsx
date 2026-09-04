"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Search, Tag, RefreshCw, AlertCircle, ShoppingBag, ScanBarcode, Truck, Calendar, FileText, Layers, ShieldCheck, User } from "lucide-react";
import { ToastContainer, ToastMessage } from "@/components/Toast";
import { getConditionBadgeClasses, type ProductCondition } from "@/lib/productCondition";

interface ProvenanceDetails {
  supplierName: string;
  invoiceNumber: string;
  receivingNumber: string;
  receivedDate: string;
}

interface SimpleProduct {
  _id: string;
  name: string;
  brand?: string;
  modelNumber?: string;
  model?: string;
  color?: string;
  sku: string;
  barcode: string;
  condition: ProductCondition;
  minSellingPrice: number;
  sellingPrice?: number;
  costPrice?: number;
  priceConfigured?: boolean;
  serialTracking: boolean;
  description?: string;
}

interface ResolvedItem {
  product: SimpleProduct;
  serialTrackingEnabled: boolean;
  priceConfigured: boolean;
  weightedPricing?: {
    priceConfigured: boolean;
    sellingPrice: number;
    minSellingPrice: number;
    costPrice?: number;
  };
  exactPricing?: {
    sellingPrice: number;
    minSellingPrice: number;
    purchaseRate?: number;
  };
  serialDetails?: {
    serialNumber: string;
    status: string;
    location: string;
    createdAt: string;
    provenance?: ProvenanceDetails;
  };
  availableSerials?: {
    serialNumber: string;
    status: string;
    location: string;
    transactionReference?: string;
    createdAt: string;
  }[];
  sourceHistory?: {
    supplierName: string;
    invoiceNumber: string;
    receivingNumber: string;
    quantityReceived: number;
    receivedDate: string;
    locationName: string;
  }[];
}

export default function UnifiedPriceLookupPage() {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedInput, setDebouncedInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [userRole, setUserRole] = useState<string | null>(null);

  // States for search and resolution
  const [resolvedItem, setResolvedItem] = useState<ResolvedItem | null>(null);
  const [searchResults, setSearchResults] = useState<SimpleProduct[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  
  const inputRef = useRef<HTMLInputElement>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const addToast = (type: "success" | "error" | "info", text: string) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, type, text }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Fetch session on mount
  useEffect(() => {
    const fetchSession = async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        if (data.success) {
          setUserRole(data.data.role);
        }
      } catch (err) {
        console.error("Failed to fetch session", err);
      }
    };
    fetchSession();
  }, []);

  // Debounce search input (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedInput(searchInput.trim());
    }, 300);
    return () => clearTimeout(handler);
  }, [searchInput]);

  const handleResolveCode = useCallback(async (code: string) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (!code) {
      setResolvedItem(null);
      setSearchResults([]);
      setError("");
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const signal = controller.signal;

    setLoading(true);
    setError("");

    try {
      // 1. Try to resolve code as Barcode/Serial Number first
      const scanRes = await fetch(`/api/barcodes/scan?barcode=${encodeURIComponent(code)}`, { signal });
      if (signal.aborted) return;
      const scanData = await scanRes.json();

      if (signal.aborted) return;

      if (scanRes.ok && scanData.success) {
        setResolvedItem(scanData.data);
        setSearchResults([]);
        addToast("success", "Item resolved via barcode/serial.");
        return;
      }

      // 2. If it's not an exact barcode/serial, fall back to name search
      const lookupRes = await fetch(`/api/price-lookup?search=${encodeURIComponent(code)}`, { signal });
      if (signal.aborted) return;
      const lookupData = await lookupRes.json();

      if (signal.aborted) return;

      if (lookupRes.ok && lookupData.success) {
        setSearchResults(lookupData.data || []);
        setResolvedItem(null);
        if (lookupData.data?.length === 0) {
          setError("No matching products or barcodes found.");
        }
      } else {
        throw new Error(lookupData.error || "Failed to query price lookup.");
      }
    } catch (err: any) {
      if (err.name === "AbortError" || signal.aborted) {
        return;
      }
      setError(err.message || "No products or barcode source found.");
      setResolvedItem(null);
      setSearchResults([]);
    } finally {
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (debouncedInput) {
      handleResolveCode(debouncedInput);
    } else {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setResolvedItem(null);
      setSearchResults([]);
      setError("");
      setLoading(false);
    }
  }, [debouncedInput, handleResolveCode]);

  const handleClear = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setSearchInput("");
    setDebouncedInput("");
    setResolvedItem(null);
    setSearchResults([]);
    setError("");
    setLoading(false);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const isAuthorizedForProvenance = userRole && ["Admin", "Warehouse", "Accountant"].includes(userRole);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16">
      <ToastContainer toasts={toasts} onClose={removeToast} />

      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Tag className="w-6 h-6 text-indigo-400" />
            <span>Price & Source Lookup</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Search by product name, or scan product barcodes and serial numbers directly.
          </p>
        </div>
        <div>
          <button
            onClick={handleClear}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-300 transition-colors text-xs font-semibold cursor-pointer"
          >
            Clear Lookup
          </button>
        </div>
      </div>

      {/* Unified Search/Scan Input */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-2">
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
          Search or Scan Input
        </label>
        <div className="relative flex items-center gap-3 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 focus-within:border-indigo-500 transition-colors">
          <ScanBarcode className="w-5 h-5 text-slate-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Scan barcode/serial, or type product name..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full bg-transparent border-0 text-slate-100 text-sm focus:outline-none placeholder-slate-500 py-1 font-mono"
            autoFocus
          />
        </div>
      </div>

      {/* Loader */}
      {loading && !resolvedItem && searchResults.length === 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-16 text-center space-y-3">
          <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-medium text-slate-400 font-mono">Resolving search query...</p>
        </div>
      )}

      {/* Error / Empty State */}
      {error && !loading && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-4">
          <div className="w-12 h-12 bg-rose-500/10 text-rose-455 rounded-2xl flex items-center justify-center mx-auto border border-rose-500/20">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-150">Item Not Found</h2>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">{error}</p>
          </div>
        </div>
      )}

      {/* Resolved Exact Item Display */}
      {resolvedItem && !loading && (
        <div className="space-y-6">
          {/* Main Info Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div className="space-y-1">
                <span className="text-[10px] font-extrabold text-indigo-400 uppercase tracking-wider bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded">
                  Resolved Product Card
                </span>
                <h2 className="text-lg font-bold text-slate-100 mt-1.5 leading-snug">
                  {resolvedItem.product.name}
                </h2>
                {resolvedItem.product.brand && (
                  <div className="text-xs text-indigo-300 font-semibold">{resolvedItem.product.brand}</div>
                )}
                {(resolvedItem.product.modelNumber || resolvedItem.product.model) && (
                  <div className="text-xs text-slate-400 font-mono">Model: {resolvedItem.product.modelNumber || resolvedItem.product.model}</div>
                )}
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <span className={`px-2.5 py-0.5 text-[10px] font-extrabold uppercase rounded border tracking-wider ${getConditionBadgeClasses(resolvedItem.product.condition)}`}>
                  {resolvedItem.product.condition}
                </span>
                <span className="px-2.5 py-0.5 text-[10px] font-extrabold uppercase rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 tracking-wider">
                  Color: {resolvedItem.product.color || "Unspecified"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 text-xs">
              <div>
                <span className="block text-[9px] font-extrabold text-slate-500 uppercase tracking-wider mb-0.5">Selling Price</span>
                <span className="text-base font-extrabold text-indigo-400">
                  {resolvedItem.priceConfigured && resolvedItem.weightedPricing
                    ? `Rs. ${resolvedItem.weightedPricing.sellingPrice.toLocaleString("en-PK")}`
                    : "Price Not Configured"}
                </span>
              </div>
              <div>
                <span className="block text-[9px] font-extrabold text-slate-500 uppercase tracking-wider mb-0.5">Minimum Selling Price</span>
                <span className="text-base font-extrabold text-indigo-400">
                  {resolvedItem.priceConfigured && resolvedItem.weightedPricing
                    ? `Rs. ${resolvedItem.weightedPricing.minSellingPrice.toLocaleString("en-PK")}`
                    : "Price Not Configured"}
                </span>
              </div>
              {isAuthorizedForProvenance && (
                <div>
                  <span className="block text-[9px] font-extrabold text-slate-500 uppercase tracking-wider mb-0.5">Weighted Average Cost</span>
                  <span className="text-base font-bold text-slate-200">
                    {resolvedItem.priceConfigured && resolvedItem.weightedPricing?.costPrice !== undefined
                      ? `Rs. ${resolvedItem.weightedPricing.costPrice.toLocaleString("en-PK")}`
                      : "Price Not Configured"}
                  </span>
                </div>
              )}
              {isAuthorizedForProvenance && (
                <>
                  <div>
                    <span className="block text-[9px] font-extrabold text-slate-500 uppercase tracking-wider mb-0.5">SKU Code</span>
                    <span className="font-mono font-bold text-slate-200 uppercase">{resolvedItem.product.sku}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-extrabold text-slate-500 uppercase tracking-wider mb-0.5">Barcode ID</span>
                    <span className="font-mono font-bold text-slate-200">{resolvedItem.product.barcode}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Serialized Details block */}
          {resolvedItem.serialDetails && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-slate-100">Exact Serial Details</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="block text-[9px] font-extrabold text-slate-500 uppercase tracking-wider mb-0.5">Serial Number</span>
                  <span className="font-mono font-extrabold text-indigo-400 text-sm">{resolvedItem.serialDetails.serialNumber}</span>
                </div>
                <div>
                  <span className="block text-[9px] font-extrabold text-slate-500 uppercase tracking-wider mb-0.5">Current Location / Status</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="px-1.5 py-0.2 bg-slate-800 text-slate-400 rounded-sm font-bold uppercase">
                      {resolvedItem.serialDetails.location || "N/A"}
                    </span>
                    <span className="px-1.5 py-0.2 bg-emerald-500/10 text-emerald-450 border border-emerald-500/20 rounded-sm font-bold uppercase">
                      {resolvedItem.serialDetails.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Exact Serial Pricing (Admin, Warehouse, Accountant sees purchaseRate, everyone sees selling prices) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-4 border-t border-slate-800/60 text-xs">
                <div>
                  <span className="block text-[9px] font-extrabold text-slate-500 uppercase tracking-wider mb-0.5">Exact Selling Price</span>
                  <span className="font-extrabold text-indigo-400 font-mono">
                    {resolvedItem.exactPricing
                      ? `Rs. ${resolvedItem.exactPricing.sellingPrice.toLocaleString("en-PK")}`
                      : "Price Not Configured"}
                  </span>
                </div>
                <div>
                  <span className="block text-[9px] font-extrabold text-slate-500 uppercase tracking-wider mb-0.5">Exact Min Selling Price</span>
                  <span className="font-extrabold text-indigo-400 font-mono">
                    {resolvedItem.exactPricing
                      ? `Rs. ${resolvedItem.exactPricing.minSellingPrice.toLocaleString("en-PK")}`
                      : "Price Not Configured"}
                  </span>
                </div>
                {isAuthorizedForProvenance && (
                  <div>
                    <span className="block text-[9px] font-extrabold text-slate-500 uppercase tracking-wider mb-0.5">Exact Purchase Rate</span>
                    <span className="font-bold text-slate-200 font-mono">
                      {resolvedItem.exactPricing?.purchaseRate !== undefined
                        ? `Rs. ${resolvedItem.exactPricing.purchaseRate.toLocaleString("en-PK")}`
                        : "Price Not Configured"}
                    </span>
                  </div>
                )}
              </div>

              {/* Supplier provenance card for serial number */}
              {isAuthorizedForProvenance && resolvedItem.serialDetails.provenance ? (
                <div className="pt-4 border-t border-slate-800/80 space-y-4">
                  <h4 className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider flex items-center gap-1">
                    <Truck className="w-3.5 h-3.5 text-slate-450" />
                    <span>Originating Supplier Source</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs bg-slate-950 p-4 border border-slate-855 rounded-xl">
                    <div>
                      <span className="block text-[9px] font-extrabold text-slate-500 uppercase tracking-wider mb-0.5">Supplier</span>
                      <span className="font-bold text-slate-200">{resolvedItem.serialDetails.provenance.supplierName}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-extrabold text-slate-500 uppercase tracking-wider mb-0.5">Purchase Invoice</span>
                      <span className="font-semibold text-indigo-400 font-mono">{resolvedItem.serialDetails.provenance.invoiceNumber}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-extrabold text-slate-500 uppercase tracking-wider mb-0.5">Receiving Reference</span>
                      <span className="font-semibold text-slate-350 font-mono">{resolvedItem.serialDetails.provenance.receivingNumber}</span>
                    </div>
                    <div className="sm:col-span-2 md:col-span-3">
                      <span className="block text-[9px] font-extrabold text-slate-500 uppercase tracking-wider mb-0.5">Received Date</span>
                      <span className="font-semibold text-slate-400">
                        {new Date(resolvedItem.serialDetails.provenance.receivedDate).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              ) : isAuthorizedForProvenance && (
                <div className="pt-4 border-t border-slate-800/60 text-slate-500 italic text-[11px]">
                  Provenance transactions history not found for this serial number.
                </div>
              )}
            </div>
          )}

          {/* Supplier History list for general products */}
          {isAuthorizedForProvenance && resolvedItem.sourceHistory && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                <Truck className="w-5 h-5 text-indigo-450" />
                <h3 className="text-sm font-bold text-slate-100">Supplier / Purchase Source History</h3>
              </div>

              {resolvedItem.sourceHistory.length === 0 ? (
                <div className="text-center py-8 text-slate-500 italic text-xs border border-dashed border-slate-850 rounded-lg">
                  Source information unavailable for this stock.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-855 rounded-lg">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-950 border-b border-slate-850 text-slate-400 font-bold uppercase tracking-wider">
                        <th className="p-3">Supplier Name</th>
                        <th className="p-3">Purchase Invoice</th>
                        <th className="p-3">Receiving Number</th>
                        <th className="p-3 text-center">Received Qty</th>
                        <th className="p-3 text-center">Location</th>
                        <th className="p-3">Received Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850 text-slate-350 bg-slate-900 font-medium">
                      {resolvedItem.sourceHistory.map((sh, idx) => (
                        <tr key={idx} className="hover:bg-slate-855/40">
                          <td className="p-3 font-bold text-slate-200">{sh.supplierName}</td>
                          <td className="p-3 text-indigo-400 font-mono font-semibold">{sh.invoiceNumber}</td>
                          <td className="p-3 font-semibold text-slate-300 font-mono">{sh.receivingNumber}</td>
                          <td className="p-3 text-center font-bold text-slate-200">{sh.quantityReceived} units</td>
                          <td className="p-3 text-center">
                            <span className="px-1.5 py-0.2 bg-slate-800 text-slate-450 rounded-sm font-bold uppercase text-[10px]">
                              {sh.locationName}
                            </span>
                          </td>
                          <td className="p-3 text-slate-500">
                            {new Date(sh.receivedDate).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* List available serial numbers in stock if product barcode scanned */}
          {!resolvedItem.serialDetails && resolvedItem.availableSerials && resolvedItem.availableSerials.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                <Layers className="w-5 h-5 text-indigo-455" />
                <h3 className="text-sm font-bold text-slate-100">Available Serials In Stock ({resolvedItem.availableSerials.length})</h3>
              </div>
              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-1">
                {resolvedItem.availableSerials.map((sn) => (
                  <button
                    key={sn.serialNumber}
                    onClick={() => {
                      setSearchInput(sn.serialNumber);
                      handleResolveCode(sn.serialNumber);
                    }}
                    className="px-2.5 py-1.5 bg-slate-950 border border-slate-850 hover:border-slate-700 hover:bg-slate-900 rounded-lg text-xs font-mono font-bold text-slate-300 transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <span>{sn.serialNumber}</span>
                    <span className="px-1 py-0.1 bg-slate-850 text-slate-500 rounded text-[9px] font-sans uppercase">{sn.location}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Name search results list */}
      {searchResults.length > 0 && !loading && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Matching Search Results ({searchResults.length})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {searchResults.map((p) => (
              <div
                key={p._id}
                onClick={() => {
                  setSearchInput(p.barcode);
                  setDebouncedInput(p.barcode);
                  handleResolveCode(p.barcode);
                }}
                className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between gap-4 hover:border-slate-700 hover:bg-slate-850/20 transition-all duration-200 cursor-pointer"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-slate-200 text-sm leading-tight hover:text-indigo-400">
                        {p.name}
                      </h3>
                      {p.brand && (
                        <span className="text-xs text-indigo-300 font-semibold block">{p.brand}</span>
                      )}
                      {(p.modelNumber || p.model) && (
                        <span className="text-xs text-slate-400 font-mono block">Model: {p.modelNumber || p.model}</span>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`px-2 py-0.5 text-[9px] font-extrabold uppercase rounded-sm tracking-wider ${getConditionBadgeClasses(p.condition)}`}>
                        {p.condition}
                      </span>
                      <span className="px-2 py-0.5 text-[9px] font-extrabold uppercase rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 tracking-wider">
                        Color: {p.color || "Unspecified"}
                      </span>
                    </div>
                  </div>
                  {isAuthorizedForProvenance && (
                    <div className="text-[10px] text-slate-500 font-semibold space-y-0.5">
                      <p>SKU: <span className="font-mono text-slate-400">{p.sku}</span></p>
                      <p>Barcode: <span className="font-mono text-slate-400">{p.barcode}</span></p>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-850 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Selling Price</span>
                    <span className="font-bold text-slate-200">
                      {p.priceConfigured && p.sellingPrice !== undefined
                        ? `Rs. ${p.sellingPrice.toLocaleString("en-PK")}`
                        : "Price Not Configured"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Min Selling Price</span>
                    <span className="font-extrabold text-indigo-400">
                      {p.priceConfigured && p.minSellingPrice !== undefined
                        ? `Rs. ${p.minSellingPrice.toLocaleString("en-PK")}`
                        : "Price Not Configured"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Awaiting Scan Input layout */}
      {!resolvedItem && searchResults.length === 0 && !loading && !error && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-16 text-center space-y-4">
          <div className="w-14 h-14 bg-slate-950 text-slate-500 rounded-2xl flex items-center justify-center mx-auto border border-slate-800">
            <ScanBarcode className="w-7 h-7 text-slate-500/70" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-sm font-bold text-slate-200">Awaiting Search or Scan Input</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Please enter a product name, scan a physical barcode tag, or enter a serial code.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
