"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Truck,
  Phone,
  Mail,
  MapPin,
  User as UserIcon,
  AlertCircle,
  FileText,
  Package,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  ShoppingCart,
  BarChart2,
  Edit,
  X,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { ToastContainer, ToastMessage } from "@/components/Toast";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SupplierInfo {
  _id: string;
  name: string;
  code: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ReceivingSummary {
  _id: string;
  receivingNumber: string;
  status: string;
  createdBy: string;
  createdAt: string;
  location?: { name: string; code: string };
  itemCount: number;
}

interface InvoiceLineItem {
  product: string;
  name: string;
  sku: string;
  barcode: string;
  condition: string;
  quantity: number;
  quantityReceived: number;
  receivingRefs: string[];
  sellingPrice?: number;
  minSellingPrice?: number;
  // Only present for Admin / Warehouse / Accountant
  unitCost?: number;
  amount?: number;
}

interface InvoiceEntry {
  _id: string;
  invoiceNumber: string;
  invoiceDate: string;
  status: string;
  items: InvoiceLineItem[];
  itemCount: number;
  createdBy: string;
  approvedBy?: string;
  createdAt: string;
  receivings: ReceivingSummary[];
  // Cost fields — only for privileged roles
  subtotal?: number;
  total?: number;
}

interface SupplierStats {
  totalInvoices: number;
  totalItems: number;
  totalQtyOrdered: number;
  totalQtyReceived: number;
  // Only for Admin / Warehouse / Accountant
  totalPurchaseValue?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatCurrency(amount?: number): string {
  if (amount === undefined || amount === null) return "—";
  return new Intl.NumberFormat("en-PK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// Status badge styling
function getStatusBadge(status: string): string {
  switch (status) {
    case "Draft":
      return "bg-slate-800 text-slate-400 border-slate-700";
    case "Pending_Approval":
      return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    case "Approved":
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    case "Rejected":
      return "bg-rose-500/10 text-rose-400 border-rose-500/20";
    case "Ready_For_Receiving":
      return "bg-sky-500/10 text-sky-400 border-sky-500/20";
    case "Receiving":
      return "bg-indigo-500/10 text-indigo-400 border-indigo-500/20";
    case "Receiving_Pending_Approval":
      return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    case "Receiving_Approved":
      return "bg-teal-500/10 text-teal-400 border-teal-500/20";
    case "Inventory_Updated":
      return "bg-emerald-600/10 text-emerald-300 border-emerald-600/20";
    default:
      return "bg-slate-800 text-slate-400 border-slate-700";
  }
}

function formatStatus(status: string): string {
  return status.replace(/_/g, " ");
}

// ── Edit Supplier Modal (reused from suppliers list) ─────────────────────────

interface EditModalProps {
  supplier: SupplierInfo;
  onClose: () => void;
  onSaved: (updated: SupplierInfo) => void;
  addToast: (type: "success" | "error" | "info", text: string) => void;
}

function EditSupplierModal({ supplier, onClose, onSaved, addToast }: EditModalProps) {
  const [formName, setFormName] = useState(supplier.name);
  const [formCode, setFormCode] = useState(supplier.code);
  const [formContact, setFormContact] = useState(supplier.contactPerson || "");
  const [formPhone, setFormPhone] = useState(supplier.phone || "");
  const [formEmail, setFormEmail] = useState(supplier.email || "");
  const [formAddress, setFormAddress] = useState(supplier.address || "");
  const [formActive, setFormActive] = useState(supplier.active);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formCode.trim()) {
      setFormError("Supplier Name and Code are required.");
      return;
    }
    setSubmitting(true);
    setFormError("");
    try {
      const res = await fetch(`/api/suppliers/${supplier._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          code: formCode.trim().toUpperCase(),
          contactPerson: formContact.trim() || undefined,
          phone: formPhone.trim() || undefined,
          email: formEmail.trim() || undefined,
          address: formAddress.trim() || undefined,
          active: formActive,
        }),
      });
      const data = await res.json();
      if (data.success) {
        addToast("success", "Supplier updated successfully!");
        onSaved(data.data);
        onClose();
      } else {
        setFormError(data.error || "Failed to update supplier.");
      }
    } catch {
      setFormError("A network error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-md w-full p-6 text-slate-100 relative animate-fadeIn">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1 rounded-lg"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-base font-bold text-slate-100 flex items-center gap-2 mb-4">
          <Truck className="w-4.5 h-4.5 text-indigo-400" />
          <span>Edit Supplier</span>
        </h3>

        {formError && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold rounded-lg flex items-start gap-2 mb-4">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Supplier Name *
            </label>
            <input
              type="text"
              required
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Supplier Code *
            </label>
            <input
              type="text"
              required
              value={formCode}
              onChange={(e) => setFormCode(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 uppercase focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Contact Person
            </label>
            <input
              type="text"
              value={formContact}
              onChange={(e) => setFormContact(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
          </div>
          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Phone
              </label>
              <input
                type="text"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Address
            </label>
            <textarea
              value={formAddress}
              onChange={(e) => setFormAddress(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors resize-none"
            />
          </div>
          <label className="flex items-center gap-2.5 text-xs text-slate-300 font-medium cursor-pointer py-1 select-none">
            <input
              type="checkbox"
              checked={formActive}
              onChange={(e) => setFormActive(e.target.checked)}
              className="w-4 h-4 rounded bg-slate-950 border border-slate-800 accent-indigo-600 focus:ring-0 cursor-pointer"
            />
            <span>Active Supplier (enabled for purchases)</span>
          </label>
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800/80">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-900/30 transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting && (
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Invoice Row (collapsible) ────────────────────────────────────────────────

interface InvoiceRowProps {
  invoice: InvoiceEntry;
  canSeeCosts: boolean;
}

function InvoiceRow({ invoice, canSeeCosts }: InvoiceRowProps) {
  const [expanded, setExpanded] = useState(false);

  const totalQtyOrdered = invoice.items.reduce((s, it) => s + it.quantity, 0);
  const totalQtyReceived = invoice.items.reduce((s, it) => s + it.quantityReceived, 0);

  const receivingStatusLabel = () => {
    if (invoice.receivings.length === 0) return "No Receivings";
    const hasApproved = invoice.receivings.some((r) => r.status === "Approved");
    const hasPending = invoice.receivings.some(
      (r) => r.status === "Pending_Approval" || r.status === "Draft"
    );
    if (hasApproved && totalQtyReceived >= totalQtyOrdered) return "Fully Received";
    if (hasApproved) return "Partially Received";
    if (hasPending) return "Pending Receiving Approval";
    return "Draft Receiving";
  };

  const receivingBadge = () => {
    const label = receivingStatusLabel();
    if (label === "Fully Received") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    if (label.includes("Partially")) return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    if (label === "No Receivings") return "bg-slate-800 text-slate-500 border-slate-700";
    return "bg-sky-500/10 text-sky-400 border-sky-500/20";
  };

  return (
    <div className="border border-slate-800 rounded-xl overflow-hidden">
      {/* Invoice Summary Row */}
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full text-left px-4 py-3.5 bg-slate-900 hover:bg-slate-800/60 transition-colors flex flex-wrap items-center gap-3"
      >
        {/* Expand Icon */}
        <span className="text-slate-500 shrink-0">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>

        {/* Invoice number + link */}
        <span className="font-bold text-xs text-indigo-400 shrink-0 font-mono">
          {invoice.invoiceNumber}
        </span>

        {/* Date */}
        <span className="text-xs text-slate-400 shrink-0 flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5 text-slate-500" />
          {formatDate(invoice.invoiceDate)}
        </span>

        {/* Status */}
        <span
          className={`px-2 py-0.5 text-[10px] font-bold rounded-sm border ${getStatusBadge(invoice.status)} shrink-0`}
        >
          {formatStatus(invoice.status)}
        </span>

        {/* Receiving Status */}
        <span
          className={`px-2 py-0.5 text-[10px] font-bold rounded-sm border ${receivingBadge()} shrink-0`}
        >
          {receivingStatusLabel()}
        </span>

        {/* Stats */}
        <span className="text-xs text-slate-400 shrink-0">
          {invoice.itemCount} {invoice.itemCount === 1 ? "item" : "items"}
          {" · "}
          {totalQtyOrdered} ordered / {totalQtyReceived} received
        </span>

        {/* Total — only for cost-visible roles */}
        {canSeeCosts && invoice.total !== undefined && (
          <span className="ml-auto text-xs font-bold text-slate-200 shrink-0">
            PKR {formatCurrency(invoice.total)}
          </span>
        )}

        {/* By */}
        <span className="text-xs text-slate-500 shrink-0 ml-auto">
          by {invoice.createdBy}
        </span>

        {/* Open link */}
        <Link
          href={`/purchase-invoices/${invoice._id}`}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-indigo-400 border border-slate-700 rounded px-2 py-1 transition-colors shrink-0"
          title="Open Invoice"
        >
          <ExternalLink className="w-3 h-3" />
          Open
        </Link>
      </button>

      {/* Expanded: Line Items */}
      {expanded && (
        <div className="bg-slate-950/60 border-t border-slate-800">
          {/* Receiving records summary */}
          {invoice.receivings.length > 0 && (
            <div className="px-4 py-3 border-b border-slate-800/60">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                Receiving Records
              </p>
              <div className="flex flex-wrap gap-2">
                {invoice.receivings.map((rec) => (
                  <span
                    key={rec._id}
                    className={`inline-flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold rounded border ${getStatusBadge(rec.status)}`}
                  >
                    <span className="font-mono">{rec.receivingNumber}</span>
                    <span className="text-slate-500">·</span>
                    <span>{formatStatus(rec.status)}</span>
                    {rec.location && (
                      <>
                        <span className="text-slate-500">·</span>
                        <span>{rec.location.name}</span>
                      </>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Product line items */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-800/60">
                  <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Product
                  </th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    SKU
                  </th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Condition
                  </th>
                  <th className="text-right px-3 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Ordered
                  </th>
                  <th className="text-right px-3 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Received
                  </th>
                  {canSeeCosts && (
                    <th className="text-right px-3 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Unit Cost
                    </th>
                  )}
                  <th className="text-right px-3 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Sell Price
                  </th>
                  <th className="text-right px-3 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Min Price
                  </th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Receiving Refs
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {invoice.items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/20 transition-colors">
                    <td className="px-4 py-2.5">
                      <span className="font-semibold text-slate-200">{item.name}</span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-indigo-300">{item.sku}</td>
                    <td className="px-3 py-2.5">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                        {item.condition}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-300 font-semibold">
                      {item.quantity}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span
                        className={
                          item.quantityReceived >= item.quantity
                            ? "text-emerald-400 font-semibold"
                            : item.quantityReceived > 0
                            ? "text-amber-400 font-semibold"
                            : "text-slate-500"
                        }
                      >
                        {item.quantityReceived}
                      </span>
                    </td>
                    {canSeeCosts && (
                      <td className="px-3 py-2.5 text-right text-slate-300">
                        PKR {formatCurrency(item.unitCost)}
                      </td>
                    )}
                    <td className="px-3 py-2.5 text-right text-slate-300">
                      PKR {formatCurrency(item.sellingPrice)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-400">
                      PKR {formatCurrency(item.minSellingPrice)}
                    </td>
                    <td className="px-3 py-2.5 text-slate-400">
                      {item.receivingRefs.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {item.receivingRefs.map((ref) => (
                            <span
                              key={ref}
                              className="text-[10px] font-mono font-semibold text-teal-400 bg-teal-500/10 border border-teal-500/20 px-1.5 py-0.5 rounded"
                            >
                              {ref}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Invoice totals */}
          {canSeeCosts && (
            <div className="flex justify-end px-4 py-3 border-t border-slate-800/60 gap-6">
              {invoice.subtotal !== undefined && (
                <span className="text-xs text-slate-400">
                  Subtotal:{" "}
                  <span className="font-bold text-slate-200">
                    PKR {formatCurrency(invoice.subtotal)}
                  </span>
                </span>
              )}
              {invoice.total !== undefined && (
                <span className="text-xs text-slate-400">
                  Total:{" "}
                  <span className="font-bold text-indigo-300">
                    PKR {formatCurrency(invoice.total)}
                  </span>
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Product Purchase History Table ───────────────────────────────────────────

interface ProductHistoryProps {
  invoices: InvoiceEntry[];
  canSeeCosts: boolean;
}

function ProductPurchaseHistory({ invoices, canSeeCosts }: ProductHistoryProps) {
  // Flatten all invoice items into purchase history rows
  // Each row = one line item from one invoice (preserving separate purchase batches)
  // Items are identified by their existing product._id (and sku), never by model number
  type HistoryRow = InvoiceLineItem & {
    invoiceNumber: string;
    invoiceId: string;
    invoiceDate: string;
    invoiceStatus: string;
  };

  const rows: HistoryRow[] = invoices.flatMap((inv) =>
    inv.items.map((item) => ({
      ...item,
      invoiceNumber: inv.invoiceNumber,
      invoiceId: inv._id,
      invoiceDate: inv.invoiceDate,
      invoiceStatus: inv.status,
    }))
  );

  if (rows.length === 0) {
    return (
      <div className="text-center py-10 bg-slate-900 border border-slate-800 rounded-xl">
        <Package className="w-10 h-10 text-slate-700 mx-auto mb-2" />
        <p className="text-sm font-semibold text-slate-400">No products purchased yet</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border border-slate-800 rounded-xl">
      <table className="w-full text-xs min-w-[900px]">
        <thead>
          <tr className="bg-slate-900 border-b border-slate-800">
            <th className="text-left px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Product
            </th>
            <th className="text-left px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              SKU
            </th>
            <th className="text-left px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Condition
            </th>
            <th className="text-right px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Ordered
            </th>
            <th className="text-right px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Received
            </th>
            {canSeeCosts && (
              <th className="text-right px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Purchase Rate
              </th>
            )}
            <th className="text-right px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Sell Price
            </th>
            <th className="text-right px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Min Price
            </th>
            <th className="text-left px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Invoice
            </th>
            <th className="text-left px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Date
            </th>
            <th className="text-left px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Receiving Refs
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/50 bg-slate-900/50">
          {rows.map((row, idx) => (
            <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
              <td className="px-4 py-2.5 font-semibold text-slate-200">
                {row.name}
              </td>
              <td className="px-3 py-2.5 font-mono text-indigo-300">{row.sku}</td>
              <td className="px-3 py-2.5">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                  {row.condition}
                </span>
              </td>
              <td className="px-3 py-2.5 text-right text-slate-300 font-semibold">
                {row.quantity}
              </td>
              <td className="px-3 py-2.5 text-right">
                <span
                  className={
                    row.quantityReceived >= row.quantity
                      ? "text-emerald-400 font-semibold"
                      : row.quantityReceived > 0
                      ? "text-amber-400 font-semibold"
                      : "text-slate-500"
                  }
                >
                  {row.quantityReceived}
                </span>
              </td>
              {canSeeCosts && (
                <td className="px-3 py-2.5 text-right text-slate-300">
                  PKR {formatCurrency(row.unitCost)}
                </td>
              )}
              <td className="px-3 py-2.5 text-right text-slate-300">
                PKR {formatCurrency(row.sellingPrice)}
              </td>
              <td className="px-3 py-2.5 text-right text-slate-400">
                PKR {formatCurrency(row.minSellingPrice)}
              </td>
              <td className="px-3 py-2.5">
                <Link
                  href={`/purchase-invoices/${row.invoiceId}`}
                  className="font-mono text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
                >
                  {row.invoiceNumber}
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </td>
              <td className="px-3 py-2.5 text-slate-400">
                {formatDate(row.invoiceDate)}
              </td>
              <td className="px-3 py-2.5">
                {row.receivingRefs.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {row.receivingRefs.map((ref) => (
                      <span
                        key={ref}
                        className="text-[10px] font-mono font-semibold text-teal-400 bg-teal-500/10 border border-teal-500/20 px-1.5 py-0.5 rounded"
                      >
                        {ref}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-slate-600">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SupplierDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [supplier, setSupplier] = useState<SupplierInfo | null>(null);
  const [invoices, setInvoices] = useState<InvoiceEntry[]>([]);
  const [stats, setStats] = useState<SupplierStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userRole, setUserRole] = useState("");
  const [canSeeCosts, setCanSeeCosts] = useState(false);
  const [canEdit, setCanEdit] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"invoices" | "products">("invoices");

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (type: "success" | "error" | "info", text: string) => {
    const toastId = Date.now().toString();
    setToasts((prev) => [...prev, { id: toastId, type, text }]);
  };
  const removeToast = (toastId: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== toastId));
  };

  // Fetch session / role
  useEffect(() => {
    const fetchSession = async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        if (data.success) {
          const role = data.data.role as string;
          setUserRole(role);
          setCanSeeCosts(["Admin", "Warehouse", "Accountant"].includes(role));
          setCanEdit(["Admin", "Warehouse", "Accountant"].includes(role));
        }
      } catch {
        // silently handled below by history fetch
      }
    };
    fetchSession();
  }, []);

  // Fetch supplier + history once role is known
  const fetchHistory = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/suppliers/${id}/history`);
      if (res.status === 403) {
        setError("You do not have permission to view supplier details.");
        setLoading(false);
        return;
      }
      if (res.status === 404) {
        setError("Supplier not found.");
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (data.success) {
        setSupplier(data.data.supplier as SupplierInfo);
        setInvoices(data.data.invoices as InvoiceEntry[]);
        setStats(data.data.stats as SupplierStats);
      } else {
        setError(data.error || "Failed to load supplier history.");
      }
    } catch {
      setError("A network error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-xs">Loading supplier details…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        <button
          onClick={() => router.push("/suppliers")}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Suppliers
        </button>
        <div className="p-5 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm font-semibold rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!supplier) return null;

  const hasHistory = invoices.length > 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Back Navigation */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Link
          href="/suppliers"
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Suppliers
        </Link>

        {canEdit && (
          <button
            onClick={() => setEditOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-800 border border-slate-700 text-slate-300 hover:text-indigo-400 hover:border-indigo-500/40 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            <Edit className="w-3.5 h-3.5" />
            Edit Supplier
          </button>
        )}
      </div>

      {/* ── Supplier Summary Card ─────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          {/* Icon */}
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <Truck className="w-6 h-6 text-indigo-400" />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 space-y-3">
            {/* Name + Status */}
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h1 className="text-xl font-bold text-slate-100 tracking-tight">
                  {supplier.name}
                </h1>
                <span className="px-2 py-0.5 mt-1 inline-block text-[11px] font-bold bg-slate-800 text-indigo-400 border border-slate-700 rounded-sm uppercase">
                  {supplier.code}
                </span>
              </div>
              <span
                className={`px-3 py-1 text-xs font-bold rounded-lg border ${
                  supplier.active
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-slate-800 text-slate-400 border-slate-700"
                }`}
              >
                {supplier.active ? "Active" : "Inactive"}
              </span>
            </div>

            {/* Contact details grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-xs text-slate-400">
              {supplier.contactPerson && (
                <div className="flex items-center gap-2">
                  <UserIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>{supplier.contactPerson}</span>
                </div>
              )}
              {supplier.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>{supplier.phone}</span>
                </div>
              )}
              {supplier.email && (
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span className="break-all">{supplier.email}</span>
                </div>
              )}
              {supplier.address && (
                <div className="flex items-start gap-2 sm:col-span-2">
                  <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                  <span className="leading-normal">{supplier.address}</span>
                </div>
              )}
              {!supplier.contactPerson && !supplier.phone && !supplier.email && !supplier.address && (
                <span className="text-slate-600 italic">No contact details on record.</span>
              )}
            </div>

            {/* Timestamps */}
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-500 pt-1 border-t border-slate-800">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Added {formatDate(supplier.createdAt)}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Updated {formatDate(supplier.updatedAt)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Purchase Statistics ───────────────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Total Invoices */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" />
              Invoices
            </span>
            <span className="text-2xl font-bold text-slate-100">{stats.totalInvoices}</span>
          </div>

          {/* Total Unique Items */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <Package className="w-3.5 h-3.5" />
              Line Items
            </span>
            <span className="text-2xl font-bold text-slate-100">{stats.totalItems}</span>
          </div>

          {/* Total Qty Ordered */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <ShoppingCart className="w-3.5 h-3.5" />
              Qty Ordered
            </span>
            <span className="text-2xl font-bold text-slate-100">{stats.totalQtyOrdered}</span>
          </div>

          {/* Total Qty Received */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" />
              Qty Received
            </span>
            <span
              className={`text-2xl font-bold ${
                stats.totalQtyReceived >= stats.totalQtyOrdered && stats.totalQtyOrdered > 0
                  ? "text-emerald-400"
                  : stats.totalQtyReceived > 0
                  ? "text-amber-400"
                  : "text-slate-100"
              }`}
            >
              {stats.totalQtyReceived}
            </span>
          </div>

          {/* Total Purchase Value — privileged roles only */}
          {canSeeCosts && stats.totalPurchaseValue !== undefined && (
            <div className="bg-slate-900 border border-indigo-500/20 rounded-xl p-4 flex flex-col gap-1 sm:col-span-1 lg:col-span-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <BarChart2 className="w-3.5 h-3.5" />
                Total Value
              </span>
              <span className="text-xl font-bold text-indigo-300">
                PKR {formatCurrency(stats.totalPurchaseValue)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Inactive warning ─────────────────────────────────────────────── */}
      {!supplier.active && (
        <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-xs font-semibold">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            This supplier is currently <strong>Inactive</strong>. They cannot be selected for new
            purchase invoices. Historical records below are preserved.
          </span>
        </div>
      )}

      {/* ── No Purchase History Empty State ──────────────────────────────── */}
      {!hasHistory && (
        <div className="text-center py-16 bg-slate-900 border border-slate-800 rounded-xl">
          <ShoppingCart className="w-12 h-12 text-slate-700 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-300">No Purchase History</h3>
          <p className="text-xs text-slate-500 mt-1.5 px-4 max-w-sm mx-auto">
            No purchase invoices have been created for this supplier yet.
          </p>
          <Link
            href="/purchase-invoices/new"
            className="inline-flex items-center gap-1.5 mt-5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            Create First Invoice
          </Link>
        </div>
      )}

      {/* ── Tabbed History ───────────────────────────────────────────────── */}
      {hasHistory && (
        <div className="space-y-4">
          {/* Tab Header */}
          <div className="flex items-center gap-1 border-b border-slate-800 pb-0">
            <button
              onClick={() => setActiveTab("invoices")}
              className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors cursor-pointer border-b-2 -mb-px ${
                activeTab === "invoices"
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                Purchase Invoices ({invoices.length})
              </span>
            </button>
            <button
              onClick={() => setActiveTab("products")}
              className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors cursor-pointer border-b-2 -mb-px ${
                activeTab === "products"
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5" />
                Product Purchase History
              </span>
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === "invoices" && (
            <div className="space-y-3">
              {invoices.map((inv) => (
                <InvoiceRow
                  key={inv._id}
                  invoice={inv}
                  canSeeCosts={canSeeCosts}
                />
              ))}
            </div>
          )}

          {activeTab === "products" && (
            <ProductPurchaseHistory
              invoices={invoices}
              canSeeCosts={canSeeCosts}
            />
          )}
        </div>
      )}

      {/* ── Edit Modal ───────────────────────────────────────────────────── */}
      {editOpen && supplier && (
        <EditSupplierModal
          supplier={supplier}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => {
            setSupplier({ ...supplier, ...updated });
            fetchHistory();
          }}
          addToast={addToast}
        />
      )}

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
