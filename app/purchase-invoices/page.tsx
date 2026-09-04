"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  FileText,
  Plus,
  Search,
  Filter,
  User as UserIcon,
  Calendar,
  Layers,
  ChevronRight,
  AlertCircle,
  Truck,
} from "lucide-react";
import { ToastContainer, ToastMessage } from "@/components/Toast";

interface InvoiceItem {
  _id: string;
  invoiceNumber: string;
  supplier: { _id: string; name: string; code: string };
  invoiceDate: string;
  status: "Draft" | "Pending_Approval" | "Approved" | "Rejected";
  total: number;
  createdBy: string;
  createdAt: string;
}

export default function PurchaseInvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [suppliers, setSuppliers] = useState<{ _id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userRole, setUserRole] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const addToast = (type: "success" | "error" | "info", text: string) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, type, text }]);
  };
  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Fetch session & roles
  useEffect(() => {
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
    fetchSession();
  }, []);

  // Fetch suppliers for filter dropdown
  const fetchSuppliers = async () => {
    try {
      const res = await fetch("/api/suppliers?activeOnly=true");
      const data = await res.json();
      if (data.success) {
        setSuppliers(data.data);
      }
    } catch {
      console.error("Failed to load suppliers for filters");
    }
  };

  // Fetch Invoices
  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.append("search", search);
      if (selectedSupplier) params.append("supplier", selectedSupplier);
      if (selectedStatus) params.append("status", selectedStatus);

      const res = await fetch(`/api/purchase-invoices?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setInvoices(data.data);
      } else {
        setError(data.error || "Failed to load purchase invoices.");
      }
    } catch {
      setError("Failed to fetch purchase invoices from server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userRole) {
      fetchSuppliers();
      fetchInvoices();
    }
  }, [userRole, search, selectedSupplier, selectedStatus]);

  const getStatusBadge = (status: InvoiceItem["status"]) => {
    switch (status) {
      case "Approved":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "Pending_Approval":
        return "bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse";
      case "Rejected":
        return "bg-rose-500/10 text-rose-400 border-rose-500/20";
      default:
        return "bg-slate-800 text-slate-400 border-slate-700";
    }
  };

  const getStatusLabel = (status: InvoiceItem["status"]) => {
    return status.replace("_", " ");
  };

  const canCreate = userRole === "Admin" || userRole === "Warehouse";

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-400" />
            <span>Purchase Invoices</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Track and manage purchase invoices, supplier receipts, and accountant approvals
          </p>
        </div>

        {canCreate && (
          <Link
            href="/purchase-invoices/new"
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-indigo-900/30 transition-colors cursor-pointer w-full sm:w-auto"
          >
            <Plus className="w-4 h-4" />
            <span>New Purchase Invoice</span>
          </Link>
        )}
      </div>

      {/* Filter and Search Panel */}
      <div className="bg-slate-900 p-4 border border-slate-800 rounded-xl grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by invoice number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
          />
        </div>

        {/* Supplier Filter */}
        <div className="relative">
          <Truck className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
          <select
            value={selectedSupplier}
            onChange={(e) => setSelectedSupplier(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors cursor-pointer appearance-none"
          >
            <option value="">All Suppliers</option>
            {suppliers.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div className="relative">
          <Filter className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors cursor-pointer appearance-none"
          >
            <option value="">All Statuses</option>
            <option value="Draft">Draft</option>
            <option value="Pending_Approval">Pending Approval</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* Loading & Error States */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-slate-900 border border-slate-800 rounded-xl">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
          <span className="text-xs">Loading purchase history...</span>
        </div>
      )}

      {!loading && error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold rounded-xl flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && invoices.length === 0 && (
        <div className="text-center py-16 bg-slate-900 border border-slate-800 rounded-xl">
          <FileText className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-200">No Invoices Found</h3>
          <p className="text-xs text-slate-400 mt-1 px-4">
            Try adjusting your search criteria or register a new purchase invoice.
          </p>
        </div>
      )}

      {/* Invoice List Table (Desktop) / Cards (Mobile) */}
      {!loading && !error && invoices.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xs">
          {/* Table for larger devices */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
                  <th className="p-4">Invoice #</th>
                  <th className="p-4">Supplier</th>
                  <th className="p-4">Invoice Date</th>
                  <th className="p-4">Created By</th>
                  <th className="p-4">Total Amount</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-350">
                {invoices.map((inv) => (
                  <tr key={inv._id} className="hover:bg-slate-850 transition-colors">
                    <td className="p-4 font-bold text-slate-200 tracking-tight">{inv.invoiceNumber}</td>
                    <td className="p-4 font-medium text-slate-300">
                      <div>{inv.supplier?.name}</div>
                      <div className="text-[10px] text-slate-500 font-bold">{inv.supplier?.code}</div>
                    </td>
                    <td className="p-4">{new Date(inv.invoiceDate).toLocaleDateString()}</td>
                    <td className="p-4 font-medium text-slate-400">{inv.createdBy}</td>
                    <td className="p-4 font-bold text-slate-200">
                      Rs. {inv.total.toLocaleString("en-PK")}
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-sm border ${getStatusBadge(inv.status)}`}>
                        {getStatusLabel(inv.status)}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <Link
                        href={`/purchase-invoices/${inv._id}`}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 px-2 py-1 bg-slate-800/80 border border-slate-700/60 rounded"
                      >
                        <span>View Details</span>
                        <ChevronRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards for mobile devices */}
          <div className="block md:hidden divide-y divide-slate-800/60">
            {invoices.map((inv) => (
              <div key={inv._id} className="p-4 space-y-3.5 hover:bg-slate-850/30 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-200 tracking-tight">{inv.invoiceNumber}</span>
                  <span className={`px-2 py-0.5 text-[9px] font-bold rounded-sm border ${getStatusBadge(inv.status)}`}>
                    {getStatusLabel(inv.status)}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-400">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200">{inv.supplier?.name}</span>
                    <span className="text-[10px] text-slate-500 font-bold uppercase">{inv.supplier?.code}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      <span>{new Date(inv.invoiceDate).toLocaleDateString()}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <UserIcon className="w-3.5 h-3.5 text-slate-500" />
                      <span>{inv.createdBy}</span>
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800/40">
                  <div className="text-xs font-bold text-slate-100">
                    Rs. {inv.total.toLocaleString("en-PK")}
                  </div>
                  <Link
                    href={`/purchase-invoices/${inv._id}`}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300"
                  >
                    <span>View Details</span>
                    <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Toast Alert Elements */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
