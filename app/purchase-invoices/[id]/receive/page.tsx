"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Truck,
  Layers,
  Barcode as BarcodeIcon,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle,
  Save,
  Send,
  X,
} from "lucide-react";
import { ToastContainer, ToastMessage } from "@/components/Toast";

interface LocationOption {
  _id: string;
  name: string;
  code: string;
}

interface InvoiceItem {
  product: { _id: string; name: string; brand?: string; modelNumber?: string; model?: string; color?: string; sku: string; barcode: string; serialTracking: boolean };
  name: string;
  brand?: string;
  modelNumber?: string;
  color?: string;
  sku: string;
  barcode: string;
  condition: string;
  quantity: number;
}

interface ReceivingItemState {
  product: string;
  name: string;
  brand?: string;
  modelNumber?: string;
  color?: string;
  sku: string;
  barcode: string;
  condition: string;
  orderedQty: number;
  previouslyReceivedQty: number;
  outstandingQty: number;
  quantityReceived: number; // Current receiving session qty
  serialNumbers: string[]; // Scanned serials in this session
  serialTracking: boolean;
}

export default function PurchaseReceivingPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const invoiceId = params?.id as string;
  const receivingId = searchParams?.get("receivingId") || "";

  // Page States
  const [invoice, setInvoice] = useState<any | null>(null);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [itemsState, setItemsState] = useState<ReceivingItemState[]>([]);

  // Scanning Inputs
  const [productBarcode, setProductBarcode] = useState("");
  const [activeSerialInputIndex, setActiveSerialInputIndex] = useState<number | null>(null);
  const [serialInput, setSerialInput] = useState("");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [userRole, setUserRole] = useState("");
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Refs for focusing
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const serialInputRef = useRef<HTMLInputElement>(null);

  const addToast = (type: "success" | "error" | "info", text: string) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, type, text }]);
  };
  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Fetch session & role
  const fetchSession = async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      if (data.success) {
        setUserRole(data.data.role);
        if (data.data.role !== "Admin" && data.data.role !== "Warehouse") {
          setError("Access Denied. Only Admin and Warehouse users can perform physical receiving.");
        }
      }
    } catch {
      setError("Failed to verify authorization session.");
    }
  };

  // Fetch locations
  const fetchLocations = async () => {
    try {
      const res = await fetch("/api/locations?activeOnly=true");
      const data = await res.json();
      if (data.success) {
        setLocations(data.data);
        if (data.data.length > 0) {
          // Default to Warehouse if available
          const wh = data.data.find((l: any) => l.code === "WH");
          setSelectedLocation(wh ? wh._id : data.data[0]._id);
        }
      }
    } catch {
      console.error("Failed to load locations");
    }
  };

  // Main Loader
  useEffect(() => {
    if (invoiceId) {
      const loadAll = async () => {
        setLoading(true);
        await fetchSession();
        await fetchLocations();

        try {
          // 1. Fetch Invoice Details
          const invRes = await fetch(`/api/purchase-invoices/${invoiceId}`);
          const invData = await invRes.json();

          if (!invData.success) {
            setError(invData.error || "Failed to load purchase invoice.");
            setLoading(false);
            return;
          }
          setInvoice(invData.data);

          // 2. Fetch previously approved receivings
          const prevRes = await fetch(`/api/purchase-receivings?purchaseInvoice=${invoiceId}&status=Approved`);
          const prevData = await prevRes.json();
          const prevApprovedList = prevData.success ? prevData.data : [];

          const previouslyReceivedQtyMap: Record<string, number> = {};
          for (const rec of prevApprovedList) {
            for (const item of rec.items) {
              const pStr = item.product.toString();
              previouslyReceivedQtyMap[pStr] = (previouslyReceivedQtyMap[pStr] || 0) + item.quantityReceived;
            }
          }

          // 3. Check if editing an existing receiving draft/rejected
          let preloadedItemsMap: Record<string, { qty: number; serials: string[] }> = {};
          if (receivingId) {
            const recRes = await fetch(`/api/purchase-receivings/${receivingId}`);
            const recData = await recRes.json();
            if (recData.success) {
              setSelectedLocation(recData.data.location?._id || recData.data.location || "");
              setNotes(recData.data.notes || "");
              for (const item of recData.data.items) {
                preloadedItemsMap[item.product.toString()] = {
                  qty: item.quantityReceived,
                  serials: item.serialNumbers || [],
                };
              }
            }
          }

          // 4. Assemble items states
          const assembled: ReceivingItemState[] = invData.data.items.map((line: any) => {
            const pId = line.product?._id || line.product;
            const prevQty = previouslyReceivedQtyMap[pId] || 0;
            const outstanding = Math.max(0, line.quantity - prevQty);

            // Preloaded values if editing
            const preload = preloadedItemsMap[pId] || { qty: 0, serials: [] };

            return {
              product: pId,
              name: line.name,
              brand: line.brand || line.product?.brand || "",
              modelNumber: line.modelNumber || line.product?.modelNumber || line.product?.model || "",
              color: line.color || line.product?.color || "Unspecified",
              sku: line.sku,
              barcode: line.barcode,
              condition: line.condition,
              orderedQty: line.quantity,
              previouslyReceivedQty: prevQty,
              outstandingQty: outstanding,
              quantityReceived: preload.qty,
              serialNumbers: preload.serials,
              serialTracking: line.product?.serialTracking || false,
            };
          });

          setItemsState(assembled);
        } catch {
          setError("Failed to fetch initial load data from server.");
        } finally {
          setLoading(false);
        }
      };
      loadAll();
    }
  }, [invoiceId, receivingId]);

  // Handler for product barcode scanning
  const handleProductScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productBarcode.trim()) return;

    const barcode = productBarcode.trim();
    const index = itemsState.findIndex((item) => item.barcode === barcode);

    if (index === -1) {
      addToast("error", `Product with barcode "${barcode}" does not belong to this invoice.`);
      setProductBarcode("");
      return;
    }

    const matchedItem = itemsState[index];

    if (matchedItem.outstandingQty === 0) {
      addToast("error", `Outstanding quantity for "${matchedItem.name}" is already fully received.`);
      setProductBarcode("");
      return;
    }

    if (matchedItem.serialTracking) {
      // Prompt user to scan serial number
      setActiveSerialInputIndex(index);
      setProductBarcode("");
      // Focus serial input in next tick
      setTimeout(() => {
        serialInputRef.current?.focus();
      }, 50);
      addToast("info", `Product identified: "${matchedItem.name}". Scan serial number next.`);
    } else {
      // Non-serialized: increment received count
      if (matchedItem.quantityReceived >= matchedItem.outstandingQty) {
        addToast("error", `Cannot receive more than outstanding quantity (${matchedItem.outstandingQty} units).`);
        setProductBarcode("");
        return;
      }

      setItemsState((prev) => {
        const updated = [...prev];
        updated[index] = {
          ...matchedItem,
          quantityReceived: matchedItem.quantityReceived + 1,
        };
        return updated;
      });

      addToast("success", `Added 1 unit of "${matchedItem.name}".`);
      setProductBarcode("");
    }
  };

  // Handler for serial scanning
  const handleSerialScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (activeSerialInputIndex === null || !serialInput.trim()) return;

    const serial = serialInput.trim();
    const activeItem = itemsState[activeSerialInputIndex];

    // Client-side session duplicates check
    if (activeItem.serialNumbers.includes(serial)) {
      addToast("error", `Duplicate serial number "${serial}" already scanned in this session.`);
      setSerialInput("");
      return;
    }

    // Verify other products in this session don't have it (global session check)
    let sessionDuplicate = false;
    for (const item of itemsState) {
      if (item.serialNumbers.includes(serial)) {
        sessionDuplicate = true;
        break;
      }
    }
    if (sessionDuplicate) {
      addToast("error", `Serial "${serial}" was already scanned under another item in this session.`);
      setSerialInput("");
      return;
    }

    // Verify database globally for uniqueness
    try {
      const res = await fetch(`/api/barcodes/verify-serial?serialNumber=${encodeURIComponent(serial)}`);
      const data = await res.json();
      if (data.success && data.exists) {
        addToast("error", `Serial "${serial}" already exists in the system database.`);
        setSerialInput("");
        return;
      }
    } catch {
      console.warn("Failed to check database uniqueness in real-time, relying on final submission transaction.");
    }

    // Determine state update
    setItemsState((prev) => {
      const updated = [...prev];
      const line = updated[activeSerialInputIndex];

      let newQty = line.quantityReceived;
      if (line.serialNumbers.length >= line.quantityReceived) {
        // Increment quantity if they are scanning more than current quantity
        if (line.quantityReceived >= line.outstandingQty) {
          addToast("error", `Outstanding limit of ${line.outstandingQty} reached. Cannot add serial.`);
          return prev;
        }
        newQty = line.quantityReceived + 1;
      }

      updated[activeSerialInputIndex] = {
        ...line,
        quantityReceived: newQty,
        serialNumbers: [...line.serialNumbers, serial],
      };
      return updated;
    });

    addToast("success", `Registered serial "${serial}" for "${activeItem.name}".`);
    setSerialInput("");

    // Close modal if the scanned serials list matches the current target quantity received
    setItemsState((current) => {
      const updatedItem = current[activeSerialInputIndex];
      if (updatedItem.serialNumbers.length >= updatedItem.quantityReceived) {
        setActiveSerialInputIndex(null);
        setTimeout(() => {
          barcodeInputRef.current?.focus();
        }, 50);
      }
      return current;
    });
  };

  const removeSerial = (itemIdx: number, serialIdx: number) => {
    setItemsState((prev) => {
      const updated = [...prev];
      const line = updated[itemIdx];
      const serialNumbers = line.serialNumbers.filter((_, idx) => idx !== serialIdx);
      updated[itemIdx] = {
        ...line,
        quantityReceived: Math.max(0, line.quantityReceived - 1),
        serialNumbers,
      };
      return updated;
    });
    addToast("info", "Removed serial number.");
  };

  const handleManualQtyChange = (idx: number, value: number) => {
    setItemsState((prev) => {
      const updated = [...prev];
      const line = updated[idx];
      const validVal = Math.min(line.outstandingQty, Math.max(0, value));

      if (line.serialTracking) {
        // Serial numbers count must match quantity. If quantity is reduced, truncate serial numbers list
        const serials = line.serialNumbers.slice(0, validVal);
        updated[idx] = {
          ...line,
          quantityReceived: validVal,
          serialNumbers: serials,
        };
      } else {
        updated[idx] = {
          ...line,
          quantityReceived: validVal,
        };
      }
      return updated;
    });
  };

  // Submit/Save receiving transaction
  const handleSave = async (submitForApproval = false) => {
    if (!selectedLocation) {
      setError("Please select a destination Location.");
      return;
    }

    // Filter items with quantityReceived > 0
    const itemsToSave = itemsState
      .filter((line) => line.quantityReceived > 0)
      .map((line) => ({
        product: line.product,
        name: line.name,
        sku: line.sku,
        barcode: line.barcode,
        condition: line.condition,
        quantityReceived: line.quantityReceived,
        serialNumbers: line.serialNumbers,
      }));

    if (itemsToSave.length === 0) {
      setError("Please receive at least one item (quantity > 0) before saving.");
      return;
    }

    // Validate that all serialized products have the exact matching number of serials
    for (const line of itemsState) {
      if (line.quantityReceived > 0 && line.serialTracking) {
        if (line.serialNumbers.length !== line.quantityReceived) {
          setError(`Validation Failed: "${line.name}" requires exactly ${line.quantityReceived} serial numbers, but you have scanned ${line.serialNumbers.length}.`);
          return;
        }
      }
    }

    setSubmitting(true);
    setError("");

    const payload = {
      purchaseInvoice: invoiceId,
      location: selectedLocation,
      notes: notes.trim() || undefined,
      items: itemsToSave,
      submitForApproval,
    };

    try {
      let res;
      if (receivingId) {
        // PUT edit update
        res = await fetch(`/api/purchase-receivings/${receivingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        // POST new
        res = await fetch("/api/purchase-receivings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (data.success) {
        addToast("success", submitForApproval ? "Physical receiving submitted for approval!" : "Receiving draft saved.");
        setTimeout(() => {
          router.push(`/purchase-invoices/${invoiceId}`);
          router.refresh();
        }, 1000);
      } else {
        setError(data.error || "Failed to save receiving.");
        setSubmitting(false);
      }
    } catch {
      setError("Network error. Failed to save physical receiving.");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-slate-900 border border-slate-800 rounded-xl">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-xs">Loading physical receiving form...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Link
          href={`/purchase-invoices/${invoiceId}`}
          className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Details</span>
        </Link>
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold rounded-xl flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex items-center gap-3">
        <Link
          href={`/purchase-invoices/${invoiceId}`}
          className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <Truck className="w-5 h-5 text-indigo-400" />
            <span>Physical Stock Receiving</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Receiving items for Invoice <span className="text-indigo-400 font-bold">{invoice?.invoiceNumber}</span>
          </p>
        </div>
      </div>

      {/* Serial Scanner Focus Overlay Modal (Touch friendly scanning) */}
      {activeSerialInputIndex !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xs">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 shadow-2xl relative">
            <button
              onClick={() => {
                setActiveSerialInputIndex(null);
                barcodeInputRef.current?.focus();
              }}
              className="absolute top-3 right-3 p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="text-center space-y-1">
              <span className="text-[10px] font-extrabold uppercase text-indigo-400 tracking-wider">
                Serialized Scan In Progress
              </span>
              <h3 className="text-sm font-bold text-slate-100">{itemsState[activeSerialInputIndex].name}</h3>
              <p className="text-[11px] text-slate-400">
                Outstanding: {itemsState[activeSerialInputIndex].outstandingQty} | Current Session Scanned:{" "}
                {itemsState[activeSerialInputIndex].quantityReceived}
              </p>
            </div>

            <form onSubmit={handleSerialScanSubmit} className="space-y-3">
              <input
                ref={serialInputRef}
                type="text"
                placeholder="Scan / enter serial number..."
                value={serialInput}
                onChange={(e) => setSerialInput(e.target.value)}
                className="w-full px-3 py-3 bg-slate-950 border border-slate-800 rounded-lg text-sm text-center text-slate-200 focus:outline-none focus:border-indigo-500 font-mono tracking-wider"
              />
              <button
                type="submit"
                className="w-full py-2.5 bg-indigo-650 hover:bg-indigo-600 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                Confirm Serial
              </button>
            </form>

            {/* List of scanned serials in this overlay for reference */}
            {itemsState[activeSerialInputIndex].serialNumbers.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-850">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">
                  Scanned in this session:
                </span>
                <div className="max-h-28 overflow-y-auto space-y-1.5 scrollbar-thin">
                  {itemsState[activeSerialInputIndex].serialNumbers.map((sn, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-slate-950 px-2 py-1 border border-slate-850 rounded text-[10px] font-mono text-slate-300">
                      <span>{sn}</span>
                      <button
                        onClick={() => removeSerial(activeSerialInputIndex, idx)}
                        className="text-rose-500 hover:text-rose-400"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Receiving Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left column: Scanning & Product List */}
        <div className="lg:col-span-2 space-y-6">
          {/* Main Product Barcode Scan Box */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 shadow-sm">
            <h2 className="text-xs font-bold text-slate-350 uppercase tracking-wider flex items-center gap-2">
              <BarcodeIcon className="w-4 h-4 text-indigo-400" />
              <span>Step 1: Scan Product Barcode First</span>
            </h2>

            <form onSubmit={handleProductScanSubmit} className="flex gap-2">
              <input
                ref={barcodeInputRef}
                type="text"
                placeholder="Click here and scan product barcode..."
                value={productBarcode}
                onChange={(e) => setProductBarcode(e.target.value)}
                autoFocus
                className="flex-1 px-3 py-2 bg-slate-950 border border-slate-850 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-slate-800 border border-slate-700 hover:bg-slate-750 text-indigo-400 hover:text-indigo-300 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Scan Product
              </button>
            </form>
          </div>

          {/* Items checklist */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 shadow-sm">
            <h2 className="text-xs font-bold text-slate-350 uppercase tracking-wider border-b border-slate-800 pb-2 flex justify-between items-center">
              <span>Step 2: Physical Receiving Stock List</span>
              <span className="text-[10px] text-slate-500 font-bold uppercase">
                Showing quantities received in this session
              </span>
            </h2>

            <div className="divide-y divide-slate-850 space-y-4">
              {itemsState.map((line, idx) => (
                <div key={line.product} className="pt-4 first:pt-0 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-slate-200 text-xs">{line.name}</h4>
                        <span className="px-1.5 py-0.2 text-[8px] font-bold bg-slate-800 text-slate-400 rounded uppercase">
                          {line.condition}
                        </span>
                        <span className="px-1.5 py-0.2 text-[8px] font-bold bg-purple-500/10 text-purple-300 border border-purple-500/20 rounded uppercase">
                          Color: {line.color || "Unspecified"}
                        </span>
                        {line.serialTracking && (
                          <span className="px-1.5 py-0.2 text-[8px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded uppercase">
                            Serialized
                          </span>
                        )}
                      </div>
                      {line.brand && (
                        <div className="text-[11px] text-indigo-300 font-semibold">{line.brand}</div>
                      )}
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                        {line.modelNumber ? `Model: ${line.modelNumber} | ` : ""}SKU: {line.sku} | Barcode: {line.barcode}
                      </p>
                      <div className="text-[10px] text-slate-400 font-semibold space-x-3 mt-1.5">
                        <span>Ordered: <b className="text-slate-200">{line.orderedQty}</b></span>
                        <span>Already Received: <b className="text-emerald-500">{line.previouslyReceivedQty}</b></span>
                        <span>Remaining Outstanding: <b className="text-indigo-400">{line.outstandingQty}</b></span>
                      </div>
                    </div>
                    {/* Quantity Received Input */}
                    <div className="flex items-center gap-2 self-start sm:self-auto mt-1 sm:mt-0">
                      <label className="text-[10px] text-slate-500 font-bold uppercase">Received: </label>
                      <input
                        type="number"
                        min="0"
                        max={line.outstandingQty}
                        value={line.quantityReceived}
                        readOnly={line.serialTracking}
                        onChange={(e) => !line.serialTracking && handleManualQtyChange(idx, parseInt(e.target.value) || 0)}
                        className={`w-16 px-2 py-1 bg-slate-950 border border-slate-850 rounded text-center text-xs font-bold text-slate-200 focus:outline-none ${
                          line.serialTracking
                            ? "opacity-75 cursor-not-allowed border-indigo-950 text-indigo-400 font-extrabold"
                            : "focus:border-indigo-500"
                        }`}
                      />
                      <span className="text-[10px] text-slate-500">/ {line.outstandingQty}</span>
                    </div>
                  </div>

                  {/* Serial Numbers detail container if serialized */}
                  {line.serialTracking && (
                    <div className="bg-slate-950/70 border border-slate-850/60 rounded-lg p-3 space-y-2">
                      <div className="flex justify-between items-center flex-wrap gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">
                            Serials List ({line.serialNumbers.length} / {line.quantityReceived} scanned)
                          </span>
                          {line.serialNumbers.length < line.quantityReceived && (
                            <span className="text-[9px] text-rose-400 font-bold animate-pulse">
                              (Requires {line.quantityReceived - line.serialNumbers.length} more)
                            </span>
                          )}
                        </div>
                        {line.quantityReceived < line.outstandingQty && (
                          <button
                            onClick={() => {
                              setActiveSerialInputIndex(idx);
                              setTimeout(() => serialInputRef.current?.focus(), 50);
                            }}
                            className="inline-flex items-center gap-0.5 px-2 py-0.5 text-[9px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/25 rounded hover:bg-indigo-500/20"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Scan Serial</span>
                          </button>
                        )}
                      </div>

                      {line.serialNumbers.length === 0 ? (
                        <p className="text-[10px] text-slate-500 italic">No serials scanned yet. Click "Scan Serial" or scan the product barcode to start.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {line.serialNumbers.map((sn, snIdx) => (
                            <span
                              key={snIdx}
                              className="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-900 border border-slate-800 rounded font-mono text-[9px] text-slate-350"
                            >
                              <span>{sn}</span>
                              <button
                                onClick={() => removeSerial(idx, snIdx)}
                                className="text-rose-500 hover:text-rose-400"
                              >
                                ✕
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column: Receiving settings & actions */}
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 shadow-sm">
            <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-indigo-400" />
              <span>Receiving Details</span>
            </h2>

            <div className="space-y-4 text-xs">
              {/* Destination Location Selection */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Destination Location *
                </label>
                <select
                  value={selectedLocation}
                  onChange={(e) => setSelectedLocation(e.target.value)}
                  className="w-full px-2.5 py-2 bg-slate-950 border border-slate-850 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="">Select Location</option>
                  {locations.map((loc) => (
                    <option key={loc._id} value={loc._id}>
                      {loc.name} ({loc.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Receiving Memo / Remarks
                </label>
                <textarea
                  placeholder="Record packaging quality, delivery remarks, or discrepancies found..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  className="w-full px-2.5 py-2 bg-slate-950 border border-slate-850 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 resize-none leading-normal"
                />
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-2 shadow-sm">
            <button
              onClick={() => handleSave(true)}
              disabled={submitting}
              className="w-full py-2.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>Submit for Accountant Approval</span>
            </button>
            <button
              onClick={() => handleSave(false)}
              disabled={submitting}
              className="w-full py-2.5 px-3 border border-slate-800 bg-slate-950 hover:bg-slate-850 text-indigo-400 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>Save as Draft</span>
            </button>
          </div>
        </div>
      </div>

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
