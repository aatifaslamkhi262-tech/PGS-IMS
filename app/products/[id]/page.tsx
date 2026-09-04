"use client";

import React, { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Edit,
  Trash2,
  Folder,
  Layers,
  Barcode as BarcodeIcon,
  Lock,
  Info,
  Calendar,
  Layers3,
  CheckCircle2,
  Package,
} from "lucide-react";
import { BarcodeGenerator } from "@/components/BarcodeGenerator";
import { ConfirmModal } from "@/components/ConfirmModal";
import { ToastContainer, ToastMessage } from "@/components/Toast";
import { ProductImageGallery } from "@/components/ProductImageGallery";
import {
  DEFAULT_PRODUCT_CONDITION,
  getConditionBadgeClasses,
  type ProductCondition,
} from "@/lib/productCondition";
import type { ProductImage } from "@/models/Product";

interface ProductDetail {
  _id: string;
  name: string;
  brand?: string;
  modelNumber?: string;
  model?: string;
  color?: string;
  sku: string;
  barcode: string;
  condition: ProductCondition;
  serialTracking: boolean;
  costPrice: number;
  sellingPrice: number;
  minSellingPrice: number;
  images: ProductImage[] | string[];
  description?: string;
  active: boolean;
  category?: { _id: string; name: string; code?: string };
  productGroup?: { _id: string; name: string; description?: string };
  createdAt: string;
  updatedAt: string;
}

