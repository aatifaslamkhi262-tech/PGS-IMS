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
  AlertTriangle,
  Search,
} from "lucide-react";

interface UserOption {
  _id: string;
  name: string;
  username: string;
  role: string;
}

interface DamagedReceiveItem {
  product: string;
  productName?: string;
  serialNumber?: string;
  condition: string;
  damageType: "Damaged" | "Claim";
  reason: string;
  reportedBy: string;
  reportedAt: string;
}

interface TransferData {
  _id: string;
  transferNumber: string;
  type: "Normal" | "Return" | "Direct_Reject";
  sourceLocation: { _id: string; name: string; code: string; type: string };
  destinationLocation: { _id: string; name: string; code: string; type: string };
  status: "Draft" | "Pending_Approval" | "Approved" | "Dispatched" | "Received" | "Rejected" | "Cancelled";
  items: Array<{
    product: { _id?: string; name: string; sku: string; barcode: string; serialTracking: boolean; costPrice?: number; sellingPrice?: number };
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
  damagedReceiveLogs?: DamagedReceiveItem[];
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

  // Damage Receive Modal State
  const [showReceiveDamageModal, setShowReceiveDamageModal] = useState(false);
  const [damagedReports, setDamagedReports] = useState<Record<string, { status: "OK" | "Damaged" | "Claim"; reason: string }>>({});
  const [receiveDamageNotes, setReceiveDamageNotes] = useState("");

  // Line item search filter
  const [itemSearch, setItemSearch] = useState("");

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
      alert("Please select a physical carrier / staff runner.");
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
    if (!confirm("Are you sure all stock arrived in good condition and confirm receipt?")) return;

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

  const openReceiveDamageModal = () => {
    if (!transfer) return;
    const initialMap: Record<string, { status: "OK" | "Damaged" | "Claim"; reason: string }> = {};

    transfer.items.forEach((item, itemIdx) => {
      if (item.serialNumbers && item.serialNumbers.length > 0) {
        item.serialNumbers.forEach((sn) => {
          initialMap[`${item.product?.sku || itemIdx}_${sn}`] = {
            status: "OK",
            reason: "",
          };
        });
      } else {
        initialMap[`${item.product?.sku || itemIdx}_nonserial`] = {
          status: "OK",
          reason: "",
        };
      }
    });

    setDamagedReports(initialMap);
    setReceiveDamageNotes("");
    setShowReceiveDamageModal(true);
  };

  const handleConfirmReceiveDamage = async () => {
    if (!transfer) return;

    const damagedList: Array<{
      productId: string;
      serialNumber?: string;
      condition: string;
      damageType: "Damaged" | "Claim";
      reason: string;
    }> = [];

    let hasEmptyReason = false;

    transfer.items.forEach((item, itemIdx) => {
      const pId = (item.product as any)._id || item.product;
      if (item.serialNumbers && item.serialNumbers.length > 0) {
        item.serialNumbers.forEach((sn) => {
          const key = `${item.product?.sku || itemIdx}_${sn}`;
          const rep = damagedReports[key];
          if (rep && (rep.status === "Damaged" || rep.status === "Claim")) {
            if (!rep.reason || !rep.reason.trim()) {
              hasEmptyReason = true;
            }
            damagedList.push({
              productId: typeof pId === 'string' ? pId : (pId as any)?.toString(),
              serialNumber: sn,
              condition: item.condition,
              damageType: rep.status,
              reason: rep.reason.trim(),
            });
          }
        });
      } else {
        const key = `${item.product?.sku || itemIdx}_nonserial`;
        const rep = damagedReports[key];
        if (rep && (rep.status === "Damaged" || rep.status === "Claim")) {
          if (!rep.reason || !rep.reason.trim()) {
            hasEmptyReason = true;
          }
          damagedList.push({
            productId: typeof pId === 'string' ? pId : (pId as any)?.toString(),
            condition: item.condition,
            damageType: rep.status,
            reason: rep.reason.trim(),
          });
        }
      }
    });

    if (hasEmptyReason) {
      alert("Misuse Prevention: You MUST provide a mandatory reason for all damaged or claimed items before submitting!");
      return;
    }

    if (!confirm(`Confirm receipt with ${damagedList.length} damaged/claim item(s)? Audit logs and carrier custody will be permanently recorded.`)) {
      return;
    }

    try {
      setActionLoading(true);
      const res = await fetch(`/api/transfers/${params.id}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: receiveDamageNotes,
          damagedItems: damagedList,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowReceiveDamageModal(false);
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

        {/* Action Buttons Toolbar */}
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
                  <span>Confirm Receive (All OK)</span>
                </button>
                <button
                  onClick={openReceiveDamageModal}
                  disabled={actionLoading}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>Receive & Report Damage / Claim</span>
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

      {/* Damaged / Claim Receive Audit Log Banner */}
      {transfer.damagedReceiveLogs && transfer.damagedReceiveLogs.length > 0 && (
        <div className="bg-rose-950/40 border border-rose-800/60 rounded-2xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-rose-900/60 pb-3">
            <h3 className="text-xs font-bold text-rose-200 uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <span>Damaged / Claim Stock Reported On Receipt</span>
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-900/60 text-rose-300 border border-rose-700/60 font-mono">
              {transfer.damagedReceiveLogs.length} Incident(s) Logged
            </span>
          </div>

          <div className="space-y-3">
            {transfer.damagedReceiveLogs.map((log, lIdx) => (
              <div key={lIdx} className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-xl space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-slate-100">
                    Product: {log.productName || "Product"} {log.serialNumber ? `(Serial: ${log.serialNumber})` : ""}
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      log.damageType === "Damaged"
                        ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                        : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    }`}
                  >
                    {log.damageType}
                  </span>
                </div>

                <div className="text-slate-300 font-medium bg-slate-900 p-2.5 rounded-lg border border-slate-850">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block mb-0.5">Mandated Reason / Note:</span>
                  "{log.reason}"
                </div>

                <div className="flex flex-wrap items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-850">
                  <span>
                    Reported By: <strong className="text-slate-200">{log.reportedBy}</strong>
                  </span>
                  <span>
                    Carrier at Delivery: <strong className="text-purple-400">{transfer.carrierName || "N/A"}</strong>
                  </span>
                  <span>Time: {new Date(log.reportedAt).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
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
                ✓ Stock processed into {transfer.destinationLocation?.name}
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
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xs">
        <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xs sm:text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <Package className="w-4 h-4 text-indigo-400" />
              <span>Transfer Line Items</span>
            </h2>
            {/* Search Bar for Line Items */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search item, SKU, serial..."
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none w-44 sm:w-60"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="text-slate-400">
              Total Items: <strong className="text-indigo-400">{transfer.items.reduce((sum, i) => sum + i.quantity, 0)}</strong>
            </span>
            <span className="text-slate-700">|</span>
            <span className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg font-bold">
              Total Selling Valuation: Rs. {transfer.items.reduce((sum, i) => {
                const selling = (i.product as any)?.sellingPrice;
                const cost = (i.product as any)?.costPrice;
                const price = (selling && selling > 1) ? selling : (cost || 0);
                return sum + (i.quantity * price);
              }, 0).toLocaleString("en-PK")}
            </span>
          </div>
        </div>

        {/* Mobile View (< md) */}
        <div className="block md:hidden divide-y divide-slate-800">
          {transfer.items
            .filter((it) => {
              if (!itemSearch.trim()) return true;
              const q = itemSearch.toLowerCase().trim();
              const pName = it.product?.name?.toLowerCase() || "";
              const sku = it.product?.sku?.toLowerCase() || "";
              const barcode = it.product?.barcode?.toLowerCase() || "";
              const cond = it.condition?.toLowerCase() || "";
              const serialsMatch = (it.serialNumbers || []).some((sn) => sn.toLowerCase().includes(q));
              return pName.includes(q) || sku.includes(q) || barcode.includes(q) || cond.includes(q) || serialsMatch;
            })
            .map((it, idx) => {
              const selling = (it.product as any)?.sellingPrice;
              const cost = (it.product as any)?.costPrice;
              const unitPrice = (selling && selling > 1) ? selling : (cost || 0);
              const lineTotal = it.quantity * unitPrice;
              return (
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
                    <span className="text-slate-400">Qty: <strong className="text-indigo-400">{it.quantity}</strong> × Rs. {unitPrice.toLocaleString("en-PK")}</span>
                    <span className="font-mono font-bold text-emerald-400 text-sm">Rs. {lineTotal.toLocaleString("en-PK")}</span>
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
              );
            })}
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
                <th className="px-4 py-4 text-right">Selling Price</th>
                <th className="px-4 py-4 text-right">Line Total</th>
                <th className="px-5 py-4">Serial Numbers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium text-slate-300">
              {transfer.items
                .filter((it) => {
                  if (!itemSearch.trim()) return true;
                  const q = itemSearch.toLowerCase().trim();
                  const pName = it.product?.name?.toLowerCase() || "";
                  const sku = it.product?.sku?.toLowerCase() || "";
                  const barcode = it.product?.barcode?.toLowerCase() || "";
                  const cond = it.condition?.toLowerCase() || "";
                  const serialsMatch = (it.serialNumbers || []).some((sn) => sn.toLowerCase().includes(q));
                  return pName.includes(q) || sku.includes(q) || barcode.includes(q) || cond.includes(q) || serialsMatch;
                })
                .map((it, idx) => {
                  const selling = (it.product as any)?.sellingPrice;
                  const cost = (it.product as any)?.costPrice;
                  const unitPrice = (selling && selling > 1) ? selling : (cost || 0);
                  const lineTotal = it.quantity * unitPrice;
                return (
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
                    <td className="px-4 py-4 text-right font-mono text-slate-300">
                      Rs. {unitPrice.toLocaleString("en-PK")}
                    </td>
                    <td className="px-4 py-4 text-right font-mono font-bold text-emerald-400">
                      Rs. {lineTotal.toLocaleString("en-PK")}
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
                );
              })}
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

      {/* Receive & Report Damage Modal */}
      {showReceiveDamageModal && transfer && (
        <div className="fixed inset-0 bg-slate-950/85 flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-2xl w-full max-h-[90vh] flex flex-col space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>Receive & Audit Stock (Report Damage / Claim)</span>
              </h3>
              <button
                onClick={() => setShowReceiveDamageModal(false)}
                className="text-slate-400 hover:text-slate-200 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="text-xs space-y-1 bg-amber-950/30 border border-amber-800/40 p-3 rounded-xl text-amber-200 shrink-0">
              <p className="font-semibold">⚠️ Misuse Prevention & Custody Notice:</p>
              <p className="text-[11px] text-amber-300/80">
                Marking stock as <strong>Damaged</strong> or <strong>Claim</strong> requires entering a mandatory reason.
                This report will be permanently tied to carrier <strong>{transfer.carrierName || "Carrier"}</strong> and logged into the audit trail.
              </p>
            </div>

            <div className="overflow-y-auto space-y-4 pr-1 grow">
              {transfer.items.map((item, itemIdx) => {
                const isSerialized = item.serialNumbers && item.serialNumbers.length > 0;
                return (
                  <div key={itemIdx} className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-slate-200 text-xs sm:text-sm">{item.product?.name}</h4>
                        <span className="text-[10px] font-mono text-slate-400">{item.product?.sku}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300">
                        Qty: {item.quantity} ({item.condition})
                      </span>
                    </div>

                    {isSerialized ? (
                      <div className="space-y-3 pt-1 border-t border-slate-850">
                        {item.serialNumbers!.map((sn) => {
                          const key = `${item.product?.sku || itemIdx}_${sn}`;
                          const rep = damagedReports[key] || { status: "OK", reason: "" };
                          return (
                            <div key={sn} className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-mono text-xs font-bold text-indigo-300">Serial: {sn}</span>
                                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDamagedReports((prev) => ({
                                        ...prev,
                                        [key]: { ...prev[key], status: "OK" },
                                      }))
                                    }
                                    className={`px-2.5 py-1 text-[10px] font-bold rounded transition-colors ${
                                      rep.status === "OK"
                                        ? "bg-emerald-600 text-white"
                                        : "text-slate-400 hover:text-slate-200"
                                    }`}
                                  >
                                    ✓ OK
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDamagedReports((prev) => ({
                                        ...prev,
                                        [key]: { ...prev[key], status: "Damaged" },
                                      }))
                                    }
                                    className={`px-2.5 py-1 text-[10px] font-bold rounded transition-colors ${
                                      rep.status === "Damaged"
                                        ? "bg-rose-600 text-white"
                                        : "text-slate-400 hover:text-slate-200"
                                    }`}
                                  >
                                    Damaged
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDamagedReports((prev) => ({
                                        ...prev,
                                        [key]: { ...prev[key], status: "Claim" },
                                      }))
                                    }
                                    className={`px-2.5 py-1 text-[10px] font-bold rounded transition-colors ${
                                      rep.status === "Claim"
                                        ? "bg-amber-600 text-white"
                                        : "text-slate-400 hover:text-slate-200"
                                    }`}
                                  >
                                    Claim
                                  </button>
                                </div>
                              </div>

                              {rep.status !== "OK" && (
                                <div>
                                  <label className="block text-[10px] font-bold text-rose-300 uppercase tracking-wider mb-1">
                                    Mandatory Reason for {rep.status} *
                                  </label>
                                  <input
                                    type="text"
                                    required
                                    value={rep.reason}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setDamagedReports((prev) => ({
                                        ...prev,
                                        [key]: { ...prev[key], reason: val },
                                      }));
                                    }}
                                    placeholder="e.g. Screen broken on unboxing, driver dropped parcel"
                                    className="w-full bg-slate-950 border border-rose-800/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-rose-500"
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="pt-1 border-t border-slate-850">
                        {(() => {
                          const key = `${item.product?.sku || itemIdx}_nonserial`;
                          const rep = damagedReports[key] || { status: "OK", reason: "" };
                          return (
                            <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-xs text-slate-300">Non-serialized line status:</span>
                                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDamagedReports((prev) => ({
                                        ...prev,
                                        [key]: { ...prev[key], status: "OK" },
                                      }))
                                    }
                                    className={`px-2.5 py-1 text-[10px] font-bold rounded transition-colors ${
                                      rep.status === "OK"
                                        ? "bg-emerald-600 text-white"
                                        : "text-slate-400 hover:text-slate-200"
                                    }`}
                                  >
                                    ✓ All OK
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDamagedReports((prev) => ({
                                        ...prev,
                                        [key]: { ...prev[key], status: "Damaged" },
                                      }))
                                    }
                                    className={`px-2.5 py-1 text-[10px] font-bold rounded transition-colors ${
                                      rep.status === "Damaged"
                                        ? "bg-rose-600 text-white"
                                        : "text-slate-400 hover:text-slate-200"
                                    }`}
                                  >
                                    Damaged
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDamagedReports((prev) => ({
                                        ...prev,
                                        [key]: { ...prev[key], status: "Claim" },
                                      }))
                                    }
                                    className={`px-2.5 py-1 text-[10px] font-bold rounded transition-colors ${
                                      rep.status === "Claim"
                                        ? "bg-amber-600 text-white"
                                        : "text-slate-400 hover:text-slate-200"
                                    }`}
                                  >
                                    Claim
                                  </button>
                                </div>
                              </div>

                              {rep.status !== "OK" && (
                                <div>
                                  <label className="block text-[10px] font-bold text-rose-300 uppercase tracking-wider mb-1">
                                    Mandatory Reason for {rep.status} *
                                  </label>
                                  <input
                                    type="text"
                                    required
                                    value={rep.reason}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setDamagedReports((prev) => ({
                                        ...prev,
                                        [key]: { ...prev[key], reason: val },
                                      }));
                                    }}
                                    placeholder="e.g. Outer carton torn and unit damaged"
                                    className="w-full bg-slate-950 border border-rose-800/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-rose-500"
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              })}

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  General Receiving Notes (Optional)
                </label>
                <textarea
                  value={receiveDamageNotes}
                  onChange={(e) => setReceiveDamageNotes(e.target.value)}
                  placeholder="e.g. Checked with driver Ali on delivery"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                  rows={2}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setShowReceiveDamageModal(false)}
                className="px-4 py-2 bg-slate-950 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReceiveDamage}
                disabled={actionLoading}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? "Processing..." : "Submit Receipt & Log Audit Trail"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
