"use client";

import React, { useState, useEffect } from "react";
import {
  RotateCcw,
  Search,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  ArrowRightLeft,
  DollarSign,
  Package,
  FileText,
  MapPin,
  Sparkles,
  PlusCircle,
  ShoppingBag,
} from "lucide-react";
import { ThermalReceiptModal } from "@/components/ThermalReceipt";

export default function ReturnExchangeWorkspacePage() {
  const [activeTab] = useState<"EXCHANGE">("EXCHANGE");

  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [availableProducts, setAvailableProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Search Past Invoice
  const [searchQuery, setSearchQuery] = useState("");
  const [originalSale, setOriginalSale] = useState<any | null>(null);
  const [selectedReturnItems, setSelectedReturnItems] = useState<
    Record<string, { quantity: number; condition: string; agreedReturnValuation: number }>
  >({});

  // Outbound Replacement Items
  const [selectedReplacementProd, setSelectedReplacementProd] = useState("");
  const [replacementQty, setReplacementQty] = useState(1);
  const [replacementList, setReplacementList] = useState<any[]>([]);

  // Payment / Refund Channel Selection
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD" | "BANK_TRANSFER" | "ONLINE_GATEWAY">("CASH");
  const [cashAmount, setCashAmount] = useState<number>(0);

  // Quick Create Product Modal
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [quickName, setQuickName] = useState("");
  const [quickCost, setQuickCost] = useState<number>(0);
  const [quickCategory, setQuickCategory] = useState("Game");
  const [quickLoading, setQuickLoading] = useState(false);

  // Receipt Modal
  const [completedReceiptData, setCompletedReceiptData] = useState<any>(null);

  useEffect(() => {
    fetchLocations();
    fetchProducts();
  }, []);

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

  const fetchProducts = async () => {
    try {
      const res = await fetch("/api/products?limit=150");
      const data = await res.json();
      if (data.success) {
        setAvailableProducts(data.data);
      }
    } catch {
      setError("Failed to load products.");
    }
  };

  // Search Past Invoice
  const handleSearchInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setLoading(true);
    setError("");
    setOriginalSale(null);

    try {
      const res = await fetch(`/api/sales?limit=200`);
      const data = await res.json();
      if (data.success) {
        const found = data.data.find(
          (s: any) =>
            s.saleNumber.toLowerCase() === searchQuery.trim().toLowerCase() ||
            s.items.some((i: any) =>
              i.serialNumbers?.some(
                (sn: string) => sn.toLowerCase() === searchQuery.trim().toLowerCase()
              )
            )
        );

        if (!found) {
          setError(`Invoice or Serial '${searchQuery}' not found.`);
        } else if (found.status !== "COMPLETED") {
          setError(`Sale #${found.saleNumber} is not COMPLETED.`);
        } else {
          setOriginalSale(found);
          const initialMap: any = {};
          found.items.forEach((item: any) => {
            const pId = item.product._id || item.product;
            initialMap[pId] = {
              quantity: 0,
              condition: item.condition || "New",
              agreedReturnValuation: item.unitPrice || 0,
            };
          });
          setSelectedReturnItems(initialMap);
        }
      }
    } catch {
      setError("Failed to search invoice.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddReplacement = () => {
    if (!selectedReplacementProd) return;
    const prod = availableProducts.find((p) => p._id === selectedReplacementProd);
    if (!prod) return;

    setReplacementList((prev) => [
      ...prev,
      {
        productId: prod._id,
        productName: prod.name,
        sku: prod.sku,
        unitPrice: prod.sellingPrice,
        quantity: Number(replacementQty),
        lineTotal: prod.sellingPrice * Number(replacementQty),
      },
    ]);

    setSelectedReplacementProd("");
    setReplacementQty(1);
  };

  // Quick Create Unknown Product
  const handleSaveQuickProduct = async () => {
    if (!quickName.trim() || quickCost <= 0) {
      setError("Valid Name and Cost are required for quick product.");
      return;
    }
    setQuickLoading(true);
    try {
      const res = await fetch("/api/products/quick-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: quickName,
          costPrice: Number(quickCost),
          categoryName: quickCategory,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(`Product '${data.data.name}' created cleanly!`);
        await fetchProducts();
        setShowQuickCreate(false);
        setQuickName("");
        setQuickCost(0);
      } else {
        setError(data.error || "Failed to create product.");
      }
    } catch {
      setError("Error creating quick product.");
    } finally {
      setQuickLoading(false);
    }
  };

  // Execute Exchange against Invoice
  const handleExecuteExchange = async () => {
    if (!originalSale) return;

    const returnedItemsPayload: any[] = [];
    originalSale.items.forEach((item: any) => {
      const pId = item.product._id || item.product;
      const rInfo = selectedReturnItems[pId];
      if (rInfo && rInfo.quantity > 0) {
        returnedItemsPayload.push({
          productId: pId,
          productName: item.productName,
          quantity: rInfo.quantity,
          unitPrice: item.unitPrice,
          condition: rInfo.condition,
          agreedReturnValuation: rInfo.agreedReturnValuation,
          serialNumbers: item.serialNumbers || [],
        });
      }
    });

    if (returnedItemsPayload.length === 0) {
      setError("Please select at least 1 item to return.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/sales/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "EXCHANGE",
          originalSaleId: originalSale._id,
          returnedItems: returnedItemsPayload,
          replacementItems: replacementList,
          paymentMethod,
          cashAmount,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Failed to process exchange.");
        setLoading(false);
        return;
      }

      setSuccessMsg(`Exchange #${data.data.returnTxNumber} completed cleanly!`);
      setCompletedReceiptData(data.data.receiptData);
      setOriginalSale(null);
      setReplacementList([]);
    } catch (err: any) {
      setError(err.message || "Network error processing exchange.");
    } finally {
      setLoading(false);
    }
  };

  // Net Calculation for Exchange
  let returnTotalVal = 0;
  if (originalSale) {
    originalSale.items.forEach((item: any) => {
      const pId = item.product._id || item.product;
      const rInfo = selectedReturnItems[pId];
      if (rInfo && rInfo.quantity > 0) {
        returnTotalVal += rInfo.agreedReturnValuation * rInfo.quantity;
      }
    });
  }

  const replacementTotalVal = replacementList.reduce((sum, item) => sum + item.lineTotal, 0);
  const netDiff = replacementTotalVal - returnTotalVal;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
            <ArrowRightLeft className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100">Exchange / Swap Workspace</h1>
            <p className="text-xs text-slate-400">
              Process customer item exchanges (Old Items IN + Replacement Items OUT + Net Settlement)
            </p>
          </div>
        </div>

        {/* Location Selector & Quick Create Trigger */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowQuickCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 text-xs font-bold rounded-xl transition"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Quick-Add Product</span>
          </button>

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
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* EXCHANGE WORKSPACE AGAINST HISTORICAL BILL */}
      <div className="space-y-6">
          <form onSubmit={handleSearchInvoice} className="flex items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
              <input
                type="text"
                placeholder="Enter Invoice # (e.g. INV-20260921-001) or Serial #..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow transition flex items-center gap-1.5"
            >
              {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "Search Invoice"}
            </button>
          </form>

          {originalSale ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: Original Invoice & Item Returns */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
                <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                  <div>
                    <h2 className="text-sm font-bold text-slate-100">{originalSale.saleNumber}</h2>
                    <p className="text-[10px] text-slate-400">
                      Customer: {originalSale.customerName || "Walk-in"} • Date:{" "}
                      {new Date(originalSale.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                    COMPLETED
                  </span>
                </div>

                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                  Select Items to Return & Condition Valuation
                </span>

                <div className="space-y-3">
                  {originalSale.items.map((item: any) => {
                    const pId = item.product._id || item.product;
                    const rInfo = selectedReturnItems[pId] || {
                      quantity: 0,
                      condition: "New",
                      agreedReturnValuation: item.unitPrice || 0,
                    };

                    return (
                      <div
                        key={pId}
                        className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2 text-xs"
                      >
                        <div className="flex justify-between items-center">
                          <div className="font-bold text-slate-200">{item.productName}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            Purchased: {item.quantity} • Original Price: Rs. {item.unitPrice.toLocaleString()}
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-900">
                          <div>
                            <label className="text-[10px] text-slate-400 block">Return Qty:</label>
                            <input
                              type="number"
                              min="0"
                              max={item.quantity}
                              value={rInfo.quantity}
                              onChange={(e) => {
                                const qty = Math.min(item.quantity, Math.max(0, Number(e.target.value)));
                                setSelectedReturnItems((prev) => ({
                                  ...prev,
                                  [pId]: { ...rInfo, quantity: qty },
                                }));
                              }}
                              className="w-full bg-slate-900 border border-slate-800 text-slate-100 font-mono rounded px-2 py-1 text-center"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] text-slate-400 block">Condition:</label>
                            <select
                              value={rInfo.condition}
                              onChange={(e) => {
                                setSelectedReturnItems((prev) => ({
                                  ...prev,
                                  [pId]: { ...rInfo, condition: e.target.value },
                                }));
                              }}
                              className="w-full bg-slate-900 border border-slate-800 text-slate-300 rounded px-2 py-1 text-[10px]"
                            >
                              <option value="New">Restock (New)</option>
                              <option value="Used">Used</option>
                              <option value="Defective">Defective</option>
                            </select>
                          </div>

                          <div>
                            <label className="text-[10px] text-slate-400 block">Accepted Valuation:</label>
                            <input
                              type="number"
                              min="0"
                              value={rInfo.agreedReturnValuation}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setSelectedReturnItems((prev) => ({
                                  ...prev,
                                  [pId]: { ...rInfo, agreedReturnValuation: val },
                                }));
                              }}
                              className="w-full bg-slate-900 border border-emerald-500/30 text-emerald-400 font-mono font-bold rounded px-2 py-1 text-right"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right: Exchange Replacements & Settlement Banner */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5 shadow-xl">
                {activeTab === "EXCHANGE" && (
                  <>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                      Add Replacement Products (Outbound)
                    </span>

                    <div className="flex gap-2 text-xs">
                      <select
                        value={selectedReplacementProd}
                        onChange={(e) => setSelectedReplacementProd(e.target.value)}
                        className="flex-1 bg-slate-950 border border-slate-800 text-slate-200 rounded-xl px-3 py-2"
                      >
                        <option value="">-- Select Replacement Product --</option>
                        {availableProducts.map((p) => (
                          <option key={p._id} value={p._id}>
                            {p.name} (Rs. {p.sellingPrice.toLocaleString()})
                          </option>
                        ))}
                      </select>

                      <input
                        type="number"
                        min="1"
                        value={replacementQty}
                        onChange={(e) => setReplacementQty(Number(e.target.value))}
                        className="w-16 bg-slate-950 border border-slate-800 text-slate-100 font-mono rounded-xl text-center"
                      />

                      <button
                        onClick={handleAddReplacement}
                        className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow"
                      >
                        Add
                      </button>
                    </div>

                    {replacementList.length > 0 && (
                      <div className="space-y-2 bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs font-mono">
                        {replacementList.map((rep, idx) => (
                          <div key={idx} className="flex justify-between items-center">
                            <span className="font-sans font-bold text-slate-200">
                              {rep.productName} (x{rep.quantity})
                            </span>
                            <span className="text-indigo-400">Rs. {rep.lineTotal.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* Net Difference Summary */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-xs font-mono">
                  <div className="flex justify-between text-emerald-400">
                    <span>Total Returned Items Credit:</span>
                    <span>Rs. {returnTotalVal.toLocaleString()}</span>
                  </div>
                  {activeTab === "EXCHANGE" && (
                    <div className="flex justify-between text-slate-300">
                      <span>New Replacement Items Outbound:</span>
                      <span>Rs. {replacementTotalVal.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-100 font-bold text-sm pt-2 border-t border-slate-800">
                    <span>Net Settlement Result:</span>
                    <span
                      className={
                        netDiff > 0
                          ? "text-rose-400 font-bold"
                          : netDiff < 0
                          ? "text-emerald-400 font-bold"
                          : "text-slate-300"
                      }
                    >
                      {netDiff > 0
                        ? `Customer Pays: Rs. ${netDiff.toLocaleString()}`
                        : netDiff < 0
                        ? `Shop Refunds: Rs. ${Math.abs(netDiff).toLocaleString()}`
                        : "Even Exchange (Rs. 0)"}
                    </span>
                  </div>
                </div>

                {/* Settlement Payment Method */}
                <div className="space-y-2 text-xs">
                  <label className="text-slate-300 font-semibold block">Settlement Payment Method:</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl p-2 font-semibold"
                  >
                    <option value="CASH">Cash (Affects Cash Drawer)</option>
                    <option value="CARD">Card Channel</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="ONLINE_GATEWAY">Online Gateway</option>
                  </select>
                </div>

                <button
                  onClick={handleExecuteExchange}
                  disabled={loading}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/20 transition flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    "Execute Exchange & Print Receipt"
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500 text-xs">
              Search a completed Invoice # above to initiate an Exchange.
            </div>
          )}
        </div>

      {/* Quick Create Product Modal */}
      {showQuickCreate && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <PlusCircle className="w-4 h-4 text-indigo-400" />
              Quick-Create Unknown Product
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">Product Name:</label>
                <input
                  type="text"
                  placeholder="e.g. Unknown Used Game Title"
                  value={quickName}
                  onChange={(e) => setQuickName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl p-2"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Cost Price (Rs.):</label>
                <input
                  type="number"
                  placeholder="e.g. 2500"
                  value={quickCost || ""}
                  onChange={(e) => setQuickCost(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 text-emerald-400 font-bold font-mono rounded-xl p-2"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Category:</label>
                <input
                  type="text"
                  value={quickCategory}
                  onChange={(e) => setQuickCategory(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl p-2"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowQuickCreate(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveQuickProduct}
                disabled={quickLoading}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-500"
              >
                {quickLoading ? "Saving..." : "Save Product"}
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
