"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Truck,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
  User,
  MapPin,
  Package,
} from "lucide-react";

interface UserOption {
  _id: string;
  name: string;
  username: string;
  role: string;
}

interface TransferData {
  _id: string;
  transferNumber: string;
  type: "Normal" | "Return" | "Direct_Reject";
  sourceLocation: { _id: string; name: string; code: string; type: string };
  destinationLocation: { _id: string; name: string; code: string; type: string };
  status: "Draft" | "Pending_Approval" | "Approved" | "Dispatched" | "Received" | "Rejected" | "Cancelled";
  items: Array<{
    product: { name: string; sku: string; barcode: string; serialTracking: boolean };
    condition: string;
    quantity: number;
    serialNumbers?: string[];
  }>;
  reason?: string;
  notes?: string;
  createdBy: string;
  approvedBy?: string;
  rejectedBy?: string;
  rejectionReason?: string;
  dispatchedBy?: string;
  carrierUser?: { _id: string; name: string; username: string };
  carrierName?: string;
  carrierUsername?: string;
  dispatchedAt?: string;
  receivedBy?: string;
  receivedAt?: string;
  linkedOriginalTransfer?: { _id: string; transferNumber: string; status: string };
  createdAt: string;
}

export default function TransferDetailPage() {
  const params = useParams();
  const router = useRouter();

  const [transfer, setTransfer] = useState<TransferData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeUsers, setActiveUsers] = useState<UserOption[]>([]);

  // Modals & Action States
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [selectedCarrierId, setSelectedCarrierId] = useState("");
  const [dispatchNotes, setDispatchNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchTransferDetails = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await fetch(`/api/transfers/${params.id}`);
      const data = await res.json();
      if (data.success) {
        setTransfer(data.data);
      } else {
        setError(data.error || "Failed to load transfer record.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to connect to server.");
    } finally {
      setLoading(false);
    }
  };

  const fetchActiveUsers = async () => {
    try {
      const res = await fetch("/api/users/active");
      const data = await res.json();
      if (data.success) {
        setActiveUsers(data.data);
        if (data.data.length > 0) {
          setSelectedCarrierId(data.data[0]._id);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchTransferDetails();
    fetchActiveUsers();
  }, [params.id]);

  // Handle Actions
  const handleApprove = async () => {
    try {
      setActionLoading(true);
      const res = await fetch(`/api/transfers/${params.id}/approve`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        fetchTransferDetails();
      } else {
        alert("Error: " + data.error);
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDispatch = async () => {
    if (!selectedCarrierId) {
      alert("Please select a physical carrier user.");
      return;
    }

    try {
      setActionLoading(true);
      const res = await fetch(`/api/transfers/${params.id}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          carrierUserId: selectedCarrierId,
          notes: dispatchNotes,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowDispatchModal(false);
        fetchTransferDetails();
      } else {
        alert("Error: " + data.error);
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReceive = async () => {
    if (!confirm("Are you sure you want to confirm receipt of this stock into destination inventory?")) return;

    try {
      setActionLoading(true);
      const res = await fetch(`/api/transfers/${params.id}/receive`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        fetchTransferDetails();
      } else {
        alert("Error: " + data.error);
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReturnToSource = async () => {
    const reasonPrompt = prompt("Enter reason for return (e.g. Customer Refused / Customer Inquiry Cancelled):", "Customer Refused");
    if (reasonPrompt === null) return;

    try {
      setActionLoading(true);
      const res = await fetch(`/api/transfers/${params.id}/return-to-source`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reasonPrompt }),
      });
      const data = await res.json();
      if (data.success) {
        alert("Return to Source transfer created: " + data.data.transferNumber);
        router.push(`/transfers/${data.data._id}`);
      } else {
        alert("Error: " + data.error);
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDirectReject = async () => {
    const reasonPrompt = prompt(
      "Customer Refused before receiving? Click OK to reject and send item back to source without adding to destination inventory:",
      "Customer Refused - Direct Reject"
    );
    if (reasonPrompt === null) return;

    try {
      setActionLoading(true);
      const res = await fetch(`/api/transfers/${params.id}/direct-reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reasonPrompt }),
      });
      const data = await res.json();
      if (data.success) {
        alert("Transfer rejected. Direct return created: " + data.data.returnTransfer.transferNumber);
        fetchTransferDetails();
      } else {
        alert("Error: " + data.error);
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
        <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm font-medium text-slate-400">Loading transfer details...</p>
      </div>
    );
  }

  if (error || !transfer) {
    return (
      <div className="bg-rose-950/30 border border-rose-800/40 rounded-2xl p-8 text-center space-y-3">
        <XCircle className="w-10 h-10 text-rose-400 mx-auto" />
        <h3 className="text-base font-semibold text-rose-200">{error || "Transfer record not found."}</h3>
        <Link
          href="/transfers"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Return to Transfers List
        </Link>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Draft":
        return "bg-slate-800 text-slate-300 border-slate-700";
      case "Pending_Approval":
        return "bg-amber-500/10 text-amber-300 border-amber-500/30";
      case "Approved":
        return "bg-indigo-500/10 text-indigo-300 border-indigo-500/30";
      case "Dispatched":
        return "bg-purple-500/10 text-purple-300 border-purple-500/30";
      case "Received":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
      case "Rejected":
      case "Cancelled":
        return "bg-rose-500/10 text-rose-300 border-rose-500/30";
      default:
        return "bg-slate-800 text-slate-300 border-slate-700";
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header Card */}
      <div className="bg-slate-900 border border-slate-800 p-5 sm:p-6 rounded-2xl space-y-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-bold font-mono text-indigo-400 tracking-tight">
                {transfer.transferNumber}
              </h1>
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${getStatusBadge(transfer.status)}`}>
                {transfer.status.replace("_", " ")}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-800 border border-slate-700 text-slate-300">
                Type: {transfer.type}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400">
              Transfer from <strong className="text-slate-200">{transfer.sourceLocation?.name}</strong> ({transfer.sourceLocation?.type}) to{" "}
              <strong className="text-slate-200">{transfer.destinationLocation?.name}</strong> ({transfer.destinationLocation?.type})
            </p>
          </div>

          <Link
            href="/transfers"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4 text-slate-400" />
            <span>Back to Directory</span>
          </Link>
        </div>

        {/* Action Buttons Toolbar (Flat, Clean, Fully Responsive) */}
        {(transfer.status === "Pending_Approval" || transfer.status === "Approved" || transfer.status === "Dispatched" || transfer.status === "Received") && (
          <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-2.5">
            {transfer.status === "Pending_Approval" && (
              <button
                onClick={handleApprove}
                disabled={actionLoading}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                Approve Transfer
              </button>
            )}

            {transfer.status === "Approved" && (
              <button
                onClick={() => setShowDispatchModal(true)}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <Truck className="w-4 h-4" />
                <span>Dispatch Stock (Select Carrier)</span>
              </button>
            )}

            {transfer.status === "Dispatched" && (
              <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
                <button
                  onClick={handleReceive}
                  disabled={actionLoading}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirm Receive Stock</span>
                </button>
                <button
                  onClick={handleDirectReject}
                  disabled={actionLoading}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800/80 font-semibold text-xs rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Reject / Send Back</span>
                </button>
              </div>
            )}

            {transfer.status === "Received" && (
              <button
                onClick={handleReturnToSource}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-800/80 font-semibold text-xs rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Return to Source Location</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Linked Transfer Notice */}
      {transfer.linkedOriginalTransfer && (
        <div className="p-4 rounded-xl bg-indigo-950/40 border border-indigo-800/60 text-indigo-300 text-xs flex flex-wrap items-center justify-between gap-2">
          <span>
            Linked to Original Transfer: <strong className="font-mono">{transfer.linkedOriginalTransfer.transferNumber}</strong>
          </span>
          <Link
            href={`/transfers/${transfer.linkedOriginalTransfer._id}`}
            className="text-indigo-400 hover:underline font-semibold"
          >
            View Original Transfer →
          </Link>
        </div>
      )}

      {/* Audit Trail Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Creation Info */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-3">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <User className="w-4 h-4 text-indigo-400" />
            <span>1. Creation Audit</span>
          </h3>
          <div className="text-xs space-y-2 text-slate-300">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-semibold">Created By</span>
              <strong className="text-slate-100">{transfer.createdBy}</strong>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-semibold">Created At</span>
              <span className="text-slate-300">{new Date(transfer.createdAt).toLocaleString()}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-semibold">Reason</span>
              <span className="text-indigo-300 font-semibold">{transfer.reason || "N/A"}</span>
            </div>
            {transfer.approvedBy && (
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-semibold">Approved By</span>
                <span className="text-emerald-400 font-semibold">{transfer.approvedBy}</span>
              </div>
            )}
          </div>
        </div>

        {/* Card 2: Dispatch & Carrier Info */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-3">
          <h3 className="text-xs font-semibold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
            <Truck className="w-4 h-4 text-purple-400" />
            <span>2. Dispatch & Carrier</span>
          </h3>
          {transfer.dispatchedAt ? (
            <div className="text-xs space-y-2 text-slate-300">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-semibold">Dispatched By</span>
                <strong className="text-slate-100">{transfer.dispatchedBy}</strong>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-0.5">
                <span className="text-[10px] text-purple-400 font-bold uppercase block">Physical Carrier</span>
                <div className="text-slate-200 font-bold">{transfer.carrierName || "N/A"}</div>
                {transfer.carrierUsername && (
                  <div className="text-[10px] text-slate-400 font-mono">@{transfer.carrierUsername}</div>
                )}
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-semibold">Dispatched At</span>
                <span className="text-slate-300">{new Date(transfer.dispatchedAt).toLocaleString()}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic pt-2">Not dispatched yet (Stock remains at source).</p>
          )}
        </div>

        {/* Card 3: Receiving Info */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-3">
          <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-emerald-400" />
            <span>3. Receiving Audit</span>
          </h3>
          {transfer.receivedAt ? (
            <div className="text-xs space-y-2 text-slate-300">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-semibold">Received By</span>
                <strong className="text-emerald-400">{transfer.receivedBy}</strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-semibold">Received At</span>
                <span className="text-slate-300">{new Date(transfer.receivedAt).toLocaleString()}</span>
              </div>
              <div className="text-emerald-400 text-xs font-semibold pt-1">
                ✓ Stock added to {transfer.destinationLocation?.name}
              </div>
            </div>
          ) : transfer.status === "Dispatched" ? (
            <div className="pt-2 space-y-1">
              <span className="text-xs font-semibold text-amber-400 flex items-center gap-1">
                <Clock className="w-4 h-4" /> In Transit
              </span>
              <p className="text-xs text-slate-400">
                Awaiting physical receipt at {transfer.destinationLocation?.name}
              </p>
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic pt-2">Awaiting dispatch and receiving.</p>
          )}
        </div>
      </div>

      {/* Items & Serial Numbers List */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-xs sm:text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Package className="w-4 h-4 text-indigo-400" />
            <span>Transfer Line Items</span>
          </h2>
          <span className="text-xs text-slate-400 font-mono">
            Total Items: {transfer.items.reduce((sum, i) => sum + i.quantity, 0)}
          </span>
        </div>

        {/* Mobile View (< md) */}
        <div className="block md:hidden divide-y divide-slate-800">
          {transfer.items.map((it, idx) => (
            <div key={idx} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="font-bold text-slate-100 text-sm">{it.product?.name || "Product"}</h4>
                  <div className="text-xs font-mono text-slate-400">
                    {it.product?.sku} {it.product?.barcode ? `| ${it.product.barcode}` : ""}
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                  {it.condition}
                </span>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-xs">
                <span className="text-slate-400">Quantity:</span>
                <span className="font-mono font-bold text-indigo-400 text-sm">{it.quantity}</span>
              </div>

              {it.serialNumbers && it.serialNumbers.length > 0 && (
                <div className="pt-1 space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Serials:</span>
                  <div className="flex flex-wrap gap-1">
                    {it.serialNumbers.map((sn, sIdx) => (
                      <span
                        key={sIdx}
                        className="px-2 py-0.5 bg-slate-950 text-indigo-300 border border-slate-800 rounded font-mono text-[10px]"
                      >
                        {sn}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Desktop View (>= md) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-950 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-5 py-4">Product Name</th>
                <th className="px-4 py-4">SKU / Barcode</th>
                <th className="px-4 py-4">Condition</th>
                <th className="px-4 py-4 text-center">Quantity</th>
                <th className="px-5 py-4">Serial Numbers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium text-slate-300">
              {transfer.items.map((it, idx) => (
                <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-5 py-4 font-bold text-slate-100">{it.product?.name || "Product"}</td>
                  <td className="px-4 py-4 font-mono text-slate-400">
                    {it.product?.sku} {it.product?.barcode ? `/ ${it.product.barcode}` : ""}
                  </td>
                  <td className="px-4 py-4">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                      {it.condition}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center font-mono font-bold text-indigo-400 text-sm">
                    {it.quantity}
                  </td>
                  <td className="px-5 py-4">
                    {it.serialNumbers && it.serialNumbers.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {it.serialNumbers.map((sn, sIdx) => (
                          <span
                            key={sIdx}
                            className="px-2 py-0.5 bg-slate-950 text-indigo-300 border border-slate-800 rounded font-mono text-[11px]"
                          >
                            {sn}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-500 italic">Non-Serial Tracked</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dispatch Modal */}
      {showDispatchModal && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Truck className="w-4 h-4 text-indigo-400" />
                <span>Dispatch Stock & Select Carrier</span>
              </h3>
              <button
                onClick={() => setShowDispatchModal(false)}
                className="text-slate-400 hover:text-slate-200 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Select the active staff member physically carrying/dispatched with this stock. Stock will be deducted from{" "}
              <strong className="text-slate-200">{transfer.sourceLocation?.name}</strong> and placed In-Transit.
            </p>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Physical Carrier / Runner *
              </label>
              <select
                value={selectedCarrierId}
                onChange={(e) => setSelectedCarrierId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
              >
                {activeUsers.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name} (@{u.username}) — {u.role}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Dispatch Notes (Optional)
              </label>
              <textarea
                value={dispatchNotes}
                onChange={(e) => setDispatchNotes(e.target.value)}
                placeholder="e.g. Handed to Ali for transfer to Shop #5"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                rows={2}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowDispatchModal(false)}
                className="px-4 py-2 bg-slate-950 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDispatch}
                disabled={actionLoading}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? "Dispatching..." : "Confirm & Dispatch Stock"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
