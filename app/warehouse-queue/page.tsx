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
  Sparkles,
  RotateCcw,
  Repeat,
  ArrowRightLeft,
  DollarSign,
  Disc,
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
  customerName?: string;
  customerPhone?: string;
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
  totalPaid?: number;
  balanceDue?: number;
  status: string;
  createdAt: string;
}

export default function WarehouseQueuePage() {
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("PENDING");
  const [pendingSales, setPendingSales] = useState<PendingSale[]>([]);
  const [selectedSale, setSelectedSale] = useState<PendingSale | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Available Products for Rental Swap Modal
  const [productList, setProductList] = useState<any[]>([]);

  // Rental Settlement Modal State
  const [showRentalModal, setShowRentalModal] = useState(false);
  const [rentalMode, setRentalMode] = useState<"PURE_REFUND" | "GAME_SWAP">("PURE_REFUND");
  const [rentalCustomerName, setRentalCustomerName] = useState("");
  const [rentalCustomerPhone, setRentalCustomerPhone] = useState("");
  const [rentalDepositPaid, setRentalDepositPaid] = useState<number>(11000);
  const [rentalFeeDeducted, setRentalFeeDeducted] = useState<number>(4000);
  const [returnedProductId, setReturnedProductId] = useState<string>("");
  const [returnedCondition, setReturnedCondition] = useState<string>("Used");
  const [returnedSerial, setReturnedSerial] = useState<string>("");
  const [replacementProductId, setReplacementProductId] = useState<string>("");
  const [replacementCondition, setReplacementCondition] = useState<string>("Used");
  const [replacementUnitPrice, setReplacementUnitPrice] = useState<number>(12000);
  const [replacementSerial, setReplacementSerial] = useState<string>("");
  const [rentalPaymentMethod, setRentalPaymentMethod] = useState<"CASH" | "CARD" | "BANK_TRANSFER">("CASH");

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
  }, [selectedLocation, statusFilter, searchTerm, autoRefresh]);

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
      let url = `/api/sales/queue?status=${statusFilter}`;
      if (selectedLocation) url += `&locationId=${selectedLocation}`;
      if (searchTerm.trim()) url += `&search=${encodeURIComponent(searchTerm.trim())}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setPendingSales(data.data);
      }
    } catch {
      // Silent error during polling
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch("/api/products");
      const data = await res.json();
      if (data.success) {
        setProductList(data.data || []);
        if (data.data?.length > 0) {
          setReturnedProductId(data.data[0]._id);
          setReplacementProductId(data.data[0]._id);
        }
      }
    } catch {
      // ignore
    }
  };

  const openRentalModal = () => {
    fetchProducts();
    setShowRentalModal(true);
    setError("");
  };

  const handleProcessRentalSettlement = async () => {
    if (!returnedProductId) {
      setError("Please select a returned rental game product.");
      return;
    }
    if (rentalMode === "GAME_SWAP" && !replacementProductId) {
      setError("Please select a replacement game product for the swap.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const retProd = productList.find((p) => p._id === returnedProductId);
      const repProd = productList.find((p) => p._id === replacementProductId);

      const returnedItemsPayload = [
        {
          productId: returnedProductId,
          quantity: 1,
          condition: returnedCondition,
          unitPrice: rentalDepositPaid,
          serialNumbers: returnedSerial ? [returnedSerial] : [],
        },
      ];

      const replacementItemsPayload =
        rentalMode === "GAME_SWAP"
          ? [
              {
                productId: replacementProductId,
                quantity: 1,
                condition: replacementCondition,
                unitPrice: replacementUnitPrice,
                serialNumbers: replacementSerial ? [replacementSerial] : [],
              },
            ]
          : [];

      const netDepositCredit = Math.max(0, rentalDepositPaid - rentalFeeDeducted);
      const topUpCash =
        rentalMode === "GAME_SWAP"
          ? Math.max(0, replacementUnitPrice - netDepositCredit)
          : 0;

      const res = await fetch("/api/sales/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "RENTAL_SWAP",
          locationId: selectedLocation,
          customerName: rentalCustomerName || "Rental Customer",
          customerPhone: rentalCustomerPhone || "N/A",
          securityDepositPaid: Number(rentalDepositPaid),
          rentalFeeDeducted: Number(rentalFeeDeducted),
          additionalTopUpCash: topUpCash,
          returnedItems: returnedItemsPayload,
          replacementItems: replacementItemsPayload,
          paymentMethod: rentalPaymentMethod,
          processedBy: "Warehouse Cashier",
          notes:
            rentalMode === "PURE_REFUND"
              ? `Rental Deposit Refund (Paid: Rs. ${rentalDepositPaid}, Rent: Rs. ${rentalFeeDeducted})`
              : `Continuous Rental Swap (${retProd?.name || "Game"} -> ${repProd?.name || "Game"})`,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Failed to process rental settlement.");
        setLoading(false);
        return;
      }

      setShowRentalModal(false);
      setCompletedReceiptData(data.data.receiptData);
      fetchQueue();
    } catch (err: any) {
      setError(err.message || "Network error processing rental settlement.");
    } finally {
      setLoading(false);
    }
  };

  const openProcessModal = (sale: PendingSale) => {
    setSelectedSale(sale);
    const balance = sale.saleSource === "ADVANCE_BOOKING"
      ? sale.totalAmount - (sale.totalPaid || 0)
      : sale.totalAmount;
    setPaymentAllocations([{ method: "CASH", amount: Math.max(0, balance) }]);
    setShowPaymentModal(true);
    setError("");
  };

  const handlePrintAdvanceSlip = (sale: PendingSale) => {
    const locObj = locations.find((l) => l._id === (sale.location?._id || sale.location));
    const locName = locObj ? locObj.name : "Warehouse";
    const advancePaid = sale.totalPaid || 0;
    const balanceDue = sale.totalAmount - advancePaid;
    setCompletedReceiptData({
      invoiceNumber: `ADV-${sale.saleNumber}`,
      saleNumber: sale.saleNumber,
      date: new Date(sale.createdAt).toLocaleString(),
      locationName: locName,
      cashierName: sale.salesman?.name || "Counter Cashier",
      salesmanName: sale.salesman?.name || "Direct Counter",
      customerName: sale.customerName || sale.customer?.name || "Walk-in Customer",
      customerPhone: sale.customerPhone || sale.customer?.phone || "N/A",
      items: (sale.items || []).map((it: any) => ({
        productName: it.productName || "Product Item",
        condition: it.condition || "New",
        quantity: it.quantity || 1,
        unitPrice: it.unitPrice || 0,
        lineTotal: it.lineTotal || (it.quantity * (it.unitPrice || 0)),
        serialNumbers: it.serialNumbers || [],
      })),
      subtotal: sale.subtotal,
      discountAmount: sale.discountAmount || 0,
      deliveryCharges: sale.deliveryCharges || 0,
      totalAmount: sale.totalAmount,
      paidAmount: advancePaid,
      changeDue: 0,
      balanceDue: balanceDue,
      status: "ADVANCE_BOOKED",
      payments: [{ method: "CASH", amount: advancePaid }],
    });
  };

  const handleCancelAdvanceBooking = async (saleId: string) => {
    if (!confirm("Are you sure you want to CANCEL this Advance Booking? This will un-reserve serial numbers, refund advance payment, and revert stock.")) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/sales/advance?saleId=${saleId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Failed to cancel advance booking.");
        return;
      }

      alert("Advance booking cancelled successfully. Stock & Serials released.");
      setSelectedSale(null);
      fetchQueue();
    } catch (err: any) {
      setError(err.message || "Network error cancelling advance booking.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelCompletedSale = async (saleId: string, saleNumber: string) => {
    if (!confirm(`Are you sure you want to REVERSE & CANCEL completed sale ${saleNumber}? This will return items to stock inventory, release serial numbers to Available, refund cash in drawer, and mark sale CANCELLED.`)) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/sales/${saleId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Failed to reverse completed sale.");
        return;
      }

      alert(`Completed sale ${saleNumber} reversed & cancelled successfully. Stock & serials returned to inventory!`);
      setSelectedSale(null);
      fetchQueue();
    } catch (err: any) {
      setError(err.message || "Network error reversing completed sale.");
    } finally {
      setLoading(false);
    }
  };

  const handleCheckoutSale = async () => {
    if (!selectedSale) return;

    setLoading(true);
    setError("");

    try {
      let res;
      if (selectedSale.saleSource === "ADVANCE_BOOKING") {
        res = await fetch("/api/sales/advance", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            saleId: selectedSale._id,
            remainingPaymentAllocations: paymentAllocations,
          }),
        });
      } else {
        res = await fetch(`/api/sales/${selectedSale._id}/checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paymentAllocations,
            directComplete: true,
          }),
        });
      }

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
      s.salesman?.name?.toLowerCase().includes(term) ||
      (s.customerName || s.customer?.name || "").toLowerCase().includes(term) ||
      (s.customerPhone || s.customer?.phone || "").toLowerCase().includes(term) ||
      s.items.some((i) =>
        i.productName.toLowerCase().includes(term) ||
        (i.serialNumbers && i.serialNumbers.some((sn: string) => sn.toLowerCase().includes(term)))
      )
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
            <h1 className="text-lg font-bold text-slate-100">Warehouse Billing & Queue Hub</h1>
            <p className="text-xs text-slate-400">
              Real-Time Sales Queue • Pickup Clearance • Filter Completed, Pending & Cancelled Deals
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Status Filter Dropdown */}
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs">
            <span className="text-slate-500 font-bold uppercase text-[10px]">Filter Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-slate-200 font-bold focus:outline-none cursor-pointer"
            >
              <option value="PENDING" className="bg-slate-900 text-amber-400">⏳ Pending Queue</option>
              <option value="COMPLETED" className="bg-slate-900 text-emerald-400">✅ Completed Deals</option>
              <option value="CANCELLED" className="bg-slate-900 text-rose-400">❌ Cancelled Deals</option>
              <option value="ALL" className="bg-slate-900 text-indigo-400">🌐 All Orders</option>
            </select>
          </div>

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

          {/* Rental Return & Deposit Settlement Button */}
          <button
            onClick={openRentalModal}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-purple-500/20 transition flex items-center gap-1.5 cursor-pointer"
            title="Process Rental Return, Game Swap, or Deposit Refund"
          >
            <Repeat className="w-4 h-4" />
            <span>Rental Swap / Cash Refund</span>
          </button>

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
              Orders List ({filteredSales.length})
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
              <p className="text-xs text-slate-400 font-medium">No orders found for this filter status.</p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[calc(100vh-250px)] overflow-y-auto pr-1">
              {filteredSales.map((sale) => {
                const isSelected = selectedSale?._id === sale._id;
                const isAdvance = sale.saleSource === "ADVANCE_BOOKING";
                const isCompleted = sale.status === "COMPLETED";
                const isCancelled = sale.status === "CANCELLED";
                const advancePaid = sale.totalPaid || 0;
                const balanceDue = sale.totalAmount - advancePaid;

                return (
                  <div
                    key={sale._id}
                    onClick={() => setSelectedSale(sale)}
                    className={`p-3.5 rounded-xl border transition cursor-pointer space-y-2 ${
                      isSelected
                        ? "bg-indigo-950/40 border-indigo-500 shadow-lg shadow-indigo-500/10"
                        : isAdvance
                        ? "bg-purple-950/20 border-purple-800/50 hover:border-purple-600"
                        : isCompleted
                        ? "bg-emerald-950/10 border-emerald-900/40 hover:border-emerald-700"
                        : isCancelled
                        ? "bg-rose-950/10 border-rose-900/40 opacity-75 hover:opacity-100"
                        : "bg-slate-900 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-bold text-indigo-400 flex items-center gap-1.5">
                        {sale.saleNumber}
                        {isAdvance && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            ADVANCE
                          </span>
                        )}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        isCompleted
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : isCancelled
                          ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          : isAdvance
                          ? "bg-purple-500/10 text-purple-300 border border-purple-500/20"
                          : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      }`}>
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
                          Customer: {sale.customerName || sale.customer?.name || "Walk-in"}
                        </p>
                      </div>
                      <div className="text-right">
                        {isAdvance && !isCompleted ? (
                          <>
                            <span className="text-xs font-mono font-bold text-emerald-400 block">
                              Paid: Rs. {advancePaid.toLocaleString()}
                            </span>
                            <span className="text-[10px] font-mono font-bold text-rose-400 block">
                              Due: Rs. {balanceDue.toLocaleString()}
                            </span>
                          </>
                        ) : (
                          <span className="text-sm font-mono font-bold text-emerald-400">
                            Rs. {sale.totalAmount.toLocaleString()}
                          </span>
                        )}
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-4 gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-100">{selectedSale.saleNumber}</h2>
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${
                      selectedSale.saleSource === "ADVANCE_BOOKING"
                        ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                        : "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                    }`}>
                      {selectedSale.saleSource === "ADVANCE_BOOKING" ? "ADVANCE RESERVED BOOKING" : selectedSale.creationMode}
                    </span>
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md uppercase ${
                      selectedSale.status === "COMPLETED"
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : selectedSale.status === "CANCELLED"
                        ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                        : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                    }`}>
                      {selectedSale.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Created at: {new Date(selectedSale.createdAt).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {selectedSale.saleSource === "ADVANCE_BOOKING" && (
                    <button
                      onClick={() => handlePrintAdvanceSlip(selectedSale)}
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-purple-300 border border-purple-500/30 font-bold text-xs transition flex items-center gap-1.5"
                      title="Print Advance Deposit Slip"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Print Slip
                    </button>
                  )}

                  {selectedSale.status !== "COMPLETED" && selectedSale.status !== "CANCELLED" && (
                    <button
                      onClick={() => openProcessModal(selectedSale)}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/20 transition flex items-center gap-1.5"
                    >
                      <CreditCard className="w-4 h-4" />
                      {selectedSale.saleSource === "ADVANCE_BOOKING" ? "Collect Pickup Balance & Finalize" : "Process & Finalize Deal"}
                    </button>
                  )}

                  {selectedSale.status !== "CANCELLED" && (
                    <button
                      onClick={() => {
                        if (selectedSale.saleSource === "ADVANCE_BOOKING" && selectedSale.status !== "COMPLETED") {
                          handleCancelAdvanceBooking(selectedSale._id);
                        } else {
                          handleCancelCompletedSale(selectedSale._id, selectedSale.saleNumber);
                        }
                      }}
                      className="px-3 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 font-bold text-xs transition flex items-center gap-1.5"
                      title="Reverse deal and restore stock & serials"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reverse & Cancel Deal
                    </button>
                  )}
                </div>
              </div>

              {/* Salesman & Customer Info Cards */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 space-y-1">
                  <span className="text-[10px] text-slate-500 font-bold uppercase">Attributed Salesman</span>
                  <p className="font-bold text-slate-200">{selectedSale.salesman?.name || "Direct Warehouse Counter"}</p>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 space-y-1">
                  <span className="text-[10px] text-slate-500 font-bold uppercase">Customer Details</span>
                  <p className="font-bold text-slate-200">{selectedSale.customerName || selectedSale.customer?.name || "Walk-in Customer"}</p>
                  {(selectedSale.customerPhone || selectedSale.customer?.phone) && (
                    <p className="text-[10px] text-slate-400 font-mono">{selectedSale.customerPhone || selectedSale.customer?.phone}</p>
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
                  <span>Total Order Value:</span>
                  <span className="text-indigo-300">Rs. {selectedSale.totalAmount.toLocaleString()}</span>
                </div>

                {selectedSale.saleSource === "ADVANCE_BOOKING" && selectedSale.status !== "COMPLETED" && (
                  <>
                    <div className="flex justify-between text-emerald-400 font-bold pt-1">
                      <span>Advance Already Paid:</span>
                      <span>- Rs. {(selectedSale.totalPaid || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-rose-400 font-bold text-sm pt-1 border-t border-slate-800">
                      <span>Remaining Balance Collection:</span>
                      <span>Rs. {(selectedSale.totalAmount - (selectedSale.totalPaid || 0)).toLocaleString()}</span>
                    </div>
                  </>
                )}
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
                {selectedSale.saleSource === "ADVANCE_BOOKING"
                  ? `Customer Pickup Clearance (${selectedSale.saleNumber})`
                  : `Warehouse Payment Allocation (${selectedSale.saleNumber})`}
              </h3>
              <button onClick={() => setShowPaymentModal(false)} className="text-slate-400 hover:text-slate-200">
                ✖
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex justify-between items-center">
                <span className="font-bold text-slate-400">
                  {selectedSale.saleSource === "ADVANCE_BOOKING"
                    ? "Remaining Balance Collection:"
                    : "Total Payable Amount:"}
                </span>
                <span className="text-lg font-mono font-extrabold text-emerald-400">
                  Rs. {(
                    selectedSale.saleSource === "ADVANCE_BOOKING"
                      ? selectedSale.totalAmount - (selectedSale.totalPaid || 0)
                      : selectedSale.totalAmount
                  ).toLocaleString()}
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
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Finalize & Print Invoice"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rental Return / Swap / Deposit Cash Refund Modal */}
      {showRentalModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-6 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold">
                  <ArrowRightLeft className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    Rental Return, Swap & Deposit Settlement
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Handle continuous rolling deposit cycles or cash deposit refunds
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowRentalModal(false)}
                className="text-slate-400 hover:text-slate-200 text-sm font-bold"
              >
                ✖
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Settlement Type Selector */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRentalMode("PURE_REFUND")}
                  className={`p-3 rounded-xl border text-left flex items-start gap-3 transition ${
                    rentalMode === "PURE_REFUND"
                      ? "bg-purple-950/40 border-purple-500 text-purple-200 shadow-md shadow-purple-500/10"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <DollarSign className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-slate-200">💵 Cash Deposit Refund</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Customer ending cycle & claiming remaining cash balance
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setRentalMode("GAME_SWAP")}
                  className={`p-3 rounded-xl border text-left flex items-start gap-3 transition ${
                    rentalMode === "GAME_SWAP"
                      ? "bg-indigo-950/40 border-indigo-500 text-indigo-200 shadow-md shadow-indigo-500/10"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <Disc className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-slate-200">🎮 Continuous Game Swap</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Customer rolling deposit into another game title
                    </div>
                  </div>
                </button>
              </div>

              {/* Customer Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-300">Customer Name:</label>
                  <input
                    type="text"
                    placeholder="e.g. Imran Khan"
                    value={rentalCustomerName}
                    onChange={(e) => setRentalCustomerName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-300">Customer Phone:</label>
                  <input
                    type="text"
                    placeholder="e.g. 03001234567"
                    value={rentalCustomerPhone}
                    onChange={(e) => setRentalCustomerPhone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
              </div>

              {/* Returned Item Section */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-3">
                <span className="text-[10px] text-purple-400 font-bold uppercase tracking-wider block">
                  1. Returned Product Intake
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[11px] text-slate-400">Select Returned Game / Product:</label>
                    <select
                      value={returnedProductId}
                      onChange={(e) => setReturnedProductId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 text-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                    >
                      {productList.map((p) => (
                        <option key={p._id} value={p._id} className="bg-slate-900 text-slate-200">
                          {p.name} ({p.sku})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-400">Condition:</label>
                    <select
                      value={returnedCondition}
                      onChange={(e) => setReturnedCondition(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 text-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                    >
                      <option value="Used">Used</option>
                      <option value="New">New</option>
                      <option value="Defective">Defective</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400">Serial Number / Disc ID (Optional):</label>
                  <input
                    type="text"
                    placeholder="Enter serial number..."
                    value={returnedSerial}
                    onChange={(e) => setReturnedSerial(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 text-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono"
                  />
                </div>
              </div>

              {/* Financial Calculation Section */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-3">
                <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block">
                  2. Financial Deposit & Rent Fee Breakdown
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-400">Security Deposit Paid (Rs.):</label>
                    <input
                      type="number"
                      value={rentalDepositPaid}
                      onChange={(e) => setRentalDepositPaid(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-800 text-emerald-400 font-mono font-bold rounded-lg px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-400">Rental Fee Deducted (Rs.):</label>
                    <input
                      type="number"
                      value={rentalFeeDeducted}
                      onChange={(e) => setRentalFeeDeducted(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-800 text-rose-400 font-mono font-bold rounded-lg px-2.5 py-1.5 text-xs"
                    />
                  </div>
                </div>

                <div className="flex justify-between items-center bg-slate-900 p-2.5 rounded-lg border border-slate-800/80 font-mono text-xs">
                  <span className="text-slate-400">Calculated Net Deposit Credit:</span>
                  <span className="text-emerald-400 font-extrabold text-sm">
                    Rs. {Math.max(0, rentalDepositPaid - rentalFeeDeducted).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* If Game Swap mode: Replacement Product Section */}
              {rentalMode === "GAME_SWAP" && (
                <div className="bg-slate-950 p-3.5 rounded-xl border border-indigo-900/60 space-y-3">
                  <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider block">
                    3. Replacement Game Issue
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-[11px] text-slate-400">Select Replacement Game:</label>
                      <select
                        value={replacementProductId}
                        onChange={(e) => setReplacementProductId(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 text-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                      >
                        {productList.map((p) => (
                          <option key={p._id} value={p._id} className="bg-slate-900 text-slate-200">
                            {p.name} ({p.sku}) - Price: Rs. {p.sellingPrice?.toLocaleString() || 0}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-slate-400">Condition:</label>
                      <select
                        value={replacementCondition}
                        onChange={(e) => setReplacementCondition(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 text-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                      >
                        <option value="Used">Used</option>
                        <option value="New">New</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] text-slate-400">Replacement Game Price (Rs.):</label>
                      <input
                        type="number"
                        value={replacementUnitPrice}
                        onChange={(e) => setReplacementUnitPrice(Number(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-800 text-slate-200 font-mono font-bold rounded-lg px-2.5 py-1.5 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-slate-400">Serial Number (Optional):</label>
                      <input
                        type="text"
                        placeholder="Enter serial number..."
                        value={replacementSerial}
                        onChange={(e) => setReplacementSerial(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 text-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Settlement Summary Card */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-xs font-mono">
                {rentalMode === "PURE_REFUND" ? (
                  <div className="flex justify-between items-center text-rose-400 font-bold text-sm">
                    <span>Cash Refund Paid to Customer:</span>
                    <span>Rs. {Math.max(0, rentalDepositPaid - rentalFeeDeducted).toLocaleString()}</span>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between text-slate-400">
                      <span>Replacement Game Price:</span>
                      <span>Rs. {replacementUnitPrice.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-emerald-400">
                      <span>Applied Net Deposit Credit:</span>
                      <span>- Rs. {Math.max(0, rentalDepositPaid - rentalFeeDeducted).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center font-bold text-sm pt-2 border-t border-slate-800 text-indigo-300">
                      <span>Top-Up Cash Payable by Customer:</span>
                      <span>
                        Rs. {Math.max(0, replacementUnitPrice - Math.max(0, rentalDepositPaid - rentalFeeDeducted)).toLocaleString()}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Payment Collection Method */}
              <div className="space-y-1">
                <label className="font-bold text-slate-300">Payment Collection Method:</label>
                <select
                  value={rentalPaymentMethod}
                  onChange={(e) => setRentalPaymentMethod(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl px-3 py-2 text-xs font-semibold"
                >
                  <option value="CASH">Cash Drawer 💵</option>
                  <option value="CARD">Credit/Debit Card 💳</option>
                  <option value="BANK_TRANSFER">Bank Transfer / Raast 🏦</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowRentalModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 font-semibold text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleProcessRentalSettlement}
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg shadow-purple-600/20 transition flex items-center justify-center gap-2"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Process & Print Thermal Receipt"}
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

