"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  Filter,
  Plus,
  Eye,
  Edit,
  Trash2,
  Barcode as BarcodeIcon,
  Tag,
  Folder,
  Layers,
  ArrowUpDown,
  RefreshCw,
  AlertCircle,
  PackageX,
  Lock,
  Camera,
} from "lucide-react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { ToastContainer, ToastMessage } from "@/components/Toast";
import { CameraBarcodeScannerModal } from "@/components/CameraBarcodeScannerModal";
import {
  DEFAULT_PRODUCT_CONDITION,
  getConditionBadgeClasses,
  type ProductCondition,
} from "@/lib/productCondition";
import type { ProductImage } from "@/models/Product";

interface ProductItem {
  _id: string;
  name: string;
  brand?: string;
  modelNumber?: string;
  model?: string;
  color?: string;
  sku: string;
  barcode?: string;
  condition?: ProductCondition;
  costPrice: number;
  sellingPrice: number;
  minSellingPrice: number;
  active: boolean;
  images: ProductImage[] | string[];
  category?: { _id: string; name: string };
  productGroup?: { _id: string; name: string };
  createdAt: string;
}

export default function ProductListPage() {
  const router = useRouter();
  const [userRole, setUserRole] = useState<string | null>(null);
  // State
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters & Search
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [selectedCondition, setSelectedCondition] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Options for dropdown filters
  const [categories, setCategories] = useState<{ _id: string; name: string }[]>([]);
  const [groups, setGroups] = useState<{ _id: string; name: string }[]>([]);

  // Modals & Camera Scanner
  const [deleteProduct, setDeleteProduct] = useState<ProductItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [cameraScannerOpen, setCameraScannerOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (type: "success" | "error" | "info", text: string) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, type, text }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Verify RBAC access
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        if (data.success) {
          setUserRole(data.data.role);
          if (data.data.role !== "Admin" && data.data.role !== "Warehouse") {
            setError("Access Denied. Only Admin and Warehouse roles can access the Product Directory.");
          }
        } else {
          router.replace("/login");
        }
      } catch {
        router.replace("/login");
      }
    };
    checkAuth();
  }, [router]);

  // Requirement 7: Debounce search input (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchInput]);

  // Fetch Metadata (Categories, Groups)
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const [cRes, gRes] = await Promise.all([
          fetch("/api/categories"),
          fetch("/api/product-groups"),
        ]);
        const [cData, gData] = await Promise.all([
          cRes.json(),
          gRes.json(),
        ]);

        if (cData.success) setCategories(cData.data);
        if (gData.success) setGroups(gData.data);
      } catch (err) {
        console.error("Failed to load metadata filters:", err);
      }
    };
    fetchMetadata();
  }, []);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch Products
  const fetchProducts = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const signal = controller.signal;

    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.append("search", debouncedSearch);
      if (selectedCategory) params.append("category", selectedCategory);
      if (selectedGroup) params.append("productGroup", selectedGroup);
      if (selectedCondition) params.append("condition", selectedCondition);
      if (selectedStatus !== "all") params.append("status", selectedStatus);
      params.append("sortBy", sortBy);
      params.append("sortOrder", sortOrder);

      const res = await fetch(`/api/products?${params.toString()}`, { signal });
      if (signal.aborted) return;
      const data = await res.json();

      if (signal.aborted) return;

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to fetch products");
      }

      setProducts(data.data);
    } catch (err: any) {
      if (err.name === "AbortError" || signal.aborted) {
        return;
      }
      setError(err.message || "An error occurred while loading products");
      addToast("error", err.message || "Failed to load products");
    } finally {
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  }, [
    debouncedSearch,
    selectedCategory,
    selectedGroup,
    selectedCondition,
    selectedStatus,
    sortBy,
    sortOrder,
  ]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Handle Soft Delete
  const handleConfirmDelete = async () => {
    if (!deleteProduct) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/products/${deleteProduct._id}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to delete product");
      }

      addToast("success", `Product "${deleteProduct.name}" soft deleted successfully.`);
      setDeleteProduct(null);
      fetchProducts();
    } catch (err: any) {
      addToast("error", err.message || "Failed to delete product");
    } finally {
      setDeleting(false);
    }
  };

  // Camera Scan Success Handler
  const handleCameraScanSuccess = (scannedCode: string) => {
    setSearchInput(scannedCode);
    addToast("success", `Scanned Barcode: ${scannedCode}`);
  };

  if (error && error.includes("Access Denied")) {
    return (
      <div className="space-y-6 pb-12 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="w-16 h-16 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-500 border border-rose-500/20 mb-4 animate-pulse">
          <Lock className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold text-slate-100">Access Denied</h1>
        <p className="text-slate-450 text-sm max-w-sm mt-2 leading-relaxed">
          Only Admin and Warehouse roles are allowed to access the Product Directory page.
        </p>
        <div className="mt-6 flex gap-4">
          <Link
            href="/price-lookup"
            className="px-5 py-2.5 bg-indigo-650 hover:bg-indigo-600 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
          >
            Go to Price Lookup
          </Link>
          <Link
            href="/inventory"
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-350 text-xs font-bold rounded-lg transition-colors cursor-pointer"
          >
            Go to Inventory
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onClose={removeToast} />

      {/* Camera Barcode Scanner Modal */}
      <CameraBarcodeScannerModal
        isOpen={cameraScannerOpen}
        onClose={() => setCameraScannerOpen(false)}
        onScanSuccess={handleCameraScanSuccess}
      />

      {/* Soft Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deleteProduct)}
        title="Delete Product"
        message={`Are you sure you want to delete "${deleteProduct?.name}"? Safe soft deletion will preserve references for future transactions.`}
        confirmLabel="Yes, Delete Product"
        cancelLabel="Cancel"
        isDanger={true}
        isLoading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteProduct(null)}
      />

      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight">
            Product Directory
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Manage products — New and Used are separate records with their own SKU, barcode, stock, and price.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchProducts}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-300 transition-colors"
            title="Refresh List"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <Link
            href="/products/new"
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm shadow-md shadow-indigo-900/30 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add New Product
          </Link>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-4">
        {/* Prominent Search Input with Camera Scanner Button */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by Product Name, SKU, Barcode, or Model..."
              className="w-full pl-11 pr-16 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput("")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs bg-slate-800 text-slate-400 hover:text-slate-200 px-2 py-1 rounded"
              >
                Clear
              </button>
            )}
          </div>

          {/* Camera Scanner Trigger Button */}
          <button
            type="button"
            onClick={() => setCameraScannerOpen(true)}
            className="flex items-center gap-2 px-3.5 py-3 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-xl font-semibold text-xs transition-colors shrink-0"
            title="Scan product barcode using phone/laptop camera"
          >
            <Camera className="w-4 h-4" />
            <span className="hidden sm:inline">Scan with Camera</span>
          </button>
        </div>

        {/* Filter Dropdowns & Sorting */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Category Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Category
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Product Group Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Product Family / Group
            </label>
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
            >
              <option value="">All Product Groups</option>
              {groups.map((g) => (
                <option key={g._id} value={g._id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          {/* Condition Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Condition
            </label>
            <select
              value={selectedCondition}
              onChange={(e) => setSelectedCondition(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
            >
              <option value="">All Conditions</option>
              <option value="New">New Only</option>
              <option value="Used">Used Only</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Status
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>
        </div>

        {/* Sorting controls bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-300">
              Showing {products.length} product{products.length === 1 ? "" : "s"}
            </span>
            {debouncedSearch && (
              <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded">
                Query: &quot;{debouncedSearch}&quot;
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <span>Sort by:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-slate-200 px-2 py-1 rounded focus:outline-none"
              >
                <option value="createdAt">Date Created</option>
                <option value="name">Product Name</option>
                <option value="price">Selling Price</option>
                <option value="sku">SKU</option>
              </select>
            </div>

            <button
              onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
              className="px-2 py-1 bg-slate-950 border border-slate-800 rounded font-mono text-slate-300 hover:text-white"
            >
              {sortOrder.toUpperCase()}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area: Loading / Error / Empty / Product List */}
      {loading ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
          <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-medium text-slate-400">Loading products...</p>
        </div>
      ) : error ? (
        <div className="bg-rose-950/30 border border-rose-800/40 rounded-2xl p-8 text-center space-y-3">
          <AlertCircle className="w-10 h-10 text-rose-400 mx-auto" />
          <h3 className="text-base font-semibold text-rose-200">{error}</h3>
          <button
            onClick={fetchProducts}
            className="px-4 py-2 bg-rose-900/50 hover:bg-rose-900 text-rose-200 rounded-lg text-xs font-semibold"
          >
            Try Again
          </button>
        </div>
      ) : products.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-4">
          <div className="w-14 h-14 bg-slate-800 text-slate-500 rounded-2xl flex items-center justify-center mx-auto">
            <PackageX className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-200">No product found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
              {debouncedSearch
                ? `No product found matching barcode or search query "${debouncedSearch}".`
                : selectedCategory || selectedGroup || selectedCondition
                ? "No products found matching the selected filters."
                : "Get started by adding your first product record into the system."}
            </p>
          </div>
          {debouncedSearch ? (
            <button
              onClick={() => setSearchInput("")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700"
            >
              Clear Search Query
            </button>
          ) : (
            <Link
              href="/products/new"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm shadow-md"
            >
              <Plus className="w-4 h-4" />
              Create First Product
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* Mobile Card List View (Visible on Small Screens < md) */}
          <div className="grid grid-cols-1 gap-4.5 md:hidden">
            {products.map((p) => (
              <div
                key={p._id}
                className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 hover:border-slate-700 transition-all shadow-sm"
              >
                {/* Top Row: Name & Status */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-100 text-base leading-snug">
                      {p.name}
                    </h3>
                    {p.brand && (
                      <span className="text-xs text-indigo-300 font-semibold block">{p.brand}</span>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span
                        className={`inline-flex px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full ${getConditionBadgeClasses(p.condition || DEFAULT_PRODUCT_CONDITION)}`}
                      >
                        {p.condition || DEFAULT_PRODUCT_CONDITION}
                      </span>
                      <span className="inline-flex px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20">
                        Color: {p.color || "Unspecified"}
                      </span>
                      {p.productGroup?.name && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-slate-800 text-amber-300 px-2 py-0.5 rounded border border-slate-700">
                          <Folder className="w-3 h-3 text-amber-400" />
                          {p.productGroup.name}
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full ${
                      p.active
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-slate-800 text-slate-400 border border-slate-700"
                    }`}
                  >
                    {p.active ? "Active" : "Inactive"}
                  </span>
                </div>

                {/* Identifiers: SKU & Barcode */}
                <div className="grid grid-cols-2 gap-2 text-xs bg-slate-950 p-2.5 rounded-lg border border-slate-800/80">
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-semibold">
                      SKU
                    </span>
                    <span className="font-mono font-semibold text-slate-200">{p.sku}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-semibold">
                      Barcode
                    </span>
                    {p.barcode ? (
                      <span className="font-mono font-semibold text-indigo-300 flex items-center gap-1">
                        <BarcodeIcon className="w-3 h-3" /> {p.barcode}
                      </span>
                    ) : (
                      <span className="text-slate-600 italic">No Barcode</span>
                    )}
                  </div>
                </div>

                {/* Product Image Thumbnail */}
                {p.images && Array.isArray(p.images) && p.images.length > 0 && (
                  <div className="aspect-square bg-slate-950 rounded-lg overflow-hidden border border-slate-800">
                    <img
                      src={
                        typeof p.images[0] === 'string'
                          ? p.images[0]
                          : (p.images as any).find((img: any) => img.isPrimary)?.url || (p.images as any)[0]?.url
                      }
                      alt={p.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                {/* Price Display */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                  <div>
                    <span className="text-[10px] uppercase text-slate-400 font-semibold block">
                      Selling Price
                    </span>
                    <span className="text-lg font-extrabold text-slate-100">
                      Rs. {p.sellingPrice.toLocaleString("en-PK")}
                    </span>
                  </div>

                  {/* Internal Cost Price Tag */}
                  <div className="text-right">
                    <span className="text-[10px] uppercase text-slate-400 font-semibold flex items-center gap-1 justify-end">
                      <Lock className="w-2.5 h-2.5 text-amber-400" /> Cost (Internal)
                    </span>
                    <span className="text-xs font-semibold text-slate-400">
                      Rs. {p.costPrice.toLocaleString("en-PK")}
                    </span>
                  </div>
                </div>

                {/* Large Touch Target Action Buttons */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800">
                  <Link
                    href={`/products/${p._id}`}
                    className="flex items-center justify-center gap-1.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5 text-indigo-400" />
                    View
                  </Link>

                  <Link
                    href={`/products/${p._id}/edit`}
                    className="flex items-center justify-center gap-1.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors"
                  >
                    <Edit className="w-3.5 h-3.5 text-emerald-400" />
                    Edit
                  </Link>

                  <button
                    type="button"
                    onClick={() => setDeleteProduct(p)}
                    className="flex items-center justify-center gap-1.5 py-2 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 text-xs font-semibold rounded-lg border border-rose-800/50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View (Visible on Desktop >= md) */}
          <div className="hidden md:block bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-950 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-5 py-4">Product Name</th>
                    <th className="px-4 py-4">Condition</th>
                    <th className="px-4 py-4">Group</th>
                    <th className="px-4 py-4">SKU / Barcode</th>
                    <th className="px-4 py-4">Selling Price</th>
                    <th className="px-4 py-4">Internal Cost</th>
                    <th className="px-4 py-4">Status</th>
                    <th className="px-5 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium">
                  {products.map((p) => (
                    <tr
                      key={p._id}
                      className="hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Product Name */}
                      <td className="px-5 py-4">
                        <Link
                          href={`/products/${p._id}`}
                          className="font-bold text-slate-100 hover:text-indigo-400 transition-colors block"
                        >
                          {p.name}
                        </Link>
                        {p.brand && (
                          <span className="text-xs text-indigo-300 font-medium block">
                            {p.brand}
                          </span>
                        )}
                        {(p.modelNumber || p.model) && (
                          <span className="text-xs text-slate-400 font-normal block font-mono">
                            Model: {p.modelNumber || p.model}
                          </span>
                        )}
                      </td>

                      {/* Condition & Color */}
                      <td className="px-4 py-4 space-y-1">
                        <div>
                          <span
                            className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full ${getConditionBadgeClasses(p.condition || DEFAULT_PRODUCT_CONDITION)}`}
                          >
                            {p.condition || DEFAULT_PRODUCT_CONDITION}
                          </span>
                        </div>
                        <div>
                          <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20">
                            {p.color || "Unspecified"}
                          </span>
                        </div>
                      </td>

                      {/* Group */}
                      <td className="px-4 py-4">
                        {p.productGroup?.name ? (
                          <div className="flex items-center gap-1.5 text-[11px] text-amber-300 font-semibold">
                            <Folder className="w-3 h-3 text-amber-400" />
                            {p.productGroup.name}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">No Group</span>
                        )}
                      </td>

                      {/* SKU / Barcode */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          {/* Image Thumbnail */}
                          {p.images && Array.isArray(p.images) && p.images.length > 0 && (
                            <div className="w-12 h-12 bg-slate-950 rounded-lg overflow-hidden border border-slate-800 shrink-0">
                              <img
                                src={
                                  typeof p.images[0] === 'string'
                                    ? p.images[0]
                                    : (p.images as any).find((img: any) => img.isPrimary)?.url || (p.images as any)[0]?.url
                                }
                                alt={p.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}
                          <div className="font-mono text-xs">
                            <div className="text-slate-200 font-semibold">{p.sku}</div>
                            {p.barcode ? (
                              <div className="text-indigo-300 flex items-center gap-1 mt-0.5">
                                <BarcodeIcon className="w-3 h-3" /> {p.barcode}
                              </div>
                            ) : (
                              <div className="text-slate-500 italic text-[11px]">No Barcode</div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Selling Price */}
                      <td className="px-4 py-4 font-bold text-slate-100 text-base">
                        Rs. {p.sellingPrice.toLocaleString("en-PK")}
                      </td>

                      {/* Internal Cost Price */}
                      <td className="px-4 py-4">
                        <span className="text-xs font-semibold text-slate-400 bg-slate-950 px-2 py-1 rounded border border-slate-800">
                          Rs. {p.costPrice.toLocaleString("en-PK")}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-4">
                        <span
                          className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full ${
                            p.active
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-slate-800 text-slate-400 border border-slate-700"
                          }`}
                        >
                          {p.active ? "Active" : "Inactive"}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={`/products/${p._id}`}
                            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors"
                            title="View Product"
                          >
                            <Eye className="w-4 h-4 text-indigo-400" />
                          </Link>
                          <Link
                            href={`/products/${p._id}/edit`}
                            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors"
                            title="Edit Product"
                          >
                            <Edit className="w-4 h-4 text-emerald-400" />
                          </Link>
                          <button
                            type="button"
                            onClick={() => setDeleteProduct(p)}
                            className="p-2 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 hover:text-rose-200 rounded-lg border border-rose-800/40 transition-colors"
                            title="Soft Delete Product"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