export default function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [userRole, setUserRole] = useState<string | null>(null);
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (type: "success" | "error" | "info", text: string) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, type, text }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    const fetchProduct = async () => {
      setLoading(true);
      setError("");
      try {
        const authRes = await fetch("/api/auth/me");
        const authData = await authRes.json();
        if (!authData.success) {
          router.replace("/login");
          return;
        }
        setUserRole(authData.data.role);
        if (authData.data.role !== "Admin" && authData.data.role !== "Warehouse") {
          setError("Access Denied. Only Admin and Warehouse roles can access this page.");
          setLoading(false);
          return;
        }

        const res = await fetch(`/api/products/${id}`);
        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data.error || "Product not found");
        }

        setProduct(data.data);
      } catch (err: any) {
        setError(err.message || "Failed to load product details");
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchProduct();
  }, [id]);

  const handleDelete = async () => {
    if (!product) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/products/${product._id}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to delete product");
      }

      addToast("success", `Product "${product.name}" soft deleted successfully.`);
      setTimeout(() => {
        router.push("/");
      }, 1000);
    } catch (err: any) {
      addToast("error", err.message || "Failed to delete product");
      setDeleting(false);
      setDeleteModalOpen(false);
    }
  };

  if (error && error.includes("Access Denied")) {
    return (
      <div className="space-y-6 pb-12 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="w-16 h-16 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-500 border border-rose-500/20 mb-4 animate-pulse">
          <Lock className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold text-slate-100">Access Denied</h1>
        <p className="text-slate-450 text-sm max-w-sm mt-2 leading-relaxed">
          Only Admin and Warehouse roles are allowed to access this page.
        </p>
        <div className="mt-6">
          <Link
            href="/price-lookup"
            className="px-5 py-2.5 bg-indigo-650 hover:bg-indigo-600 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
          >
            Go to Price Lookup
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-16 text-center space-y-3 my-8">
        <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm font-medium text-slate-400">Loading product details...</p>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-4 my-8">
        <div className="w-12 h-12 bg-rose-500/10 text-rose-400 rounded-2xl flex items-center justify-center mx-auto">
          <Info className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-100">{error || "Product Not Found"}</h2>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Product Directory
        </Link>
      </div>
    );
  }

  // Margin calculation
  const margin = product.sellingPrice - product.costPrice;
  const marginPercent =
    product.sellingPrice > 0 ? ((margin / product.sellingPrice) * 100).toFixed(1) : "0";

  const counterpartCondition: ProductCondition =
    product.condition === "New" ? "Used" : "New";
  const counterpartParams = new URLSearchParams({
    name: product.name,
    condition: counterpartCondition,
  });

  if (product.productGroup && product.productGroup._id) {
    counterpartParams.set('productGroup', product.productGroup._id);
  }
  if (product.category && product.category._id) {
    counterpartParams.set('category', product.category._id);
  }
  if (product.model) {
    counterpartParams.set('model', product.model);
  }

  return (
    <div className="space-y-6 pb-16 max-w-5xl mx-auto">
      <ToastContainer toasts={toasts} onClose={removeToast} />

      <ConfirmModal
        isOpen={deleteModalOpen}
        title="Soft Delete Product"
        message={`Are you sure you want to delete "${product.name}"? Soft deletion marks the record as inactive while safeguarding historical data references.`}
        confirmLabel="Confirm Soft Delete"
        cancelLabel="Cancel"
        isDanger={true}
        isLoading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteModalOpen(false)}
      />

      {/* Top Bar with Navigation & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-300 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-100">{product.name}</h1>
              <span
                className={`px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full ${getConditionBadgeClasses(product.condition || DEFAULT_PRODUCT_CONDITION)}`}
              >
                {product.condition || DEFAULT_PRODUCT_CONDITION}
              </span>
              <span
                className={`px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full ${
                  product.active
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-slate-800 text-slate-400 border border-slate-700"
                }`}
              >
                {product.active ? "Active" : "Inactive"}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              SKU: <span className="text-slate-200">{product.sku}</span>
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Link
            href={`/products/new?${counterpartParams.toString()}`}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs sm:text-sm border border-slate-700 transition-colors"
          >
            <Layers3 className="w-4 h-4 text-amber-400" />
            Create {counterpartCondition} Product
          </Link>
          <Link
            href={`/products/${product._id}/edit`}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs sm:text-sm shadow-md"
          >
            <Edit className="w-4 h-4" />
            Edit Product
          </Link>
          <button
            type="button"
            onClick={() => setDeleteModalOpen(true)}
            className="p-2.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 hover:text-rose-200 border border-rose-800/40 rounded-xl transition-colors"
            title="Delete Product"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Grid: 2 Columns on Desktop */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Basic Info & Pricing */}
        <div className="md:col-span-2 space-y-6">
          {/* Section 1: Basic Information */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
            <h2 className="text-base font-bold text-slate-100 border-b border-slate-800 pb-3">
              Basic Information
            </h2>

            <div className="grid grid-cols-2 gap-4 text-xs sm:text-sm">
              <div className="col-span-2">
                <span className="text-slate-400 text-xs block font-medium">Product Name</span>
                <span className="font-semibold text-slate-100 text-base">{product.name}</span>
                {product.brand && (
                  <span className="text-xs text-indigo-300 font-semibold block mt-0.5">
                    Brand: {product.brand}
                  </span>
                )}
              </div>

              <div>
                <span className="text-slate-400 text-xs block font-medium">SKU</span>
                <span className="font-mono font-bold text-indigo-300 text-base">{product.sku}</span>
              </div>

              <div>
                <span className="text-slate-400 text-xs block font-medium">Barcode</span>
                <span className="font-mono font-bold text-emerald-300 text-base">{product.barcode}</span>
              </div>

              <div>
                <span className="text-slate-400 text-xs block font-medium">Color Variant</span>
                <span className="inline-flex mt-1 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20">
                  {product.color || "Unspecified"}
                </span>
              </div>

              <div>
                <span className="text-slate-400 text-xs block font-medium">Condition</span>
                <span
                  className={`inline-flex mt-1 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full ${getConditionBadgeClasses(product.condition || DEFAULT_PRODUCT_CONDITION)}`}
                >
                  {product.condition || DEFAULT_PRODUCT_CONDITION}
                </span>
              </div>

              <div>
                <span className="text-slate-400 text-xs block font-medium">Serial Tracking</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {product.serialTracking ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="font-semibold text-emerald-300 text-sm">Enabled</span>
                    </>
                  ) : (
                    <>
                      <Package className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-semibold text-slate-400 text-sm">Disabled</span>
                    </>
                  )}
                </div>
              </div>

              <div>
                <span className="text-slate-400 text-xs block font-medium">Category</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Layers className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="font-semibold text-slate-200">
                    {product.category?.name || "Uncategorized"}
                  </span>
                </div>
              </div>

              {(product.modelNumber || product.model) && (
                <div>
                  <span className="text-slate-400 text-xs block font-medium">Model Number</span>
                  <span className="font-mono font-semibold text-slate-200">{product.modelNumber || product.model}</span>
                </div>
              )}

              {product.productGroup && (
                <div className="col-span-2 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                  <span className="text-slate-400 text-xs block font-medium">
                    Product Group / Family
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <Folder className="w-4 h-4 text-amber-400 shrink-0" />
                    <div>
                      <span className="font-bold text-amber-300 text-sm">
                        {product.productGroup.name}
                      </span>
                      {product.productGroup.description && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          {product.productGroup.description}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Pricing Structure */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-slate-100">Pricing & Margins</h2>
              <span className="px-2.5 py-0.5 text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded">
                Cost Price is Internal Only
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Selling Price */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400 font-medium block">Selling Price</span>
                <span className="text-2xl font-extrabold text-slate-100 mt-1 block">
                  Rs. {product.sellingPrice.toLocaleString("en-PK")}
                </span>
              </div>

              {/* Min Selling Price */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400 font-medium block">Min Selling Price</span>
                <span className="text-xl font-bold text-slate-200 mt-1 block">
                  Rs. {product.minSellingPrice.toLocaleString("en-PK")}
                </span>
              </div>

              {/* Internal Cost Price */}
              <div className="bg-amber-950/20 p-4 rounded-xl border border-amber-800/30">
                <span className="text-xs text-amber-400 font-semibold flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Cost Price (Internal)
                </span>
                <span className="text-xl font-bold text-amber-200 mt-1 block">
                  Rs. {product.costPrice.toLocaleString("en-PK")}
                </span>
              </div>
            </div>

            {/* Profit Margin Preview */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 flex items-center justify-between text-xs sm:text-sm">
              <span className="text-slate-400 font-medium">Estimated Gross Margin</span>
              <div className="text-right">
                <span className="font-bold text-emerald-400 text-base">
                  +Rs. {margin.toLocaleString("en-PK")}
                </span>
                <span className="text-slate-500 text-xs block">({marginPercent}% margin)</span>
              </div>
            </div>
          </div>

          {/* Section 3: Description & Notes */}
          {product.description && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3">
              <h2 className="text-base font-bold text-slate-100 border-b border-slate-800 pb-3">
                Description & Notes
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                {product.description}
              </p>
            </div>
          )}

          {/* Section 3.5: Product Images */}
          {(product.images && Array.isArray(product.images) && product.images.length > 0) && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3">
              <h2 className="text-base font-bold text-slate-100 border-b border-slate-800 pb-3">
                Product Images
              </h2>
              <ProductImageGallery
                images={
                  typeof product.images[0] === 'string'
                    ? (product.images as string[]).map((url: string, index: number) => ({
                        url,
                        publicId: url.split('/').pop() || '',
                        isPrimary: index === 0,
                        order: index,
                      }))
                    : product.images as ProductImage[]
                }
                productName={product.name}
              />
            </div>
          )}
        </div>

        {/* Right Column (1 Col): Barcode Rendering & Future Inventory Reference */}
        <div className="space-y-6">
          {/* Barcode Section */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h2 className="text-base font-bold text-slate-100 border-b border-slate-800 pb-3 flex items-center gap-2">
              <BarcodeIcon className="w-5 h-5 text-indigo-400" />
              Product Barcode
            </h2>

            <BarcodeGenerator value={product.barcode} productName={product.name} sellingPrice={product.sellingPrice} showPrint={true} condition={product.condition} />
            
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <p className="text-[11px] text-slate-400 leading-relaxed">
                <span className="font-semibold text-slate-300">Note:</span> This barcode identifies this exact sellable product ({product.condition || DEFAULT_PRODUCT_CONDITION}). Scanning resolves to this product&apos;s price. All physical units of this product share the same barcode.
                {product.serialTracking && " Individual units are tracked by serial number."}
              </p>
            </div>
          </div>

          {/* Availability / Inventory Sync Notice */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-indigo-400">
              <Package className="w-5 h-5" />
              <h3 className="text-sm font-bold text-slate-100">Inventory Status</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Product definition and pricing master active. Stock quantities are owned and synchronized by the dedicated Inventory/Warehouse modules.
            </p>
          </div>

          {/* Metadata timestamps */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 text-[11px] text-slate-500 space-y-1">
            <div className="flex items-center justify-between">
              <span>Created:</span>
              <span className="font-mono text-slate-400">
                {new Date(product.createdAt).toLocaleDateString()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Last Updated:</span>
              <span className="font-mono text-slate-400">
                {new Date(product.updatedAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
