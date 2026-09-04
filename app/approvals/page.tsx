"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  FileText,
  CheckCircle,
  XCircle,
  AlertCircle,
  Eye,
  Calendar,
  User as UserIcon,
  Layers,
  Truck,
  ArrowRight,
} from "lucide-react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { ToastContainer, ToastMessage } from "@/components/Toast";

interface PendingApprovalItem {
  id: string;
  type: "Purchase Invoice" | "Purchase Receiving";
  reference: string;
  parentReference?: string;
  supplierName: string;
  supplierCode: string;
  date: string;
  amount: number | null;
  locationName?: string;
  productCount: number;
  quantity: number;
  createdBy: string;
  status: string;
  pendingSince: string;
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<PendingApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userRole, setUserRole] = useState("");

  // Review Modal State
  const [selectedItem, setSelectedItem] = useState<PendingApprovalItem | null>(null);
  const [selectedDetails, setSelectedDetails] = useState<any | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Action States
  const [actioning, setActioning] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [actionError, setActionError] = useState("");

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

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
        if (data.data.role !== "Admin" && data.data.role !== "Accountant") {
          setError("Access Denied. Only Accountants and Admins can access approvals.");
          setLoading(false);
        }
      } else {
        setError("Failed to verify authorization session.");
        setLoading(false);
      }
    } catch {
      setError("Failed to verify session.");
      setLoading(false);
    }
  };

  // Fetch pending approvals
  const fetchPendingApprovals = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/approvals/pending");
      const data = await res.json();
      if (data.success) {
        setApprovals(data.data);
      } else {
        setError(data.error || "Failed to load pending approvals.");
      }
    } catch {
      setError("Failed to load pending approvals due to a network error.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSession();
  }, []);

  useEffect(() => {
    if (userRole === "Admin" || userRole === "Accountant") {
      fetchPendingApprovals();
    }
  }, [userRole]);

  // Load details for modal review
  const handleReview = async (item: PendingApprovalItem) => {
    setSelectedItem(item);
    setDetailsModalOpen(true);
    setLoadingDetails(true);
    setSelectedDetails(null);
    setActionError("");
    setShowRejectForm(false);
    setRejectionReason("");

    try {
      const endpoint =
        item.type === "Purchase Invoice"
          ? `/api/purchase-invoices/${item.id}`
          : `/api/purchase-receivings/${item.id}`;
      const res = await fetch(endpoint);
      const data = await res.json();
      if (data.success) {
        setSelectedDetails(data.data);
      } else {
        setActionError(data.error || "Failed to load transaction details.");
      }
    } catch {
      setActionError("Failed to fetch transaction details from server.");
    } finally {
      setLoadingDetails(false);
    }
  };

  const [detailsModalOpen, setDetailsModalOpen] = useState(false);

  // Approve action
  const handleApprove = async () => {
    if (!selectedItem) return;
    setActioning(true);
    setActionError("");

    try {
      const endpoint =
        selectedItem.type === "Purchase Invoice"
          ? `/api/purchase-invoices/${selectedItem.id}/approve`
          : `/api/purchase-receivings/${selectedItem.id}/approve`;

      const res = await fetch(endpoint, { method: "POST" });
      const data = await res.json();

      if (data.success) {
        addToast("success", `${selectedItem.type} approved successfully!`);
        setDetailsModalOpen(false);
        setSelectedItem(null);
        fetchPendingApprovals();
      } else {
        setActionError(data.error || "Failed to approve transaction.");
      }
    } catch {
      setActionError("Network error during approval.");
    } finally {
      setActioning(false);
    }
  };

  // Reject action
  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    if (!rejectionReason.trim()) {
      setActionError("Rejection reason is required.");
      return;
    }

    setActioning(true);
    setActionError("");

    try {
      const endpoint =
        selectedItem.type === "Purchase Invoice"
          ? `/api/purchase-invoices/${selectedItem.id}/reject`
          : `/api/purchase-receivings/${selectedItem.id}/reject`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectionReason.trim() }),
      });
      const data = await res.json();

      if (data.success) {
        addToast("success", `${selectedItem.type} rejected.`);
        setDetailsModalOpen(false);
        setSelectedItem(null);
        fetchPendingApprovals();
      } else {
        setActionError(data.error || "Failed to reject transaction.");
      }
    } catch {
      setActionError("Network error during rejection.");
    } finally {
      setActioning(false);
    }
  };

  if (loading && approvals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-slate-900 border border-slate-800 rounded-xl">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-xs">Loading pending approvals...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold rounded-xl flex items-center gap-2">
        <AlertCircle className="w-5 h-5" />
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-indigo-400" />
          <span>Pending Approvals</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Review, approve, or reject pending purchase invoices and warehouse receiving transactions.
        </p>
      </div>

      {/* Empty State */}
      {!loading && approvals.length === 0 && (
        <div className="text-center py-16 bg-slate-900 border border-slate-800 rounded-xl">
          <CheckCircle className="w-12 h-12 text-slate-650 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-200">All Caught Up!</h3>
          <p className="text-xs text-slate-400 mt-1">
            There are no purchase invoices or receiving documents pending approval.
          </p>
        </div>
      )}

      {/* Approvals List */}
      {approvals.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xs">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
                  <th className="p-4">Transaction Type</th>
                  <th className="p-4">Reference</th>
                  <th className="p-4">Supplier</th>
                  <th className="p-4">Details</th>
                  <th className="p-4">Items / Qty</th>
                  <th className="p-4">Created By</th>
                  <th className="p-4">Pending Since</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-350">
                {approvals.map((item) => (
                  <tr key={`${item.type}-${item.id}`} className="hover:bg-slate-850 transition-colors">
                    <td className="p-4">
                      <span
                        className={`px-2 py-0.5 text-[9px] font-bold rounded uppercase ${
                          item.type === "Purchase Invoice"
                            ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                            : "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                        }`}
                      >
                        {item.type}
                      </span>
                    </td>
                    <td className="p-4 font-bold text-slate-200">{item.reference}</td>
                    <td className="p-4">
                      <div className="font-semibold text-slate-300">{item.supplierName}</div>
                      <div className="text-[9px] font-bold text-slate-500 uppercase">{item.supplierCode}</div>
                    </td>
                    <td className="p-4 font-medium text-slate-400">
                      {item.type === "Purchase Invoice" ? (
                        <span className="text-indigo-400 font-bold">
                          Rs. {item.amount?.toLocaleString("en-PK")}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Layers className="w-3.5 h-3.5 text-slate-500" />
                          <span>Recv to: {item.locationName}</span>
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      <div>{item.productCount} lines</div>
                      <div className="text-[10px] text-slate-500 font-semibold">{item.quantity} units total</div>
                    </td>
                    <td className="p-4 font-medium text-slate-450">{item.createdBy}</td>
                    <td className="p-4 text-slate-400">
                      {new Date(item.pendingSince).toLocaleString()}
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => handleReview(item)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 px-2 py-1 bg-slate-800 border border-slate-700/60 rounded cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Review</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="block md:hidden divide-y divide-slate-800/60">
            {approvals.map((item) => (
              <div key={`${item.type}-${item.id}`} className="p-4 space-y-3 hover:bg-slate-850/30 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`px-2 py-0.5 text-[8px] font-bold rounded uppercase ${
                      item.type === "Purchase Invoice"
                        ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                        : "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                    }`}
                  >
                    {item.type}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {new Date(item.pendingSince).toLocaleDateString()}
                  </span>
                </div>

                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-xs font-bold text-slate-200">{item.reference}</h3>
                    <p className="text-xs text-slate-400 font-semibold">{item.supplierName}</p>
                  </div>
                  <div className="text-right">
                    {item.type === "Purchase Invoice" ? (
                      <div className="text-xs font-bold text-indigo-400">
                        Rs. {item.amount?.toLocaleString("en-PK")}
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-400 font-semibold flex items-center justify-end gap-1">
                        <Layers className="w-3 h-3 text-slate-500" />
                        <span>{item.locationName}</span>
                      </div>
                    )}
                    <span className="text-[10px] text-slate-500">{item.quantity} units</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2.5 border-t border-slate-800/40">
                  <span className="text-[10px] text-slate-500">By: {item.createdBy}</span>
                  <button
                    onClick={() => handleReview(item)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300"
                  >
                    <span>Review & Resolve</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Review & Resolution Modal */}
      {detailsModalOpen && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div>
                <span className="text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-indigo-400 border border-slate-700">
                  {selectedItem.type} Details
                </span>
                <h2 className="text-sm font-bold text-slate-100 mt-1 flex items-center gap-1.5">
                  <span>Reference: {selectedItem.reference}</span>
                  {selectedItem.parentReference && (
                    <span className="text-xs text-slate-500 font-normal">
                      (Invoice: {selectedItem.parentReference})
                    </span>
                  )}
                </h2>
              </div>
              <button
                onClick={() => setDetailsModalOpen(false)}
                className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer font-bold"
              >
                ✕ Close
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4 text-xs">
              {actionError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}

              {loadingDetails ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-2" />
                  <span>Loading details from server...</span>
                </div>
              ) : selectedDetails ? (
                <div className="space-y-4">
                  {/* Transaction Metadata Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-3.5 bg-slate-950 border border-slate-850 rounded-lg">
                    <div>
                      <span className="block text-[9px] font-extrabold text-slate-500 uppercase tracking-wider mb-0.5">
                        Supplier
                      </span>
                      <span className="font-bold text-slate-200">{selectedItem.supplierName}</span>
                    </div>

                    <div>
                      <span className="block text-[9px] font-extrabold text-slate-500 uppercase tracking-wider mb-0.5">
                        {selectedItem.type === "Purchase Invoice" ? "Invoice Date" : "Date Received"}
                      </span>
                      <span className="font-semibold text-slate-350 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-550" />
                        <span>{new Date(selectedDetails.invoiceDate || selectedDetails.createdAt).toLocaleDateString()}</span>
                      </span>
                    </div>

                    <div>
                      <span className="block text-[9px] font-extrabold text-slate-500 uppercase tracking-wider mb-0.5">
                        {selectedItem.type === "Purchase Invoice" ? "Invoice Amount" : "Destination Location"}
                      </span>
                      <span className="font-bold text-slate-200">
                        {selectedItem.type === "Purchase Invoice" ? (
                          `Rs. ${selectedDetails.total.toLocaleString("en-PK")}`
                        ) : (
                          selectedDetails.location?.name || "Unknown"
                        )}
                      </span>
                    </div>

                    <div>
                      <span className="block text-[9px] font-extrabold text-slate-500 uppercase tracking-wider mb-0.5">
                        Created By
                      </span>
                      <span className="font-semibold text-slate-305 flex items-center gap-1">
                        <UserIcon className="w-3.5 h-3.5 text-slate-550" />
                        <span>{selectedDetails.createdBy}</span>
                      </span>
                    </div>

                    {selectedDetails.notes && (
                      <div className="col-span-2">
                        <span className="block text-[9px] font-extrabold text-slate-500 uppercase tracking-wider mb-0.5">
                          Notes / Remarks
                        </span>
                        <p className="text-[11px] text-slate-400 italic font-medium">{selectedDetails.notes}</p>
                      </div>
                    )}
                  </div>

                  {/* Line Items List */}
                  <div>
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-1.5 mb-2.5">
                      Transaction Line Items
                    </h3>
                    <div className="border border-slate-800 rounded-lg overflow-hidden">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-950 border-b border-slate-850 text-slate-500 font-bold uppercase tracking-wider">
                            <th className="p-2.5">Product Name / Barcode</th>
                            <th className="p-2.5 text-center">Condition</th>
                            <th className="p-2.5 text-right">
                              {selectedItem.type === "Purchase Invoice" ? "Qty Ordered" : "Qty Received"}
                            </th>
                            {selectedItem.type === "Purchase Invoice" && (
                              <>
                                <th className="p-2.5 text-right">Cost Rate</th>
                                <th className="p-2.5 text-right">Selling Price</th>
                                <th className="p-2.5 text-right">Min Selling</th>
                                <th className="p-2.5 text-right">Amount</th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-850 text-slate-350">
                          {selectedDetails.items.map((line: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-850/40">
                              <td className="p-2.5">
                                <div className="font-bold text-slate-250">{line.name}</div>
                                <div className="text-[9px] text-slate-500 font-bold uppercase">
                                  SKU: {line.sku} | Barcode: {line.barcode}
                                </div>
                                {line.serialNumbers && line.serialNumbers.length > 0 && (
                                  <div className="mt-1 bg-slate-950 p-2 border border-slate-850 rounded text-[9px] text-slate-400 font-semibold space-y-0.5">
                                    <span className="block font-bold text-[8px] uppercase text-indigo-400 tracking-wider">
                                      Scanned Serial Numbers:
                                    </span>
                                    <p className="break-all font-mono leading-relaxed">
                                      {line.serialNumbers.join(", ")}
                                    </p>
                                  </div>
                                )}
                              </td>
                              <td className="p-2.5 text-center font-semibold uppercase text-slate-400">
                                {line.condition}
                              </td>
                              <td className="p-2.5 text-right font-bold text-slate-200">
                                {line.quantity || line.quantityReceived}
                              </td>
                              {selectedItem.type === "Purchase Invoice" && (
                                <>
                                  <td className="p-2.5 text-right font-medium text-slate-400">
                                    Rs. {line.unitCost.toLocaleString("en-PK")}
                                  </td>
                                  <td className="p-2.5 text-right font-medium text-slate-400">
                                    Rs. {line.sellingPrice?.toLocaleString("en-PK") || "0"}
                                  </td>
                                  <td className="p-2.5 text-right font-medium text-slate-400">
                                    Rs. {line.minSellingPrice?.toLocaleString("en-PK") || "0"}
                                  </td>
                                  <td className="p-2.5 text-right font-bold text-slate-200">
                                    Rs. {line.amount.toLocaleString("en-PK")}
                                  </td>
                                </>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Action Forms / Rejection Reason Form */}
              {showRejectForm && (
                <form onSubmit={handleReject} className="p-4 bg-rose-500/5 border border-rose-500/10 rounded-lg space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-rose-450 uppercase tracking-wider mb-1">
                      Reason for Rejection *
                    </label>
                    <textarea
                      required
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="Detail the issues found (e.g. quantity discrepancy, misaligned pricing, serial duplication)..."
                      rows={3}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 resize-none leading-normal"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={actioning}
                      className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded text-[11px] font-bold transition-colors cursor-pointer flex items-center justify-center gap-1"
                    >
                      {actioning && (
                        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      )}
                      <span>Confirm Rejection</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowRejectForm(false)}
                      className="px-4 py-2 border border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200 rounded text-[11px] font-semibold transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Modal Actions */}
            <div className="px-5 py-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between gap-3">
              <div>
                {selectedItem.type === "Purchase Invoice" ? (
                  <Link
                    href={`/purchase-invoices/${selectedItem.id}`}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-400 hover:underline"
                  >
                    <span>Go to Invoice Details</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                ) : (
                  <Link
                    href={`/purchase-invoices/${selectedDetails?.purchaseInvoice?._id || ""}`}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-400 hover:underline"
                  >
                    <span>Go to Invoice Details</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                )}
              </div>

              {!showRejectForm && (
                <div className="flex gap-2">
                  <button
                    onClick={handleApprove}
                    disabled={actioning || loadingDetails}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {actioning ? (
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <CheckCircle className="w-3.5 h-3.5" />
                    )}
                    <span>Approve</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowRejectForm(true);
                      setActionError("");
                    }}
                    disabled={actioning || loadingDetails}
                    className="px-4 py-2 border border-slate-800 bg-slate-850 hover:bg-slate-800 text-rose-400 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Reject</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast Alert Elements */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
