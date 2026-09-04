"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  User as UserIcon,
  Calendar,
  CheckCircle,
  XCircle,
  Truck,
  Trash2,
  AlertCircle,
  Send,
  CornerDownLeft,
} from "lucide-react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { ToastContainer, ToastMessage } from "@/components/Toast";

interface InvoiceLineItem {
  product: { _id: string; name: string; sku: string; barcode: string };
  name: string;
  sku: string;
  barcode: string;
  condition: string;
  quantity: number;
  unitCost: number;
  sellingPrice?: number;
  minSellingPrice?: number;
  amount: number;
}

interface InvoiceDetail {
  _id: string;
  invoiceNumber: string;
  supplier: { _id: string; name: string; code: string; contactPerson?: string; phone?: string; email?: string; address?: string };
  invoiceDate: string;
  status:
    | "Draft"
    | "Pending_Approval"
    | "Approved"
    | "Rejected"
    | "Ready_For_Receiving"
    | "Receiving"
    | "Receiving_Pending_Approval"
    | "Receiving_Approved"
    | "Inventory_Updated";
  items: InvoiceLineItem[];
  subtotal: number;
  total: number;
  notes?: string;
  createdBy: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  createdAt: string;
}

export default function PurchaseInvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [receivings, setReceivings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userRole, setUserRole] = useState("");

  // Action States
  const [submitting, setSubmitting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectError, setRejectError] = useState("");

  // Confirmations
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (type: "success" | "error" | "info", text: string) => {
    const toastId = Date.now().toString();
    setToasts((prev) => [...prev, { id: toastId, type, text }]);
  };

  const removeToast = (toastId: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== toastId));
  };

  // Fetch session and role
  const fetchSession = async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      if (data.success) {
        setUserRole(data.data.role);
      }
    } catch {
      setError("Failed to verify authorization session.");
    }
  };

  // Fetch Invoice Details
  const fetchInvoiceDetails = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/purchase-invoices/${id}`);
      const data = await res.json();
      if (data.success) {
        setInvoice(data.data);
      } else {
        setError(data.error || "Failed to load purchase invoice details.");
      }
    } catch {
      setError("Failed to fetch purchase invoice details from server.");
    } finally {
      setLoading(false);
    }
  };

  // Fetch associated receivings
  const fetchReceivings = async () => {
    try {
      const res = await fetch(`/api/purchase-receivings?purchaseInvoice=${id}`);
      const data = await res.json();
      if (data.success) {
        setReceivings(data.data);
      }
    } catch (err) {
      console.error("Failed to fetch receiving list", err);
    }
  };

  useEffect(() => {
    if (id) {
      fetchSession();
      fetchInvoiceDetails();
      fetchReceivings();
    }
  }, [id]);

  // Submit Draft for Approval
  const handleSubmitForApproval = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/purchase-invoices/${id}/submit`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        addToast("success", "Purchase invoice submitted for approval!");
        fetchInvoiceDetails();
      } else {
        addToast("error", data.error || "Failed to submit invoice.");
      }
    } catch {
      addToast("error", "Network error. Failed to submit invoice.");
    } finally {
      setSubmitting(false);
    }
  };

  // Approve Invoice
  const handleApprove = async () => {
    setApproving(true);
    try {
      const res = await fetch(`/api/purchase-invoices/${id}/approve`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        addToast("success", "Purchase invoice approved successfully!");
        setShowApproveConfirm(false);
        fetchInvoiceDetails();
      } else {
        addToast("error", data.error || "Failed to approve invoice.");
      }
    } catch {
      addToast("error", "Network error. Failed to approve invoice.");
    } finally {
      setApproving(false);
    }
  };

  // Reject Invoice
  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectionReason.trim()) {
      setRejectError("Rejection reason is required.");
      return;
    }

    setRejecting(true);
    setRejectError("");

    try {
      const res = await fetch(`/api/purchase-invoices/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectionReason.trim() }),
      });
      const data = await res.json();

      if (data.success) {
        addToast("success", "Purchase invoice rejected.");
        setShowRejectForm(false);
        setRejectionReason("");
        fetchInvoiceDetails();
      } else {
        setRejectError(data.error || "Failed to reject invoice.");
      }
    } catch {
      setRejectError("Network error. Failed to reject invoice.");
    } finally {
      setRejecting(false);
    }
  };

  // Delete Invoice
  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/purchase-invoices/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        addToast("success", "Invoice deleted successfully.");
        setTimeout(() => {
          router.push("/purchase-invoices");
          router.refresh();
        }, 1000);
      } else {
        addToast("error", data.error || "Failed to delete invoice.");
        setShowDeleteConfirm(false);
      }
    } catch {
      addToast("error", "Network error. Failed to delete invoice.");
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  const getStatusBadge = (status: InvoiceDetail["status"]) => {
    switch (status) {
      case "Approved":
      case "Ready_For_Receiving":
      case "Receiving_Approved":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "Pending_Approval":
      case "Receiving_Pending_Approval":
        return "bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse";
      case "Receiving":
        return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      case "Inventory_Updated":
        return "bg-indigo-500/10 text-indigo-400 border-indigo-500/20 font-extrabold";
      case "Rejected":
        return "bg-rose-500/10 text-rose-400 border-rose-500/20";
      default:
        return "bg-slate-800 text-slate-400 border-slate-700";
    }
  };

  const getStatusLabel = (status: InvoiceDetail["status"]) => {
    return status.replace(/_/g, " ");
  };

  // RBAC Permission checks
  const isAdmin = userRole === "Admin";
  const isWarehouse = userRole === "Warehouse";
  const isAccountant = userRole === "Accountant";

  const isDraft = invoice?.status === "Draft" || invoice?.status === "Rejected";
  const isPending = invoice?.status === "Pending_Approval";

  const canSubmit = isDraft && (isAdmin || isWarehouse);
  const canDelete = isDraft && (isAdmin || isWarehouse);
  const canApproveReject = isPending && (isAdmin || isAccountant);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-slate-900 border border-slate-800 rounded-xl">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-xs">Loading invoice details...</span>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="space-y-4">
        <Link
          href="/purchase-invoices"
          className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Purchases</span>
        </Link>
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold rounded-xl flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <span>{error || "Failed to load purchase invoice details."}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/purchase-invoices"
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-400" />
              <span>Invoice {invoice.invoiceNumber}</span>
            </h1>
            <div className="flex items-center gap-2 mt-1.5">
              <span className={`px-2 py-0.5 text-[10px] font-bold rounded-sm border ${getStatusBadge(invoice.status)}`}>
                {getStatusLabel(invoice.status)}
              </span>
              <span className="text-xs text-slate-500">•</span>
              <span className="text-xs text-slate-400">Created by {invoice.createdBy}</span>
            </div>
          </div>
        </div>

        {/* Mutation Actions */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {isDraft && (isAdmin || isWarehouse) && (
            <Link
              href={`/purchase-invoices/${id}/edit`}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 border border-slate-800 bg-slate-900 hover:bg-slate-850 text-indigo-400 hover:text-indigo-300 rounded-lg text-xs font-semibold transition-colors"
            >
              <CornerDownLeft className="w-3.5 h-3.5" />
              <span>Edit / Revise</span>
            </Link>
          )}

          {canSubmit && (
            <button
              onClick={handleSubmitForApproval}
              disabled={submitting}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-indigo-900/30 transition-colors cursor-pointer"
            >
              {submitting ? (
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>{invoice.status === "Rejected" ? "Resubmit for Approval" : "Submit for Approval"}</span>
            </button>
          )}

          {userRole && (isAdmin || isWarehouse) && ["Approved", "Ready_For_Receiving", "Receiving", "Receiving_Pending_Approval", "Receiving_Approved"].includes(invoice.status) && (
            <Link
              href={`/purchase-invoices/${id}/receive`}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-indigo-900/30 transition-colors"
            >
              <Truck className="w-3.5 h-3.5" />
              <span>Receive Physical Stock</span>
            </Link>
          )}

          {canDelete && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleting}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 border border-slate-800 bg-slate-900 hover:bg-slate-850 text-rose-450 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Invoice</span>
            </button>
          )}
        </div>
      </div>

      {/* Rejection Notification Banner */}
      {invoice.status === "Rejected" && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold rounded-xl space-y-1.5">
          <div className="flex items-center gap-2 text-rose-350">
            <XCircle className="w-5 h-5 text-rose-450 shrink-0" />
            <span className="font-bold uppercase tracking-wider text-[10px]">Rejection Recorded</span>
            <span className="text-slate-500">•</span>
            <span className="font-medium text-slate-400">
              Rejected by {invoice.rejectedBy} on {new Date(invoice.rejectedAt!).toLocaleString()}
            </span>
          </div>
          <p className="pl-7 text-xs text-slate-350 font-normal italic">
            &ldquo;{invoice.rejectionReason}&rdquo;
          </p>
        </div>
      )}

      {/* Approval Notification Banner */}
      {invoice.status === "Approved" && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold rounded-xl space-y-1">
          <div className="flex items-center gap-2 text-emerald-350">
            <CheckCircle className="w-5 h-5 text-emerald-450 shrink-0" />
            <span className="font-bold uppercase tracking-wider text-[10px]">Accountant Approved</span>
            <span className="text-slate-500">•</span>
            <span className="font-medium text-slate-400">
              Approved by {invoice.approvedBy} on {new Date(invoice.approvedAt!).toLocaleString()}
            </span>
          </div>
          <p className="pl-7 text-[10px] text-slate-400 font-normal">
            * Accounting reconciliation complete. Physical receiving transaction can now be initialized.
          </p>
        </div>
      )}

      {/* Invoice Details Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Lines details table */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2.5">
            Invoice Line Items
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider pb-2">
                  <th className="pb-3 pr-2">Product Details</th>
                  <th className="pb-3 px-2 text-center">Qty</th>
                  <th className="pb-3 px-2 text-right">Unit Rate</th>
                  <th className="pb-3 px-2 text-right">Selling Price</th>
                  <th className="pb-3 px-2 text-right">Min Selling</th>
                  <th className="pb-3 pl-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850 text-slate-350">
                {invoice.items.map((line, idx) => (
                  <tr key={idx} className="hover:bg-slate-850/40">
                    <td className="py-3.5 pr-2 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-200">{line.name}</span>
                        <span className="px-1.5 py-0.2 text-[8px] font-bold bg-slate-800 text-slate-400 rounded uppercase">
                          {line.condition}
                        </span>
                        <span className="px-1.5 py-0.2 text-[8px] font-bold bg-purple-500/10 text-purple-300 border border-purple-500/20 rounded uppercase">
                          Color: {(line as any).color || "Unspecified"}
                        </span>
                      </div>
                      {(line as any).brand && (
                        <div className="text-[11px] text-indigo-300 font-semibold">{(line as any).brand}</div>
                      )}
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                        {(line as any).modelNumber ? `Model: ${(line as any).modelNumber} | ` : ""}SKU: {line.sku} | Barcode: {line.barcode}
                      </p>
                    </td>
                    <td className="py-3.5 px-2 text-center font-bold text-slate-350">{line.quantity}</td>
                    <td className="py-3.5 px-2 text-right font-medium text-slate-400">
                      Rs. {line.unitCost.toLocaleString("en-PK")}
                    </td>
                    <td className="py-3.5 px-2 text-right font-medium text-slate-400 font-mono">
                      Rs. {line.sellingPrice?.toLocaleString("en-PK") || "0"}
                    </td>
                    <td className="py-3.5 px-2 text-right font-medium text-slate-400 font-mono">
                      Rs. {line.minSellingPrice?.toLocaleString("en-PK") || "0"}
                    </td>
                    <td className="py-3.5 pl-2 text-right font-bold text-slate-200">
                      Rs. {line.amount.toLocaleString("en-PK")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Physical Receivings Section */}
          {["Approved", "Ready_For_Receiving", "Receiving", "Receiving_Pending_Approval", "Receiving_Approved", "Inventory_Updated"].includes(invoice.status) && (
            <div className="pt-6 border-t border-slate-800 space-y-4">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-indigo-400" />
                <span>Physical Warehouse Receivings</span>
              </h3>

              {receivings.length === 0 ? (
                <div className="text-center py-6 bg-slate-950 border border-slate-850 rounded-lg text-slate-400">
                  <p className="text-xs">No physical receiving logs found for this invoice.</p>
                  {userRole && (isAdmin || isWarehouse) && (
                    <Link
                      href={`/purchase-invoices/${id}/receive`}
                      className="inline-flex items-center gap-1 mt-2 text-xs font-bold text-indigo-400 hover:text-indigo-300"
                    >
                      <span>Start physical receiving</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-850 rounded-lg">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-950 border-b border-slate-850 text-slate-400 font-bold uppercase tracking-wider">
                        <th className="p-3">Rec #</th>
                        <th className="p-3">Location</th>
                        <th className="p-3 text-center">Received Qty</th>
                        <th className="p-3">Date</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850 text-slate-350 bg-slate-900">
                      {receivings.map((rec) => {
                        const totalRec = rec.items.reduce((sum: number, i: any) => sum + i.quantityReceived, 0);
                        return (
                          <tr key={rec._id} className="hover:bg-slate-850/40">
                            <td className="p-3 font-bold text-slate-200">{rec.receivingNumber}</td>
                            <td className="p-3">{rec.location?.name || "Warehouse"}</td>
                            <td className="p-3 text-center font-bold">{totalRec} units</td>
                            <td className="p-3 text-slate-450">{new Date(rec.createdAt).toLocaleDateString()}</td>
                            <td className="p-3">
                              <span
                                className={`px-2 py-0.5 text-[9px] font-bold rounded-sm border ${
                                  rec.status === "Approved"
                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                    : rec.status === "Pending_Approval"
                                    ? "bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse"
                                    : rec.status === "Rejected"
                                    ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                    : "bg-slate-850 text-slate-400 border-slate-700"
                                }`}
                              >
                                {rec.status.replace("_", " ")}
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              {(rec.status === "Draft" || rec.status === "Rejected") && (isAdmin || isWarehouse) ? (
                                <Link
                                  href={`/purchase-invoices/${id}/receive?receivingId=${rec._id}`}
                                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-400 hover:text-indigo-300 px-2 py-0.5 bg-slate-800 border border-slate-700/60 rounded"
                                >
                                  Edit / Resubmit
                                </Link>
                              ) : (
                                <span className="text-[10px] text-slate-500">View in Approvals</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Metadata Details sidebar */}
        <div className="space-y-6">
          {/* Supplier Master & Metadata */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2.5 flex items-center gap-1.5">
              <Truck className="w-4 h-4 text-indigo-400" />
              <span>Supplier & Invoice Details</span>
            </h2>

            <div className="space-y-3.5 text-xs">
              {/* Supplier Info */}
              <div>
                <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">
                  Supplier Name
                </span>
                <span className="font-bold text-slate-200">{invoice.supplier?.name}</span>
                <span className="px-1.5 py-0.2 ml-2 text-[9px] font-bold bg-slate-850 text-indigo-400 rounded border border-slate-800 uppercase tracking-wider">
                  {invoice.supplier?.code}
                </span>
              </div>

              {/* Invoice Date */}
              <div>
                <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <span>Invoice Date</span>
                </span>
                <span className="font-semibold text-slate-300">
                  {new Date(invoice.invoiceDate).toLocaleDateString()}
                </span>
              </div>

              {/* Notes */}
              {invoice.notes && (
                <div>
                  <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">
                    Internal Notes
                  </span>
                  <p className="text-slate-400 bg-slate-950 p-2.5 border border-slate-850 rounded text-[11px] leading-relaxed">
                    {invoice.notes}
                  </p>
                </div>
              )}

              {/* Financial calculations */}
              <div className="pt-3.5 border-t border-slate-800 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">Subtotal:</span>
                  <span className="font-bold text-slate-200">
                    Rs. {invoice.subtotal.toLocaleString("en-PK")}
                  </span>
                </div>
                <div className="flex justify-between text-sm pt-2 border-t border-slate-855">
                  <span className="font-bold text-slate-350">Invoice Total:</span>
                  <span className="font-extrabold text-indigo-400">
                    Rs. {invoice.total.toLocaleString("en-PK")}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Accountant Actions Panel */}
          {canApproveReject && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2.5">
                Accountant Reconciliation Actions
              </h2>

              {!showRejectForm ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setShowApproveConfirm(true)}
                    className="py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Approve</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowRejectForm(true);
                      setRejectError("");
                    }}
                    className="py-2 px-3 border border-slate-800 bg-slate-850 hover:bg-slate-800 text-rose-450 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Reject</span>
                  </button>
                </div>
              ) : (
                <form onSubmit={handleRejectSubmit} className="space-y-3.5">
                  {rejectError && (
                    <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-semibold rounded flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{rejectError}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Reason for Rejection *
                    </label>
                    <textarea
                      required
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="Specify verifying issues (e.g. Quantity discrepancy, unit cost misaligned)..."
                      rows={3}
                      className="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none leading-normal"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={rejecting}
                      className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[11px] font-bold transition-colors cursor-pointer flex items-center justify-center gap-1"
                    >
                      {rejecting && (
                        <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      )}
                      <span>Confirm Reject</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowRejectForm(false)}
                      className="py-1.5 px-3 border border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200 rounded text-[11px] font-semibold transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modals */}
      <ConfirmModal
        isOpen={showApproveConfirm}
        title="Approve Purchase Invoice"
        message="Are you sure you want to approve this purchase invoice? This will lock the invoice record. Stock levels in the Inventory registry will NOT be updated yet until physical warehouse receiving is completed."
        confirmLabel="Approve"
        cancelLabel="Cancel"
        isDanger={false}
        isLoading={approving}
        onConfirm={handleApprove}
        onCancel={() => setShowApproveConfirm(false)}
      />

      <ConfirmModal
        isOpen={showDeleteConfirm}
        title="Delete Purchase Invoice"
        message="Are you sure you want to delete this purchase invoice draft? This operation is permanent and cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isDanger={true}
        isLoading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
