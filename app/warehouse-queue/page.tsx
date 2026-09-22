"use client";

import React, { useState, useEffect } from "react";
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Printer,
  CreditCard,
  User,
  MapPin,
  Search,
  ChevronRight,
  ShoppingBag,
} from "lucide-react";
import { ThermalReceiptModal } from "@/components/ThermalReceipt";

interface PendingSale {
  _id: string;
  saleNumber: string;
  creationMode: string;
  saleSource: string;
  location?: { _id: string; name: string; code: string };
  salesman?: { _id: string; name: string; code: string };
  customer?: { _id: string; name: string; phone: string };
  items: Array<{
    productName: string;
    sku: string;
    condition: string;
    quantity: number;
    serialNumbers?: string[];
    unitPrice: number;
    discountAmount: number;
    lineTotal: number;
  }>;
  subtotal: number;
  discountAmount: number;
  deliveryCharges: number;
  totalAmount: number;
  status: string;
  createdAt: string;
}

export default function WarehouseQueuePage() {
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [pendingSales, setPendingSales] = useState<PendingSale[]>([]);
  const [selectedSale, setSelectedSale] = useState<PendingSale | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Payment Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAllocations, setPaymentAllocations] = useState<
    Array<{ method: "CASH" | "CARD" | "BANK_TRANSFER"; amount: number }>
  >([{ method: "CASH", amount: 0 }]);
  const [completedReceiptData, setCompletedReceiptData] = useState<any>(null);

  // Load locations on mount
  useEffect(() => {
    fetchLocations();
  }, []);

  // Poll queue periodically
  useEffect(() => {
    fetchQueue();
    if (!autoRefresh) return;
    const interval = setInterval(fetchQueue, 5000);
    return () => clearInterval(interval);
  }, [selectedLocation, autoRefresh]);

  const fetchLocations = async () => {
    try {
      const res = await fetch("/api/locations");
      const data = await res.json();
      if (data.success && data.data.length > 0) {
        setLocations(data.data);
        setSelectedLocation(data.data[0]._id);
      }
    } catch {
      setError("Failed to load locations.");
    }
  };

  const fetchQueue = async () => {
    try {
      const url = selectedLocation
        ? `/api/sales/queue?locationId=${selectedLocation}`
        : "/api/sales/queue";
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setPendingSales(data.data);
      }
    } catch {
      // Silent error during polling
    }
  };

  const openProcessModal = (sale: PendingSale) => {
    setSelectedSale(sale);
    setPaymentAllocations([{ method: "CASH", amount: sale.totalAmount }]);
    setShowPaymentModal(true);
    setError("");
  };

  const handleCheckoutSale = async () => {
    if (!selectedSale) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/sales/${selectedSale._id}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentAllocations,
          directComplete: true,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Failed to process warehouse checkout.");
        setLoading(false);
        return;
      }

      setShowPaymentModal(false);
      setCompletedReceiptData(data.data.receiptData);
      fetchQueue();
    } catch (err: any) {
      setError(err.message || "Network error completing sale.");
    } finally {
      setLoading(false);
    }
  };

  const filteredSales = pendingSales.filter((s) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      s.saleNumber.toLowerCase().includes(term) ||
      s.salesman?.name.toLowerCase().includes(term) ||
      s.customer?.name.toLowerCase().includes(term) ||
      s.items.some((i) => i.productName.toLowerCase().includes(term))
    );
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 lg:p-6 space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
            <Clock className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100">Warehouse Billing Queue</h1>
            <p className="text-xs text-slate-400">
              Live Real-Time Pending Salesman Checkouts & Direct Counter Billing
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Location Selector */}
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs">
            <MapPin className="w-3.5 h-3.5 text-indigo-400" />
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="bg-transparent text-slate-200 font-semibold focus:outline-none"
            >
              {locations.map((loc) => (
                <option key={loc._id} value={loc._id} className="bg-slate-900 text-slate-200">
                  {loc.name}
                </option>
              ))}
            </select>
          </div>

          {/* Refresh Button */}
          <button
            onClick={fetchQueue}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            title="Refresh Queue"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Grid: Queue List & Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Queue List */}
        <div className="lg:col-span-1 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Pending Orders ({filteredSales.length})
            </span>
            <div className="relative w-48">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search order..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {filteredSales.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto opacity-80" />
              <p className="text-xs text-slate-400 font-medium">No pending salesman sales in queue.</p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[calc(100vh-250px)] overflow-y-auto pr-1">
              {filteredSales.map((sale) => {
                const isSelected = selectedSale?._id === sale._id;
                return (
                  <div
                    key={sale._id}
                    onClick={() => setSelectedSale(sale)}
                    className={`p-3.5 rounded-xl border transition cursor-pointer space-y-2 ${
                      isSelected
                        ? "bg-indigo-950/40 border-indigo-500 shadow-lg shadow-indigo-500/10"
                        : "bg-slate-900 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-bold text-indigo-400">{sale.saleNumber}</span>
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-bold">
                        {sale.status}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-xs">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1 text-slate-300">
                          <User className="w-3 h-3 text-slate-500" />
                          <span>Salesman: <b>{sale.salesman?.name || "Direct Counter"}</b></span>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          Customer: {sale.customer?.name || "Walk-in"}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-mono font-bold text-emerald-400">
                          Rs. {sale.totalAmount.toLocaleString()}
                        </span>
                        <p className="text-[10px] text-slate-500">
                          {sale.items.reduce((s, i) => s + i.quantity, 0)} items
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Selected Order Details & Checkout */}
        <div className="lg:col-span-2">
          {selectedSale ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-6 shadow-xl sticky top-20">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-100">{selectedSale.saleNumber}</h2>
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-md">
                      {selectedSale.creationMode}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Created at: {new Date(selectedSale.createdAt).toLocaleTimeString()}
                  </p>
                </div>

                <button
                  onClick={() => openProcessModal(selectedSale)}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/20 transition flex items-center gap-2"
                >
                  <CreditCard className="w-4 h-4" />
                  Process & Print Invoice
                </button>
              </div>

              {/* Salesman & Customer Info Cards */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 space-y-1">
                  <span className="text-[10px] text-slate-500 font-bold uppercase">Attributed Salesman</span>
                  <p className="font-bold text-slate-200">{selectedSale.salesman?.name || "Direct Warehouse Counter"}</p>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 space-y-1">
                  <span className="text-[10px] text-slate-500 font-bold uppercase">Customer</span>
                  <p className="font-bold text-slate-200">{selectedSale.customer?.name || "Walk-in Customer"}</p>
                  {selectedSale.customer?.phone && (
                    <p className="text-[10px] text-slate-400 font-mono">{selectedSale.customer.phone}</p>
                  )}
                </div>
              </div>

              {/* Items Table */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Order Items Breakdown
                </span>
                <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-900 border-b border-slate-800 text-slate-400">
                      <tr>
                        <th className="p-3">Product</th>
                        <th className="p-3 text-center">Qty</th>
                        <th className="p-3 text-right">Unit Price</th>
                        <th className="p-3 text-right">Discount</th>
                        <th className="p-3 text-right">Line Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {selectedSale.items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-900/50">
                          <td className="p-3 font-sans">
                            <div className="font-bold text-slate-200">{item.productName}</div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              SKU: {item.sku} • {item.condition}
                            </div>
                            {item.serialNumbers && item.serialNumbers.length > 0 && (
                              <div className="text-[10px] text-indigo-300 font-mono pt-0.5">
                                Serials: {item.serialNumbers.join(", ")}
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-center font-bold text-slate-200">{item.quantity}</td>
                          <td className="p-3 text-right text-slate-300">Rs. {item.unitPrice.toLocaleString()}</td>
                          <td className="p-3 text-right text-rose-400">
                            {item.discountAmount > 0 ? `Rs. ${item.discountAmount.toLocaleString()}` : "-"}
                          </td>
                          <td className="p-3 text-right font-bold text-indigo-400">
                            Rs. {item.lineTotal.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals Summary */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-xs font-mono">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal:</span>
                  <span>Rs. {selectedSale.subtotal.toLocaleString()}</span>
                </div>
                {selectedSale.discountAmount > 0 && (
                  <div className="flex justify-between text-rose-400">
                    <span>Overall Discount:</span>
                    <span>- Rs. {selectedSale.discountAmount.toLocaleString()}</span>
                  </div>
                )}
                {selectedSale.deliveryCharges > 0 && (
                  <div className="flex justify-between text-slate-300">
                    <span>Delivery Charges:</span>
                    <span>+ Rs. {selectedSale.deliveryCharges.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-100 font-bold text-sm pt-2 border-t border-slate-800">
                  <span>Total Bill Amount:</span>
                  <span className="text-emerald-400">Rs. {selectedSale.totalAmount.toLocaleString()}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500 text-xs">
              Select an order from the queue to process and print invoice.
            </div>
          )}
        </div>
      </div>

      {/* Payment Checkout Modal */}
      {showPaymentModal && selectedSale && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-400" />
                Warehouse Payment Allocation ({selectedSale.saleNumber})
              </h3>
              <button onClick={() => setShowPaymentModal(false)} className="text-slate-400 hover:text-slate-200">
                ✖
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex justify-between items-center">
                <span className="font-bold text-slate-400">Total Payable Amount:</span>
                <span className="text-lg font-mono font-extrabold text-emerald-400">
                  Rs. {selectedSale.totalAmount.toLocaleString()}
                </span>
              </div>

              {/* Payment Allocation Method */}
              <div className="space-y-2">
                <label className="font-bold text-slate-300">Payment Collection Method:</label>
                {paymentAllocations.map((alloc, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <select
                      value={alloc.method}
                      onChange={(e) => {
                        const updated = [...paymentAllocations];
                        updated[idx].method = e.target.value as any;
                        setPaymentAllocations(updated);
                      }}
                      className="bg-slate-950 border border-slate-800 text-slate-200 rounded-xl px-3 py-2 text-xs font-semibold"
                    >
                      <option value="CASH">Cash 💵</option>
                      <option value="CARD">Credit/Debit Card 💳</option>
                      <option value="BANK_TRANSFER">Bank Transfer / Raast 🏦</option>
                    </select>

                    <input
                      type="number"
                      value={alloc.amount}
                      onChange={(e) => {
                        const updated = [...paymentAllocations];
                        updated[idx].amount = Number(e.target.value);
                        setPaymentAllocations(updated);
                      }}
                      className="w-full bg-slate-950 border border-slate-800 text-slate-100 font-mono rounded-xl px-3 py-2 text-xs"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowPaymentModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 font-semibold text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleCheckoutSale}
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/20 transition flex items-center justify-center gap-2"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Complete & Print Invoice"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Thermal Receipt Modal */}
      {completedReceiptData && (
        <ThermalReceiptModal
          receiptData={completedReceiptData}
          onClose={() => setCompletedReceiptData(null)}
        />
      )}
    </div>
  );
}
