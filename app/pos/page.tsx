"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  ScanBarcode,
  ShoppingBag,
  User,
  CreditCard,
  DollarSign,
  Printer,
  Trash2,
  Plus,
  Minus,
  AlertCircle,
  CheckCircle2,
  Search,
  Building,
  Sparkles,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { ThermalReceiptModal } from "@/components/ThermalReceipt";

interface LocationObj {
  _id: string;
  name: string;
}

interface UserObj {
  _id: string;
  name: string;
  username: string;
  role: string;
}

interface CustomerObj {
  _id: string;
  name: string;
  phone: string;
}

interface ProductObj {
  _id: string;
  name: string;
  sku: string;
  barcode: string;
  condition: string;
  sellingPrice: number;
  minSellingPrice: number;
  costPrice: number;
  serialTracking: boolean;
}

interface CartItem {
  product: ProductObj;
  quantity: number;
  unitPrice: number;
  minSellingPrice: number;
  discountAmount: number;
  serialNumbers: string[];
}

export default function POSPage() {
  const [user, setUser] = useState<UserObj | null>(null);
  const [locations, setLocations] = useState<LocationObj[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [salesmen, setSalesmen] = useState<UserObj[]>([]);
  const [selectedSalesman, setSelectedSalesman] = useState<string>("");
  const [customers, setCustomers] = useState<CustomerObj[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>("");

  // Creation Mode
  const [creationMode, setCreationMode] = useState<"SALESMAN_CHECKOUT" | "WAREHOUSE_QUICK_SALE" | "DIRECT_COUNTER">("DIRECT_COUNTER");

  // Barcode Scan & Search
  const [scanInput, setScanInput] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [headerDiscount, setHeaderDiscount] = useState<number>(0);
  const [deliveryCharges, setDeliveryCharges] = useState<number>(0);

  // Serial Selection Modal
  const [serialModalItem, setSerialModalItem] = useState<{ index: number; product: ProductObj; requiredCount: number } | null>(null);
  const [availableSerials, setAvailableSerials] = useState<string[]>([]);
  const [selectedSerials, setSelectedSerials] = useState<string[]>([]);

  // Checkout & Payment Modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAllocations, setPaymentAllocations] = useState<{ method: "CASH" | "CARD" | "BANK_TRANSFER"; amount: number; referenceNumber?: string }[]>([
    { method: "CASH", amount: 0 },
  ]);
  const [cashTendered, setCashTendered] = useState<number>(0);

  // Completed Receipt Modal
  const [completedReceiptData, setCompletedReceiptData] = useState<any>(null);

  // State Feedback
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const scanInputRef = useRef<HTMLInputElement>(null);

  // Initial Session & Data Fetching
  useEffect(() => {
    const initData = async () => {
      try {
        const meRes = await fetch("/api/auth/me");
        const meData = await meRes.json();
        if (meData.success) {
          setUser(meData.data);
          if (meData.data.role === "Salesman") {
            setCreationMode("SALESMAN_CHECKOUT");
            setSelectedSalesman(meData.data._id);
          }
        }

        const locRes = await fetch("/api/locations");
        const locData = await locRes.json();
        if (locData.success && locData.data.length > 0) {
          setLocations(locData.data);
          setSelectedLocation(locData.data[0]._id);
        }

        const usersRes = await fetch("/api/users/active");
        const usersData = await usersRes.json();
        if (usersData.success) {
          const salesList = usersData.data.filter((u: any) => u.role === "Salesman" || u.role === "Admin");
          setSalesmen(salesList);
        }

        const custRes = await fetch("/api/customers");
        const custData = await custRes.json();
        if (custData.success) {
          setCustomers(custData.data);
        }
      } catch (err: any) {
        console.error("Failed to load POS init data", err);
      }
    };
    initData();
  }, []);

  // Auto-focus barcode input
  useEffect(() => {
    if (scanInputRef.current) {
      scanInputRef.current.focus();
    }
  }, [cart]);

  // Handle Scan / Resolve Code
  const handleScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanInput.trim()) return;

    setError("");
    const code = scanInput.trim();
    setScanInput("");

    try {
      const scanRes = await fetch(`/api/barcodes/scan?barcode=${encodeURIComponent(code)}`);
      const scanData = await scanRes.json();

      if (!scanRes.ok || !scanData.success) {
        setError(scanData.error || `Code '${code}' not found.`);
        return;
      }

      const p: ProductObj = {
        _id: scanData.data.product._id,
        name: scanData.data.product.name,
        sku: scanData.data.product.sku,
        barcode: scanData.data.product.barcode,
        condition: scanData.data.product.condition,
        sellingPrice: scanData.data.product.sellingPrice,
        minSellingPrice: scanData.data.product.minSellingPrice,
        costPrice: scanData.data.product.costPrice || 0,
        serialTracking: scanData.data.product.serialTracking,
      };

      // Check if item scanned was a specific Serial Number
      const scannedSerial = scanData.data.serialDetails?.serialNumber;

      setCart((prev) => {
        const existingIdx = prev.findIndex((item) => item.product._id === p._id);
        if (existingIdx >= 0) {
          const updated = [...prev];
          const item = updated[existingIdx];
          const newQty = item.quantity + 1;

          let newSerials = [...item.serialNumbers];
          if (scannedSerial && !newSerials.includes(scannedSerial)) {
            newSerials.push(scannedSerial);
          }

          updated[existingIdx] = {
            ...item,
            quantity: newQty,
            serialNumbers: newSerials,
          };
          return updated;
        } else {
          return [
            ...prev,
            {
              product: p,
              quantity: 1,
              unitPrice: p.sellingPrice,
              minSellingPrice: p.minSellingPrice,
              discountAmount: 0,
              serialNumbers: scannedSerial ? [scannedSerial] : [],
            },
          ];
        }
      });
    } catch (err: any) {
      setError("Network error resolving scanned code.");
    }
  };

  // Cart Calculations
  const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity - item.discountAmount, 0);
  const totalAmount = Math.max(0, subtotal - headerDiscount + deliveryCharges);

  // Update item quantity
  const updateQuantity = (index: number, delta: number) => {
    setCart((prev) => {
      const updated = [...prev];
      const item = updated[index];
      const newQty = item.quantity + delta;
      if (newQty <= 0) {
        return updated.filter((_, i) => i !== index);
      }
      updated[index] = { ...item, quantity: newQty };
      return updated;
    });
  };

  // Open payment modal
  const openPaymentModal = () => {
    setError("");
    if (cart.length === 0) {
      setError("Cart is empty.");
      return;
    }

    // Minimum Selling Price Guard Check
    for (const item of cart) {
      const effectivePrice = item.unitPrice - item.discountAmount / item.quantity;
      if (effectivePrice < item.minSellingPrice - 1) {
        setError(
          `Price Violation: '${item.product.name}' price (Rs. ${Math.round(effectivePrice)}) is below Minimum Selling Price (Rs. ${item.minSellingPrice}).`
        );
        return;
      }

      if (item.product.serialTracking && item.serialNumbers.length !== item.quantity) {
        setError(
          `Serial Violation: '${item.product.name}' requires exact ${item.quantity} serial numbers, but ${item.serialNumbers.length} were selected.`
        );
        return;
      }
    }

    setPaymentAllocations([{ method: "CASH", amount: totalAmount }]);
    setCashTendered(totalAmount);
    setShowPaymentModal(true);
  };

  // Execute Direct POS Checkout & Sale Completion
  const executePOSCheckout = async () => {
    if (!selectedLocation) {
      setError("Please select a location.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const payload = {
        creationMode,
        saleSource: creationMode === "SALESMAN_CHECKOUT" ? "SALESMAN" : "DIRECT_COUNTER",
        locationId: selectedLocation,
        salesmanId: selectedSalesman || undefined,
        customerId: selectedCustomer || undefined,
        items: cart.map((item) => ({
          productId: item.product._id,
          condition: item.product.condition,
          quantity: item.quantity,
          serialNumbers: item.serialNumbers,
          unitPrice: item.unitPrice,
          discountAmount: item.discountAmount,
        })),
        discountAmount: headerDiscount,
        deliveryCharges,
        directComplete: true, // Express 1-click completion
        paymentAllocations,
      };

      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Failed to complete POS sale.");
        return;
      }

      // Completed Successfully
      setShowPaymentModal(false);
      setCart([]);
      setHeaderDiscount(0);
      setDeliveryCharges(0);
      setSuccessMsg(`Sale ${data.data.saleNumber} completed successfully!`);

      // Prepare receipt data
      setCompletedReceiptData({
        invoiceNumber: data.invoice?.invoiceNumber || data.data.saleNumber,
        date: new Date(),
        locationName: locations.find((l) => l._id === selectedLocation)?.name || "Warehouse",
        cashierName: user?.name || "Cashier",
        salesmanName: salesmen.find((s) => s._id === selectedSalesman)?.name,
        customerName: customers.find((c) => c._id === selectedCustomer)?.name,
        items: data.data.items,
        subtotal: data.data.subtotal,
        discountAmount: data.data.discountAmount,
        deliveryCharges: data.data.deliveryCharges,
        totalAmount: data.data.totalAmount,
        paidAmount: data.data.totalPaid,
        changeDue: Math.max(0, cashTendered - totalAmount),
        payments: paymentAllocations,
      });
    } catch (err: any) {
      setError(err.message || "Network error completing sale.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top POS Nav Bar */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600/20 text-indigo-400 rounded-xl flex items-center justify-center border border-indigo-500/30">
            <ScanBarcode className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-slate-100 flex items-center gap-2">
              PGS POS Counter Terminal
              <span className="text-[10px] font-extrabold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded">
                Live ACID Mode
              </span>
            </h1>
            <p className="text-xs text-slate-400">Multi-Branch Real-Time Express POS & Inventory</p>
          </div>
        </div>

        {/* Location & Mode Selectors */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl">
            <Building className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="bg-transparent text-slate-200 text-xs focus:outline-none font-semibold cursor-pointer"
            >
              {locations.map((loc) => (
                <option key={loc._id} value={loc._id} className="bg-slate-900 text-slate-200">
                  {loc.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl">
            <User className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedSalesman}
              onChange={(e) => setSelectedSalesman(e.target.value)}
              className="bg-transparent text-slate-200 text-xs focus:outline-none font-semibold cursor-pointer"
            >
              <option value="" className="bg-slate-900 text-slate-400">Direct Counter (No Salesman)</option>
              {salesmen.map((s) => (
                <option key={s._id} value={s._id} className="bg-slate-900 text-slate-200">
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <Link
            href="/inventory"
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl border border-slate-700 transition"
          >
            Directory
          </Link>
        </div>
      </header>

      {/* Main Dual-Pane POS Body */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 max-w-7xl mx-auto w-full">
        {/* Left Column: Barcode Scanner & Search */}
        <div className="lg:col-span-7 space-y-6 flex flex-col">
          {/* Scanner Input Bar */}
          <form onSubmit={handleScanSubmit} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-md">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-2">
              <ScanBarcode className="w-4 h-4 text-indigo-400" />
              Scan Barcode / Serial Number (Auto-Focused)
            </label>
            <div className="relative">
              <input
                ref={scanInputRef}
                type="text"
                placeholder="Scan product barcode, SKU, or serial number..."
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 font-mono focus:outline-none focus:border-indigo-500 transition shadow-inner"
              />
              <button
                type="submit"
                className="absolute right-2 top-2 bottom-2 px-4 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition"
              >
                Scan / Add
              </button>
            </div>
          </form>

          {/* Feedback Messages */}
          {error && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-2xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {successMsg && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-2xl text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Mode Selector */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-4">
            <span className="text-xs font-bold text-slate-400">Creation Mode:</span>
            <div className="flex gap-2">
              {[
                { id: "DIRECT_COUNTER", label: "Direct Counter" },
                { id: "SALESMAN_CHECKOUT", label: "Salesman Queue" },
                { id: "WAREHOUSE_QUICK_SALE", label: "Quick Sale" },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setCreationMode(m.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    creationMode === m.id
                      ? "bg-indigo-600 text-white shadow"
                      : "bg-slate-950 text-slate-400 border border-slate-800 hover:bg-slate-800"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Live POS Cart & Checkout */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between space-y-6 shadow-xl">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-indigo-400" />
                Live POS Cart ({cart.length} items)
              </h2>
              {cart.length > 0 && (
                <button
                  onClick={() => setCart([])}
                  className="text-xs text-rose-400 hover:text-rose-300 font-semibold transition"
                >
                  Clear Cart
                </button>
              )}
            </div>

            {/* Cart Items List */}
            {cart.length === 0 ? (
              <div className="py-12 text-center text-slate-500 space-y-2">
                <ShoppingBag className="w-8 h-8 mx-auto text-slate-600" />
                <p className="text-xs font-semibold">Cart is empty. Scan items to add.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {cart.map((item, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-0.5 flex-1">
                      <div className="font-bold text-slate-200">{item.product.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {item.product.condition} • Min: Rs. {item.minSellingPrice.toLocaleString()}
                      </div>

                      {/* Serials preview if serialized */}
                      {item.product.serialTracking && (
                        <div className="text-[10px] text-indigo-300 font-mono pt-1">
                          Serials: {item.serialNumbers.length > 0 ? item.serialNumbers.join(", ") : "None selected"}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQuantity(idx, -1)}
                        className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center font-bold"
                      >
                        -
                      </button>
                      <span className="font-mono font-bold text-slate-100 w-4 text-center">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(idx, 1)}
                        className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center font-bold"
                      >
                        +
                      </button>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-slate-400">Disc:</span>
                        <input
                          type="number"
                          placeholder="0"
                          value={item.discountAmount || ""}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setCart((prev) => {
                              const updated = [...prev];
                              updated[idx] = { ...updated[idx], discountAmount: Math.max(0, val) };
                              return updated;
                            });
                          }}
                          className="w-16 bg-slate-900 border border-slate-700 text-slate-100 font-mono rounded px-1.5 py-0.5 text-[10px] text-right focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div className="font-bold text-indigo-400 font-mono text-xs">
                        Rs. {(item.unitPrice * item.quantity - item.discountAmount).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Checkout Totals Summary */}
          <div className="border-t border-slate-800 pt-4 space-y-3">
            <div className="space-y-2 text-xs font-semibold">
              <div className="flex justify-between items-center text-slate-400">
                <span>Subtotal:</span>
                <span className="font-mono text-slate-200">Rs. {subtotal.toLocaleString()}</span>
              </div>

              {/* Overall Header Discount Input */}
              <div className="flex justify-between items-center text-slate-400">
                <span className="flex items-center gap-1">
                  Overall Discount (Rs.):
                </span>
                <input
                  type="number"
                  placeholder="0"
                  value={headerDiscount || ""}
                  onChange={(e) => setHeaderDiscount(Math.max(0, Number(e.target.value)))}
                  className="w-24 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-right font-mono text-indigo-300 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Delivery Charges Input */}
              <div className="flex justify-between items-center text-slate-400">
                <span>Delivery Charges (Rs.):</span>
                <input
                  type="number"
                  placeholder="0"
                  value={deliveryCharges || ""}
                  onChange={(e) => setDeliveryCharges(Math.max(0, Number(e.target.value)))}
                  className="w-24 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-right font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-between items-center text-slate-200 pt-1 border-t border-slate-800/80">
                <span className="font-bold">Total Amount:</span>
                <span className="font-mono text-lg font-bold text-indigo-400">Rs. {totalAmount.toLocaleString()}</span>
              </div>
            </div>

            <button
              onClick={openPaymentModal}
              disabled={cart.length === 0}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/20 transition flex items-center justify-center gap-2"
            >
              <CreditCard className="w-4 h-4" />
              Proceed to Express Checkout
            </button>
          </div>
        </div>
      </div>

      {/* Payment & Checkout Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-indigo-400" />
                Payment Allocation & Checkout
              </h3>
              <button onClick={() => setShowPaymentModal(false)} className="text-slate-400 hover:text-slate-200">
                ✖
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex justify-between items-center">
                <span className="font-bold text-slate-400">Total Bill Amount:</span>
                <span className="text-lg font-mono font-extrabold text-indigo-400">Rs. {totalAmount.toLocaleString()}</span>
              </div>

              {/* Payment Allocations */}
              <div className="space-y-2">
                <label className="font-bold text-slate-300">Payment Allocations:</label>
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
                onClick={executePOSCheckout}
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/20 transition flex items-center justify-center gap-2"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Complete & Print Invoice"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Thermal Receipt Preview Modal */}
      {completedReceiptData && (
        <ThermalReceiptModal
          receiptData={completedReceiptData}
          onClose={() => setCompletedReceiptData(null)}
        />
      )}
    </div>
  );
}
