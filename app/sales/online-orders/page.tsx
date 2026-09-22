"use client";

import React, { useState, useEffect } from "react";
import {
  Globe,
  Truck,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Package,
  MapPin,
  Search,
  ChevronRight,
  Clock,
  Send,
  DollarSign,
  Plus,
  User,
  Phone,
  Tag,
  Camera,
  Barcode,
} from "lucide-react";
import { ThermalReceiptModal } from "@/components/ThermalReceipt";
import { CameraBarcodeScannerModal } from "@/components/CameraBarcodeScannerModal";

export default function OnlineOrdersPage() {
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [onlineOrders, setOnlineOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Create Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [saleSource, setSaleSource] = useState<"WHATSAPP" | "INSTAGRAM" | "PHONE" | "WEBSITE">("WHATSAPP");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [deliveryCharges, setDeliveryCharges] = useState(250);
  const [notes, setNotes] = useState("");

  // Barcode & Camera Scanner in Modal
  const [scanInput, setScanInput] = useState("");
  const [showCameraModal, setShowCameraModal] = useState(false);

  // Dispatch Modal State
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [courierName, setCourierName] = useState("TCS Express");
  const [trackingNumber, setTrackingNumber] = useState("");

  const [completedReceiptData, setCompletedReceiptData] = useState<any>(null);

  useEffect(() => {
    fetchLocations();
    fetchProducts();
  }, []);

  useEffect(() => {
    if (selectedLocation) {
      fetchOrders();
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

  const fetchOrders = async () => {
    try {
      const res = await fetch(`/api/sales?locationId=${selectedLocation}&limit=100`);
      const data = await res.json();
      if (data.success) {
        const online = data.data.filter((s: any) =>
          ["WEBSITE", "WHATSAPP", "INSTAGRAM", "PHONE"].includes(s.saleSource)
        );
        setOnlineOrders(online);
      }
    } catch {
      setError("Failed to load online orders.");
    }
  };

  // Barcode scan resolver
  const handleResolveBarcode = async (codeValue: string) => {
    const code = codeValue.trim();
    if (!code) return;

    setError("");
    setScanInput("");

    try {
      const scanRes = await fetch(`/api/barcodes/scan?barcode=${encodeURIComponent(code)}`);
      const scanData = await scanRes.json();

      if (!scanRes.ok || !scanData.success) {
        setError(scanData.error || `Barcode '${code}' not found.`);
        return;
      }

      const prod = scanData.data.product;
      setSelectedProduct(prod._id);
      setSuccessMsg(`Product scanned: '${prod.name}'`);
    } catch {
      setError("Network error scanning barcode.");
    }
  };

  const handleCreateOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) {
      setError("Please select or scan a product.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccessMsg("");

    try {
      const prod = products.find((p) => p._id === selectedProduct);
      const res = await fetch("/api/sales/online", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleSource,
          locationId: selectedLocation,
          customerName,
          customerPhone,
          deliveryCharges: Number(deliveryCharges),
          notes,
          items: [
            {
              productId: prod._id,
              quantity: Number(quantity),
              unitPrice: prod.sellingPrice,
            },
          ],
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Failed to create online order.");
        setLoading(false);
        return;
      }

      setShowCreateModal(false);
      setSuccessMsg(`New ${saleSource} Order #${data.data.saleNumber} created successfully!`);
      setCustomerName("");
      setCustomerPhone("");
      setSelectedProduct("");
      setNotes("");
      fetchOrders();
    } catch (err: any) {
      setError(err.message || "Network error creating online order.");
    } finally {
      setLoading(false);
    }
  };

  const handlePickPack = async (orderId: string) => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/sales/online", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleId: orderId,
          action: "PICK_PACK",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Failed to pick & pack order.");
        setLoading(false);
        return;
      }

      setSuccessMsg("Order picked & packed. Stock reserved!");
      fetchOrders();
    } catch (err: any) {
      setError(err.message || "Network error updating order.");
    } finally {
      setLoading(false);
    }
  };

  const handleDispatchOrder = async () => {
    if (!selectedOrder) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/sales/online", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleId: selectedOrder._id,
          action: "DISPATCH",
          courierName,
          trackingNumber,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Failed to dispatch order.");
        setLoading(false);
        return;
      }

      setShowDispatchModal(false);
      setSuccessMsg(`Order #${selectedOrder.saleNumber} dispatched via ${courierName}!`);
      fetchOrders();
    } catch (err: any) {
      setError(err.message || "Network error dispatching order.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeliveredAndCODSettled = async (orderId: string) => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/sales/online", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleId: orderId,
          action: "DELIVERED_COMPLETE",
          paymentMethod: "CASH",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Failed to mark COD delivered & completed.");
        setLoading(false);
        return;
      }

      setSuccessMsg("COD Cash Settled & Inventory SALE_OUT executed!");
      setCompletedReceiptData(data.data.receiptData);
      fetchOrders();
    } catch (err: any) {
      setError(err.message || "Network error settling COD order.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100">Online Orders & COD Dispatch Queue</h1>
            <p className="text-xs text-slate-400">
              Manage Website, WhatsApp, & Phone Orders (Reservation ➔ Dispatch ➔ COD Settlement)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Create New Online Order Button */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-cyan-600/20 transition flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Create Online Order</span>
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

          <button
            onClick={fetchOrders}
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

      {/* Orders Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-xl">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Online Orders Queue ({onlineOrders.length})
        </span>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="p-3">Order #</th>
                <th className="p-3">Source</th>
                <th className="p-3">Customer</th>
                <th className="p-3 text-right">Total Bill</th>
                <th className="p-3 text-center">Current Status</th>
                <th className="p-3 text-center">Workflow Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {onlineOrders.map((ord) => (
                <tr key={ord._id} className="hover:bg-slate-950/50">
                  <td className="p-3 font-bold text-cyan-400">{ord.saleNumber}</td>
                  <td className="p-3 font-sans">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                      {ord.saleSource}
                    </span>
                  </td>
                  <td className="p-3 font-sans">
                    <div className="font-bold text-slate-200">{ord.customerName || "Online Guest"}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{ord.customerPhone}</div>
                  </td>
                  <td className="p-3 text-right font-bold text-emerald-400">
                    Rs. {ord.totalAmount.toLocaleString()}
                  </td>
                  <td className="p-3 text-center font-sans">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        ord.status === "COMPLETED"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : ord.status === "PAYMENT_PENDING"
                          ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                          : ord.status === "CHECKOUT"
                          ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {ord.status === "DRAFT"
                        ? "ORDER_RECEIVED"
                        : ord.status === "CHECKOUT"
                        ? "PICKED_&_PACKED (RESERVED)"
                        : ord.status === "PAYMENT_PENDING"
                        ? "DISPATCHED"
                        : ord.status}
                    </span>
                  </td>
                  <td className="p-3 text-center font-sans">
                    {ord.status === "DRAFT" && (
                      <button
                        onClick={() => handlePickPack(ord._id)}
                        disabled={loading}
                        className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold text-[10px] shadow flex items-center gap-1 mx-auto"
                      >
                        <Package className="w-3 h-3" />
                        Pick & Pack (Reserve)
                      </button>
                    )}

                    {ord.status === "CHECKOUT" && (
                      <button
                        onClick={() => {
                          setSelectedOrder(ord);
                          setShowDispatchModal(true);
                        }}
                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-[10px] shadow flex items-center gap-1 mx-auto"
                      >
                        <Send className="w-3 h-3" />
                        Dispatch Courier
                      </button>
                    )}

                    {ord.status === "PAYMENT_PENDING" && (
                      <button
                        onClick={() => handleDeliveredAndCODSettled(ord._id)}
                        disabled={loading}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-[10px] shadow flex items-center gap-1 mx-auto"
                      >
                        <DollarSign className="w-3 h-3" />
                        Delivered & Settle COD (SALE_OUT)
                      </button>
                    )}

                    {ord.status === "COMPLETED" && (
                      <span className="text-[10px] text-slate-500 font-bold">Fulfilled & Settled</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create New Online Order Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Globe className="w-4 h-4 text-cyan-400" />
                Create New Online / COD Order
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-200">
                ✖
              </button>
            </div>

            <form onSubmit={handleCreateOrderSubmit} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Order Source Channel:</label>
                <select
                  value={saleSource}
                  onChange={(e) => setSaleSource(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 text-cyan-300 font-bold rounded-xl px-3 py-2"
                >
                  <option value="WHATSAPP">WhatsApp 🟢</option>
                  <option value="INSTAGRAM">Instagram DM 🟣</option>
                  <option value="PHONE">Phone Call 📞</option>
                  <option value="WEBSITE">Website 🌐</option>
                </select>
              </div>

              {/* Barcode & Camera Quick Scanner */}
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                  <Barcode className="w-3.5 h-3.5 text-cyan-400" />
                  Quick Scan Product (Optional):
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="Scan barcode..."
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleResolveBarcode(scanInput);
                      }
                    }}
                    className="flex-1 bg-slate-900 border border-slate-700 text-slate-100 font-mono text-xs rounded-lg px-2.5 py-1"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCameraModal(true)}
                    className="px-2 py-1 bg-indigo-600 text-white rounded-lg text-xs"
                    title="Camera Scan"
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Select Product:</label>
                <select
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl px-3 py-2"
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

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Customer Name:</label>
                  <input
                    type="text"
                    placeholder="Usman Ali"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-3 py-2"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Customer Phone:</label>
                  <input
                    type="text"
                    placeholder="0300-9876543"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 font-mono rounded-xl px-3 py-2"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Quantity:</label>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 font-mono rounded-xl px-3 py-2"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Delivery Fee (PKR):</label>
                  <input
                    type="number"
                    min="0"
                    value={deliveryCharges}
                    onChange={(e) => setDeliveryCharges(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 font-mono rounded-xl px-3 py-2"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Delivery Address / Notes:</label>
                <textarea
                  placeholder="e.g. House #12, Street 5, Gulberg, Lahore"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-3 py-2 h-16 text-xs"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 font-semibold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-600/20 transition flex items-center justify-center gap-2"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Create & Queue Order"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dispatch Modal */}
      {showDispatchModal && selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Truck className="w-4 h-4 text-cyan-400" />
                Dispatch Order ({selectedOrder.saleNumber})
              </h3>
              <button onClick={() => setShowDispatchModal(false)} className="text-slate-400 hover:text-slate-200">
                ✖
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Courier Service:</label>
                <input
                  type="text"
                  value={courierName}
                  onChange={(e) => setCourierName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-3 py-2"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Tracking Number:</label>
                <input
                  type="text"
                  placeholder="e.g. TCS-99882200"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 font-mono rounded-xl px-3 py-2"
                  required
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowDispatchModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 font-semibold text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleDispatchOrder}
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-600/20 transition flex items-center justify-center gap-2"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Confirm Dispatch"}
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
