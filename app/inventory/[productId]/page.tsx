"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Layers,
  Calendar,
  User as UserIcon,
  Truck,
  CheckCircle,
  AlertCircle,
  FileText,
  Clock,
  ExternalLink,
} from "lucide-react";
import { ToastContainer, ToastMessage } from "@/components/Toast";

interface DetailsState {
  product: {
    _id: string;
    name: string;
    sku: string;
    barcode: string;
    condition: string;
    serialTracking: boolean;
    category?: { name: string; code: string };
    productGroup?: { name: string };
    model?: string;
    description?: string;
  };
  locations: {
    locationId: string;
    locationName: string;
    locationCode: string;
    locationType: string;
    quantity: number;
  }[];
  totalQuantity: number;
  serials: {
    serialNumber: string;
    status: string;
    location: string;
    transactionReference?: string;
    createdAt: string;
  }[];
  movements: {
    _id: string;
    quantity: number;
    serialNumbers?: string[];
    sourceName: string;
    destinationName: string;
    type: string;
    referenceTransaction?: string;
    beforeQuantity: number;
    afterQuantity: number;
    performedBy: string;
    approvedBy?: string;
    date: string;
    notes?: string;
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

export default function ProductInventoryDetailsPage() {
  const params = useParams();
  const productId = params?.productId as string;

  const [data, setData] = useState<DetailsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const addToast = (type: "success" | "error" | "info", text: string) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, type, text }]);
  };
  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const fetchDetails = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/inventory/${productId}`);
      const resData = await res.json();
      if (resData.success) {
        setData(resData.data);
      } else {
        setError(resData.error || "Failed to load product stock details.");
      }
    } catch {
      setError("Failed to fetch product stock details from server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (productId) {
      fetchDetails();
    }
  }, [productId]);

  const getMovementTypeBadge = (type: string) => {
    switch (type) {
      case "PURCHASE_RECEIVING":
        return "bg-blue-500/10 text-blue-400 border border-blue-500/20";
      case "OPENING_STOCK":
        return "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20";
      case "TRANSFER":
        return "bg-purple-500/10 text-purple-400 border border-purple-500/20";
      case "DAMAGE":
        return "bg-rose-500/10 text-rose-450 border border-rose-500/25";
      default:
        return "bg-slate-800 text-slate-400 border border-slate-700";
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-slate-900 border border-slate-800 rounded-xl">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-xs">Loading stock ledger details...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link
          href="/inventory"
          className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Inventory</span>
        </Link>
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold rounded-xl flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <span>{error || "Failed to load details."}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex items-center gap-3">
        <Link
          href="/inventory"
          className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-400" />
            <span>Stock Ledger: {data.product.name}</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Product Category: <span className="text-indigo-400 font-bold">{data.product.category?.name || "N/A"}</span>
          </p>
        </div>
      </div>

      {/* Main product metadata details card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        <div>
          <span className="block text-[9px] font-extrabold text-slate-500 uppercase tracking-wider mb-0.5">
            SKU Code
          </span>
          <span className="font-mono font-bold text-slate-200 uppercase">{data.product.sku}</span>
        </div>
        <div>
          <span className="block text-[9px] font-extrabold text-slate-500 uppercase tracking-wider mb-0.5">
            Barcode Identifier
          </span>
          <span className="font-mono font-bold text-slate-200">{data.product.barcode}</span>
        </div>
        <div>
          <span className="block text-[9px] font-extrabold text-slate-500 uppercase tracking-wider mb-0.5">
            Condition / Grade
          </span>
          <span className="px-2 py-0.5 text-[9px] font-bold bg-slate-800 text-slate-350 rounded border border-slate-700 uppercase">
            {data.product.condition}
          </span>
        </div>
        <div>
          <span className="block text-[9px] font-extrabold text-slate-500 uppercase tracking-wider mb-0.5">
            Tracking Style
          </span>
          <span
            className={`px-1.5 py-0.5 text-[9px] font-bold rounded uppercase ${
              data.product.serialTracking
                ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/25"
                : "bg-slate-800 text-slate-400 border border-slate-750"
            }`}
          >
            {data.product.serialTracking ? "Serialized Tracking" : "Quantity-Only"}
          </span>
        </div>
      </div>

      {/* Grid: Location stocks & Serials */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Location Stock Breakdown */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 shadow-sm lg:col-span-1">
          <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2.5 flex items-center gap-1.5">
            <Truck className="w-4 h-4 text-indigo-400" />
            <span>Location stock levels</span>
          </h2>

          <div className="space-y-2 text-xs">
            {data.locations.map((loc) => (
              <div
                key={loc.locationId}
                className="flex justify-between items-center py-2 border-b border-slate-850 last:border-0"
              >
                <div>
                  <span className="font-semibold text-slate-300 block">{loc.locationName}</span>
                  <span className="text-[9px] text-slate-500 font-bold uppercase">{loc.locationType}</span>
                </div>
                <span className={`font-bold text-sm ${loc.quantity > 0 ? "text-indigo-400" : "text-slate-600"}`}>
                  {loc.quantity} units
                </span>
              </div>
            ))}

            <div className="pt-3 border-t border-slate-850 flex justify-between items-center font-extrabold text-slate-200">
              <span>Total Available Stock</span>
              <span className="text-emerald-400 text-base">{data.totalQuantity} units</span>
            </div>
          </div>
        </div>

        {/* Serials Registry */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 shadow-sm lg:col-span-2 min-h-[220px]">
          <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2.5 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-indigo-400" />
            <span>Active Serial Numbers ({data.serials.length})</span>
          </h2>

          {!data.product.serialTracking ? (
            <div className="text-center py-10 text-slate-500 italic text-xs">
              Serial tracking is disabled for this product. Individual serial number records are not maintained.
            </div>
          ) : data.serials.length === 0 ? (
            <div className="text-center py-10 text-slate-500 italic text-xs">
              Product is serialized but has 0 units currently in stock. No active serials found.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-850 rounded-lg">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950 border-b border-slate-850 text-slate-400 font-bold uppercase tracking-wider">
                    <th className="p-2.5">Serial Number</th>
                    <th className="p-2.5">Current Location</th>
                    <th className="p-2.5">Reference Tx</th>
                    <th className="p-2.5">Date Added</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850 font-medium text-slate-300 bg-slate-900">
                  {data.serials.map((sn) => (
                    <tr key={sn.serialNumber} className="hover:bg-slate-850/40">
                      <td className="p-2.5 font-mono font-bold text-slate-200">{sn.serialNumber}</td>
                      <td className="p-2.5">
                        <span className="px-1.5 py-0.2 bg-slate-800 text-slate-400 rounded-sm font-bold uppercase">
                          {sn.location}
                        </span>
                      </td>
                      <td className="p-2.5 text-slate-400">{sn.transactionReference || "N/A"}</td>
                      <td className="p-2.5 text-slate-500">
                        {new Date(sn.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Supplier Source / Provenance History (Visible to Admin, Warehouse, Accountant only) */}
      {data.sourceHistory && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 shadow-sm">
          <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2.5 flex items-center gap-1.5">
            <Truck className="w-4 h-4 text-indigo-400" />
            <span>Supplier / Purchase Source History</span>
          </h2>

          {data.sourceHistory.length === 0 ? (
            <div className="text-center py-8 text-slate-500 italic text-xs border border-dashed border-slate-850 rounded-lg">
              Source information unavailable for this stock.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-850 rounded-lg">
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
                  {data.sourceHistory.map((sh, idx) => (
                    <tr key={idx} className="hover:bg-slate-850/40">
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

      {/* Movement Ledger Log */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 shadow-sm">
        <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2.5 flex items-center gap-1.5">
          <Clock className="w-4 h-4 text-indigo-400" />
          <span>Append-Only Stock Movement Ledger</span>
        </h2>

        {data.movements.length === 0 ? (
          <div className="text-center py-10 text-slate-500 italic text-xs">
            No stock movement history ledger records exist for this product.
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-850 rounded-lg">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950 border-b border-slate-850 text-slate-400 font-bold uppercase tracking-wider">
                  <th className="p-3">Date</th>
                  <th className="p-3">Movement Type</th>
                  <th className="p-3">Source &rarr; Destination</th>
                  <th className="p-3 text-center">Change Qty</th>
                  <th className="p-3 text-center">Audit Balance</th>
                  <th className="p-3">Reference Tx</th>
                  <th className="p-3 text-center">Operators</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850 text-slate-300 bg-slate-900">
                {data.movements.map((move) => (
                  <tr key={move._id} className="hover:bg-slate-850/40">
                    <td className="p-3 text-slate-400 whitespace-nowrap">
                      {new Date(move.date).toLocaleString()}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 text-[9px] font-bold rounded uppercase ${getMovementTypeBadge(move.type)}`}>
                        {move.type.replace("_", " ")}
                      </span>
                    </td>
                    <td className="p-3 font-semibold text-slate-300">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500">{move.sourceName}</span>
                        <span>&rarr;</span>
                        <span className="text-slate-200">{move.destinationName}</span>
                      </div>
                    </td>
                    <td className="p-3 text-center font-bold">
                      <span className={move.type.includes("RETURN") || move.type.includes("RECEIVING") || move.type.includes("OPENING") ? "text-emerald-500" : "text-rose-400"}>
                        +{move.quantity}
                      </span>
                    </td>
                    <td className="p-3 text-center text-[10px] text-slate-400 font-mono font-bold whitespace-nowrap">
                      {move.beforeQuantity} &rarr; {move.afterQuantity}
                    </td>
                    <td className="p-3 font-bold text-slate-200 font-mono">
                      {move.referenceTransaction || "N/A"}
                    </td>
                    <td className="p-3 text-center text-slate-450 font-medium">
                      <div className="flex flex-col text-[10px] items-center">
                        <span className="flex items-center gap-0.5 text-slate-400">
                          <UserIcon className="w-2.5 h-2.5" />
                          <span>Op: {move.performedBy}</span>
                        </span>
                        {move.approvedBy && (
                          <span className="flex items-center gap-0.5 text-emerald-450 mt-0.5 text-[9px]">
                            <CheckCircle className="w-2.5 h-2.5 text-emerald-500" />
                            <span>App: {move.approvedBy}</span>
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
