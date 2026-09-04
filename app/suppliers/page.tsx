"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Truck,
  Plus,
  Search,
  Edit,
  Trash2,
  Phone,
  Mail,
  MapPin,
  User as UserIcon,
  AlertCircle,
  X,
  CheckCircle,
} from "lucide-react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { ToastContainer, ToastMessage } from "@/components/Toast";

interface SupplierItem {
  _id: string;
  name: string;
  code: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  active: boolean;
  createdAt: string;
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<SupplierItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userRole, setUserRole] = useState<string>("");

  // Search & Filter
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);

  // Form States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierItem | null>(null);
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formContact, setFormContact] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Confirm Modal & Toasts
  const [deleteTarget, setDeleteTarget] = useState<SupplierItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (type: "success" | "error" | "info", text: string) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, type, text }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // 1. Fetch user role & session info
  useEffect(() => {
    const fetchSession = async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        if (data.success) {
          setUserRole(data.data.role);
        }
      } catch {
        setError("Failed to fetch authorization session.");
      }
    };
    fetchSession();
  }, []);

  // 2. Fetch suppliers with query search
  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.append("search", search);
      if (activeOnly) params.append("activeOnly", "true");

      const res = await fetch(`/api/suppliers?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setSuppliers(data.data);
      } else {
        setError(data.error || "Failed to load suppliers.");
      }
    } catch {
      setError("Failed to fetch suppliers from server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userRole) {
      fetchSuppliers();
    }
  }, [userRole, search, activeOnly]);

  // Open Form for Create/Edit
  const openForm = (supplier: SupplierItem | null = null) => {
    setEditingSupplier(supplier);
    setFormName(supplier ? supplier.name : "");
    setFormCode(supplier ? supplier.code : "");
    setFormContact(supplier ? supplier.contactPerson || "" : "");
    setFormPhone(supplier ? supplier.phone || "" : "");
    setFormEmail(supplier ? supplier.email || "" : "");
    setFormAddress(supplier ? supplier.address || "" : "");
    setFormActive(supplier ? supplier.active : true);
    setFormError("");
    setIsFormOpen(true);
  };

  // Submit Form (Create / Edit)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formCode.trim()) {
      setFormError("Supplier Name and Code are required.");
      return;
    }

    setSubmitting(true);
    setFormError("");

    const payload = {
      name: formName.trim(),
      code: formCode.trim().toUpperCase(),
      contactPerson: formContact.trim() || undefined,
      phone: formPhone.trim() || undefined,
      email: formEmail.trim() || undefined,
      address: formAddress.trim() || undefined,
      active: formActive,
    };

    try {
      const url = editingSupplier ? `/api/suppliers/${editingSupplier._id}` : "/api/suppliers";
      const method = editingSupplier ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        addToast("success", `Supplier ${editingSupplier ? "updated" : "created"} successfully!`);
        setIsFormOpen(false);
        fetchSuppliers();
      } else {
        setFormError(data.error || "Failed to save supplier.");
      }
    } catch {
      setFormError("A network error occurred while saving.");
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Action
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/suppliers/${deleteTarget._id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        addToast("success", "Supplier deleted successfully!");
        setDeleteTarget(null);
        fetchSuppliers();
      } else {
        addToast("error", data.error || "Failed to delete supplier.");
      }
    } catch {
      addToast("error", "Network error. Failed to delete supplier.");
    } finally {
      setDeleting(false);
    }
  };

  // Roles verification helpers
  const isAdmin = userRole === "Admin";
  const isWarehouse = userRole === "Warehouse";
  const isAccountant = userRole === "Accountant";
  const canMutate = isAdmin || isWarehouse;
  const canEdit = isAdmin || isWarehouse || isAccountant;
  const canDelete = isAdmin || isWarehouse;

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <Truck className="w-5 h-5 text-indigo-400" />
            <span>Supplier Master</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Manage system suppliers and vendor details for purchase workflows
          </p>
        </div>

        {canMutate && (
          <button
            onClick={() => openForm(null)}
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-indigo-900/30 transition-colors cursor-pointer w-full sm:w-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Add Supplier</span>
          </button>
        )}
      </div>

      {/* Filter and Search Panel */}
      <div className="bg-slate-900 p-4 border border-slate-800 rounded-xl flex flex-col md:flex-row items-center gap-3">
        <div className="relative w-full md:flex-1">
          <Search className="absolute left-3 top-3.5 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by supplier name, code, contact..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
          />
        </div>

        <label className="flex items-center gap-2.5 text-xs text-slate-300 font-medium shrink-0 cursor-pointer self-start md:self-auto py-2 md:py-0">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
            className="w-4 h-4 rounded bg-slate-950 border border-slate-800 accent-indigo-600 focus:ring-0 cursor-pointer"
          />
          <span>Show Active Only</span>
        </label>
      </div>

      {/* Loading & Error States */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-slate-900 border border-slate-800 rounded-xl">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
          <span className="text-xs">Loading suppliers list...</span>
        </div>
      )}

      {!loading && error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold rounded-xl flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && suppliers.length === 0 && (
        <div className="text-center py-16 bg-slate-900 border border-slate-800 rounded-xl">
          <Truck className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-200">No Suppliers Found</h3>
          <p className="text-xs text-slate-400 mt-1 px-4">
            Try adjusting your search criteria or register a new supplier to get started.
          </p>
        </div>
      )}

      {/* Suppliers Table/Card Grid */}
      {!loading && !error && suppliers.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {suppliers.map((supplier) => (
            <div
              key={supplier._id}
              className="bg-slate-900 border border-slate-800 rounded-xl p-4.5 shadow-sm flex flex-col justify-between hover:border-slate-700 transition-colors"
            >
              <div className="space-y-3">
                {/* Supplier Header — clicking the name navigates to detail page */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link
                      href={`/suppliers/${supplier._id}`}
                      className="group"
                    >
                      <h3 className="text-sm font-bold text-slate-100 tracking-tight leading-snug group-hover:text-indigo-400 transition-colors">
                        {supplier.name}
                      </h3>
                    </Link>
                    <span className="px-2 py-0.5 mt-1 inline-block text-[10px] font-bold bg-slate-800 text-indigo-400 border border-slate-700/80 rounded-sm uppercase">
                      Code: {supplier.code}
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold rounded-sm border ${
                      supplier.active
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : "bg-slate-800 text-slate-400 border-slate-700"
                    }`}
                  >
                    {supplier.active ? "Active" : "Inactive"}
                  </span>
                </div>

                {/* Details Section */}
                <div className="pt-2 border-t border-slate-800/80 space-y-2 text-xs text-slate-400">
                  {supplier.contactPerson && (
                    <div className="flex items-center gap-2">
                      <UserIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="truncate">{supplier.contactPerson}</span>
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
                      <span className="truncate">{supplier.email}</span>
                    </div>
                  )}
                  {supplier.address && (
                    <div className="flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                      <span className="line-clamp-2 leading-normal">{supplier.address}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions Footer */}
              <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-slate-800/80">
                {/* View Details — always visible */}
                <Link
                  href={`/suppliers/${supplier._id}`}
                  className="flex items-center gap-1 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 transition-colors px-2 py-1 rounded"
                >
                  <span>View Details →</span>
                </Link>

                {/* Edit / Delete — only for authorised roles */}
                {canEdit && (
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={() => openForm(supplier)}
                      className="flex items-center gap-1 text-[11px] font-semibold text-slate-300 hover:text-indigo-400 transition-colors px-2 py-1 hover:bg-slate-850 rounded cursor-pointer"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                    {canDelete && (
                      <button
                        onClick={() => setDeleteTarget(supplier)}
                        className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-rose-450 transition-colors px-2 py-1 hover:bg-slate-850 rounded cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Supplier Create/Edit Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-md w-full p-6 text-slate-100 relative">
            <button
              onClick={() => setIsFormOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2 mb-4">
              <Truck className="w-4.5 h-4.5 text-indigo-400" />
              <span>{editingSupplier ? "Edit Supplier" : "Register Supplier"}</span>
            </h3>

            {formError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold rounded-lg flex items-start gap-2 mb-4">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
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
                  placeholder="e.g. Sony Distribution"
                />
              </div>

              {/* Code */}
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Supplier Code *
                </label>
                <input
                  type="text"
                  required
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors uppercase"
                  placeholder="e.g. SONY-DIST"
                />
              </div>

              {/* Contact Person */}
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Contact Person
                </label>
                <input
                  type="text"
                  value={formContact}
                  onChange={(e) => setFormContact(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                  placeholder="Name of contact person"
                />
              </div>

              {/* Phone & Email */}
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
                    placeholder="Phone number"
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
                    placeholder="Email address"
                  />
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Address
                </label>
                <textarea
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors resize-none"
                  placeholder="Supplier office address"
                />
              </div>

              {/* Status Toggle */}
              <label className="flex items-center gap-2.5 text-xs text-slate-300 font-medium shrink-0 cursor-pointer py-1 select-none">
                <input
                  type="checkbox"
                  checked={formActive}
                  onChange={(e) => setFormActive(e.target.checked)}
                  className="w-4 h-4 rounded bg-slate-950 border border-slate-800 accent-indigo-600 focus:ring-0 cursor-pointer"
                />
                <span>Active Supplier (enabled for purchases)</span>
              </label>

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-900/30 transition-colors flex items-center gap-2 cursor-pointer"
                >
                  {submitting && (
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  <span>Save Supplier</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteTarget !== null}
        title="Delete Supplier"
        message={`Are you sure you want to permanently delete supplier "${deleteTarget?.name}"? This action cannot be undone and will remove all their registered contact details.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isDanger={true}
        isLoading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Toast Alerts Container */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
