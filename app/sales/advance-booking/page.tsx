"use client";

import React, { useState, useEffect } from "react";
import {
  Calendar,
  Clock,
  User,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Search,
  CreditCard,
  MapPin,
  Tag,
  DollarSign,
  Camera,
  Barcode,
  Sparkles,
} from "lucide-react";
import { ThermalReceiptModal } from "@/components/ThermalReceipt";
import { CameraBarcodeScannerModal } from "@/components/CameraBarcodeScannerModal";

export default function AdvanceBookingPage() {
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [products, setProducts] = useState<any[]>([]);
  const [advanceBookings, setAdvanceBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Barcode & Camera Scanner State
  const [scanInput, setScanInput] = useState("");
  const [scannedProductInfo, setScannedProductInfo] = useState<any | null>(null);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [scannedSerialNumbers, setScannedSerialNumbers] = useState<string[]>([]);

  // Create Form State
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [advanceAmount, setAdvanceAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD" | "BANK_TRANSFER">("CASH");

  // Clearance Modal State
  const [selectedBooking, setSelectedBooking] = useState<any | null>(null);
  const [showClearanceModal, setShowClearanceModal] = useState(false);
  const [completedReceiptData, setCompletedReceiptData] = useState<any>(null);

  useEffect(() => {
    fetchLocations();
    fetchProducts();
  }, []);

  useEffect(() => {
    if (selectedLocation) {
      fetchBookings();
    }
  }, [selectedLocation]);

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
      const res = await fetch("/api/products?limit=100");
      const data = await res.json();
      if (data.success) {
        setProducts(data.data);
      }
    } catch {
      setError("Failed to load products.");
    }
  };

  const fetchBookings = async () => {
    try {
      const res = await fetch(`/api/sales?locationId=${selectedLocation}&limit=100`);
      const data = await res.json();
      if (data.success) {
        const advances = data.data.filter((s: any) => s.saleSource === "ADVANCE_BOOKING");
        setAdvanceBookings(advances);
      }
    } catch {
      setError("Failed to load advance bookings.");
    }
  };

  // Resolve Barcode / Serial Number
  const handleResolveBarcode = async (codeValue: string) => {
    const code = codeValue.trim();
    if (!code) return;

    setError("");
    setScanInput("");

    try {
      const scanRes = await fetch(`/api/barcodes/scan?barcode=${encodeURIComponent(code)}`);
      const scanData = await scanRes.json();

      if (!scanRes.ok || !scanData.success) {
        setError(scanData.error || `Barcode / Serial '${code}' not found.`);
        return;
      }

      const prod = scanData.data.product;
      setSelectedProduct(prod._id);
      setScannedProductInfo(prod);

      // Record scanned serial number if applicable
      const serial = scanData.data.serialDetails?.serialNumber;
      if (serial) {
        setScannedSerialNumbers((prev) =>
          prev.includes(serial) ? prev : [...prev, serial]
        );
      }

      setSuccessMsg(`Product scanned: '${prod.name}' (Rs. ${prod.sellingPrice.toLocaleString()})`);
    } catch {
      setError("Network error scanning barcode.");
    }
  };

  const handleScanFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleResolveBarcode(scanInput);
  };

  const handleCreateAdvanceBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) {
      setError("Please select or scan a product.");
      return;
    }
    if (advanceAmount <= 0) {
      setError("Advance down-payment must be greater than 0.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccessMsg("");

    try {
      const prod = products.find((p) => p._id === selectedProduct) || scannedProductInfo;
      const res = await fetch("/api/sales/advance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId: selectedLocation,
          customerName,
          customerPhone,
          advanceAmount: Number(advanceAmount),
          paymentMethod,
          items: [
            {
              productId: prod._id,
              quantity: Number(quantity),
              unitPrice: prod.sellingPrice,
              serialNumbers: scannedSerialNumbers,
            },
          ],
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Failed to create advance booking.");
        return;
      }

      setSuccessMsg(`Advance Booking #${data.data.sale.saleNumber} created successfully! Stock reserved.`);
      setCustomerName("");
      setCustomerPhone("");
      setAdvanceAmount(0);
      setScannedProductInfo(null);
      setScannedSerialNumbers([]);
      setSelectedProduct("");
      fetchBookings();
    } catch (err: any) {
      setError(err.message || "Network error creating advance booking.");
    } finally {
      setLoading(false);
    }
  };

  const handleFinalPickupClearance = async () => {
    if (!selectedBooking) return;
    setLoading(true);
    setError("");

    try {
      const balanceDue = selectedBooking.totalAmount - selectedBooking.totalPaid;
      const res = await fetch("/api/sales/advance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleId: selectedBooking._id,
          remainingPaymentAllocations: [{ method: "CASH", amount: balanceDue }],
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Failed to complete pickup clearance.");
        setLoading(false);
        return;
      }

      setShowClearanceModal(false);
      setCompletedReceiptData(data.data.receiptData);
      fetchBookings();
    } catch (err: any) {
      setError(err.message || "Network error clearing advance booking.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center font-bold">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100">Advance Booking & Stock Reservation</h1>
            <p className="text-xs text-slate-400">
              Barcode / Camera Scan Product ➔ Collect Down-Payment ➔ Reserve Stock
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
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

          <button
            onClick={fetchBookings}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
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

      {successMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Create Form with Barcode & Camera Scanner */}
        <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
          <span className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
            <Tag className="w-4 h-4" />
            New Advance Booking
          </span>

          {/* Barcode & Camera Scanner Bar */}
          <div className="space-y-1 bg-slate-950 p-3 rounded-xl border border-slate-800">
            <label className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
              <Barcode className="w-3.5 h-3.5 text-purple-400" />
              Scan Barcode / Serial Number:
            </label>

            <div className="flex gap-1.5">
              <form onSubmit={handleScanFormSubmit} className="flex-1 flex gap-1">
                <input
                  type="text"
                  placeholder="Scan barcode or serial..."
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 text-slate-100 font-mono text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-purple-500"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-lg transition shrink-0"
                >
                  Scan
                </button>
              </form>

              {/* Camera Scanner Trigger Button */}
              <button
                type="button"
                onClick={() => setShowCameraModal(true)}
                className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition flex items-center justify-center shrink-0"
                title="Scan via Camera"
              >
                <Camera className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Scanned Product Info Badge */}
          {scannedProductInfo && (
            <div className="bg-purple-950/40 border border-purple-500/30 p-3 rounded-xl space-y-1 text-xs">
              <div className="flex items-center gap-1.5 text-purple-300 font-bold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Scanned: {scannedProductInfo.name}</span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono">
                SKU: {scannedProductInfo.sku} • Price: Rs. {scannedProductInfo.sellingPrice.toLocaleString()}
              </p>
              {scannedSerialNumbers.length > 0 && (
                <p className="text-[10px] text-indigo-300 font-mono">
                  Serials: {scannedSerialNumbers.join(", ")}
                </p>
              )}
            </div>
          )}

          <form onSubmit={handleCreateAdvanceBooking} className="space-y-3 text-xs">
            <div className="space-y-1">
              <label className="text-slate-300 font-semibold">Customer Name:</label>
              <input
                type="text"
                placeholder="e.g. Adeel Khan"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-300 font-semibold">Customer Phone:</label>
              <input
                type="text"
                placeholder="0300-1234567"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-slate-100 font-mono rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-300 font-semibold">Or Select Product from List:</label>
              <select
                value={selectedProduct}
                onChange={(e) => {
                  setSelectedProduct(e.target.value);
                  const prod = products.find((p) => p._id === e.target.value);
                  setScannedProductInfo(prod || null);
                }}
                className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
                required
              >
                <option value="">-- Choose Product --</option>
                {products.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name} (Rs. {p.sellingPrice.toLocaleString()})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Quantity:</label>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 font-mono rounded-xl px-3 py-2 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Payment Method:</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl px-2 py-2 focus:outline-none"
                >
                  <option value="CASH">Cash 💵</option>
                  <option value="CARD">Card 💳</option>
                  <option value="BANK_TRANSFER">Bank 🏦</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-slate-300 font-semibold">Advance Down-Payment (PKR):</label>
              <input
                type="number"
                min="1"
                placeholder="e.g. 10000"
                value={advanceAmount || ""}
                onChange={(e) => setAdvanceAmount(Number(e.target.value))}
                className="w-full bg-slate-950 border border-purple-500/40 text-purple-300 font-mono text-sm font-bold rounded-xl px-3 py-2 focus:outline-none focus:border-purple-500"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-purple-600/20 transition flex items-center justify-center gap-2 pt-2"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Create & Reserve Stock"}
            </button>
          </form>
        </div>

        {/* Right: Active Bookings Table */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-xl">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Active Reserved Advance Bookings ({advanceBookings.length})
          </span>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="p-3">Booking #</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3 text-right">Total Price</th>
                  <th className="p-3 text-right">Advance Paid</th>
                  <th className="p-3 text-right">Balance Due</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {advanceBookings.map((b) => {
                  const balanceDue = b.totalAmount - b.totalPaid;
                  return (
                    <tr key={b._id} className="hover:bg-slate-950/50">
                      <td className="p-3 font-bold text-purple-400">{b.saleNumber}</td>
                      <td className="p-3 font-sans">
                        <div className="font-bold text-slate-200">{b.customerName || "Walk-in"}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{b.customerPhone}</div>
                      </td>
                      <td className="p-3 text-right text-slate-300">Rs. {b.totalAmount.toLocaleString()}</td>
                      <td className="p-3 text-right text-emerald-400">Rs. {b.totalPaid.toLocaleString()}</td>
                      <td className="p-3 text-right font-bold text-rose-400">
                        Rs. {balanceDue.toLocaleString()}
                      </td>
                      <td className="p-3 text-center font-sans">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          b.status === "COMPLETED"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        }`}>
                          {b.status}
                        </span>
                      </td>
                      <td className="p-3 text-center font-sans">
                        {b.status !== "COMPLETED" ? (
                          <button
                            onClick={() => {
                              setSelectedBooking(b);
                              setShowClearanceModal(true);
                            }}
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-[10px] shadow"
                          >
                            Collect Pickup Balance
                          </button>
                        ) : (
                          <span className="text-slate-500 text-[10px]">Delivered</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Final Pickup Clearance Modal */}
      {showClearanceModal && selectedBooking && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-400" />
                Customer Pickup Clearance ({selectedBooking.saleNumber})
              </h3>
              <button onClick={() => setShowClearanceModal(false)} className="text-slate-400 hover:text-slate-200">
                ✖
              </button>
            </div>

            <div className="space-y-3 text-xs font-mono bg-slate-950 p-4 rounded-xl border border-slate-800">
              <div className="flex justify-between text-slate-400">
                <span>Total Order Price:</span>
                <span>Rs. {selectedBooking.totalAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-emerald-400">
                <span>Advance Already Paid:</span>
                <span>- Rs. {selectedBooking.totalPaid.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-slate-100 font-bold text-sm pt-2 border-t border-slate-800">
                <span>Remaining Balance Collection:</span>
                <span className="text-rose-400">
                  Rs. {(selectedBooking.totalAmount - selectedBooking.totalPaid).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowClearanceModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 font-semibold text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleFinalPickupClearance}
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/20 transition flex items-center justify-center gap-2"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Collect & Print Final Tax Invoice"}
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

      {/* Camera Barcode Scanner Modal */}
      <CameraBarcodeScannerModal
        isOpen={showCameraModal}
        onClose={() => setShowCameraModal(false)}
        onScanSuccess={(codeValue) => {
          setShowCameraModal(false);
          handleResolveBarcode(codeValue);
        }}
      />
    </div>
  );
}
