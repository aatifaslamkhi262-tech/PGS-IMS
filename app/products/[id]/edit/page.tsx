"use client";

import React, { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Barcode as BarcodeIcon,
  Plus,
  Wand2,
  Lock,
  Tag,
  Layers,
  FolderPlus,
  CheckCircle2,
  AlertCircle,
  ImageIcon,
  Camera,
} from "lucide-react";
import { QuickAddModal } from "@/components/QuickAddModal";
import { ToastContainer, ToastMessage } from "@/components/Toast";
import { BarcodeGenerator } from "@/components/BarcodeGenerator";
import { ProductImageUpload } from "@/components/ProductImageUpload";
import type { ProductImage } from "@/models/Product";
import {
  DEFAULT_PRODUCT_CONDITION,
  PRODUCT_CONDITIONS,
  buildSkuDraft,
  type ProductCondition,
} from "@/lib/productCondition";

interface OptionItem {
  _id: string;
  name: string;
}

export default function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Form Fields
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [sku, setSku] = useState(""); // Auto-generated, read-only in edit mode
  const [barcode, setBarcode] = useState(""); // Auto-generated, read-only
  const [serialTracking, setSerialTracking] = useState(false);
  const [category, setCategory] = useState("");
  const [productGroup, setProductGroup] = useState("");
  const [condition, setCondition] = useState<ProductCondition | null>(null);
  const [model, setModel] = useState("");
  const [colorSelection, setColorSelection] = useState("");
  const [customColor, setCustomColor] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [minSellingPrice, setMinSellingPrice] = useState("");
  const [images, setImages] = useState<ProductImage[]>([]);
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);

  // States
  const [initialLoading, setInitialLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Options
  const [categories, setCategories] = useState<OptionItem[]>([]);
  const [groups, setGroups] = useState<OptionItem[]>([]);

  // Inline Quick Add
  const [quickAddType, setQuickAddType] = useState<"category" | "group" | null>(null);

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (type: "success" | "error" | "info", text: string) => {
    const toastId = Date.now().toString();
    setToasts((prev) => [...prev, { id: toastId, type, text }]);
  };

  const removeToast = (toastId: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== toastId));
  };

  const fetchOptions = async () => {
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
      console.error("Error loading options:", err);
    }
  };

  useEffect(() => {
    const loadProductData = async () => {
      setInitialLoading(true);
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
          setInitialLoading(false);
          return;
        }

        await fetchOptions();
        const res = await fetch(`/api/products/${id}`);
        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data.error || "Product not found");
        }

        const p = data.data;
        setName(p.name || "");
        setBrand(p.brand || "");
        setSku(p.sku || "");
        setBarcode(p.barcode || "");
        setSerialTracking(p.serialTracking || false);
        setCategory(p.category?._id || "");
        setProductGroup(p.productGroup?._id || "");
        setCondition(p.condition || null);
        setModel(p.model || p.modelNumber || "");
        
        const col = p.color || "Unspecified";
        const presets = ["White", "Black", "Blue", "Red", "Silver", "Gold"];
        if (presets.includes(col)) {
          setColorSelection(col);
        } else {
          setColorSelection("Other");
          setCustomColor(col);
        }

        setCostPrice(p.costPrice !== undefined ? String(p.costPrice) : "");
        setSellingPrice(p.sellingPrice !== undefined ? String(p.sellingPrice) : "");
        setMinSellingPrice(
          p.minSellingPrice !== undefined ? String(p.minSellingPrice) : ""
        );
        // Handle both new ProductImage structure and legacy string array
        if (p.images && Array.isArray(p.images)) {
          if (p.images.length > 0 && typeof p.images[0] === 'string') {
            // Legacy string array - convert to new structure
            setImages(p.images.map((url: string, index: number) => ({
              url,
              publicId: url.split('/').pop() || '',
              isPrimary: index === 0,
              order: index,
            })));
          } else {
            // New ProductImage structure
            setImages(p.images);
          }
        }
        setDescription(p.description || "");
        setActive(p.active !== undefined ? p.active : true);
      } catch (err: any) {
        addToast("error", err.message || "Failed to load product");
      } finally {
        setInitialLoading(false);
      }
    };

    if (id) loadProductData();
  }, [id]);

  // Auto-regenerate SKU when name or condition changes in edit mode
  useEffect(() => {
    if (name.trim() && condition) {
      setSku(buildSkuDraft(name, condition));
    }
  }, [name, condition]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) newErrors.name = "Product Name is required.";
    if (!sku.trim()) newErrors.sku = "SKU is required.";
    if (!barcode.trim()) newErrors.barcode = "Barcode is required.";
    if (!condition) newErrors.condition = "Product Condition (New/Used) is required.";

    const cPrice = parseFloat(costPrice);
    if (costPrice === "" || isNaN(cPrice) || cPrice < 0) {
      newErrors.costPrice = "Cost Price must be a valid number >= 0.";
    }

    const sPrice = parseFloat(sellingPrice);
    if (sellingPrice === "" || isNaN(sPrice) || sPrice < 0) {
      newErrors.sellingPrice = "Selling Price must be a valid number >= 0.";
    }

    const mPrice = parseFloat(minSellingPrice);
    if (minSellingPrice === "" || isNaN(mPrice) || mPrice < 0) {
      newErrors.minSellingPrice = "Minimum Selling Price must be a valid number >= 0.";
    } else if (!isNaN(sPrice) && mPrice > sPrice) {
      newErrors.minSellingPrice =
        "Minimum Selling Price cannot be greater than Selling Price.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      addToast("error", "Please fix validation errors.");
      return;
    }

    const effectiveColor = colorSelection === "Other" ? customColor.trim() : colorSelection;

    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        brand: brand.trim(),
        modelNumber: model.trim(),
        model: model.trim(),
        color: effectiveColor || "Unspecified",
        sku: sku.trim(),
        serialTracking,
        category: category || undefined,
        productGroup: productGroup || null,
        condition: condition || DEFAULT_PRODUCT_CONDITION,
        costPrice: parseFloat(costPrice),
        sellingPrice: parseFloat(sellingPrice),
        minSellingPrice: parseFloat(minSellingPrice),
        images: images,
        description: description.trim() || undefined,
        active,
      };

      const res = await fetch(`/api/products/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to update product");
      }

      addToast("success", `Product "${data.data.name}" updated successfully on same record.`);
      setTimeout(() => {
        router.push(`/products/${id}`);
      }, 1000);
    } catch (err: any) {
      addToast("error", err.message || "Failed to update product");
      setErrors((prev) => ({ ...prev, form: err.message }));
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickAddSuccess = (newItem: any) => {
    fetchOptions();
    if (quickAddType === "category") {
      setCategory(newItem._id);
      addToast("success", `Category "${newItem.name}" added and selected.`);
    } else if (quickAddType === "group") {
      setProductGroup(newItem._id);
      addToast("success", `Product Group "${newItem.name}" added and selected.`);
    }
  };

  if (initialLoading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-16 text-center space-y-3 my-8 max-w-4xl mx-auto">
        <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm font-medium text-slate-400">Loading product for editing...</p>
      </div>
    );
  }

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

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16">
      <ToastContainer toasts={toasts} onClose={removeToast} />

      <QuickAddModal
        isOpen={Boolean(quickAddType)}
        type={quickAddType || "category"}
        categories={categories}
        onClose={() => setQuickAddType(null)}
        onSuccess={handleQuickAddSuccess}
      />

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/products/${id}`}
            className="p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100">
              Edit Product: {name || "..."}
            </h1>
            <p className="text-xs text-slate-400 font-mono">
              Record ID: <span className="text-slate-300">{id}</span>
            </p>
          </div>
        </div>
      </div>

      {errors.form && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{errors.form}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Basic Information */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Tag className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-bold text-slate-100">Basic Information</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Product Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errors.name) setErrors((prev) => ({ ...prev, name: "" }));
                }}
                className={`w-full px-3.5 py-2.5 bg-slate-950 border rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500 ${
                  errors.name ? "border-rose-500" : "border-slate-800"
                }`}
              />
              {errors.name && <p className="text-xs text-rose-400 mt-1">{errors.name}</p>}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-300">Category</label>
                <button
                  type="button"
                  onClick={() => setQuickAddType("category")}
                  className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5"
                >
                  <Plus className="w-3 h-3" /> Add New
                </button>
              </div>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
              >
                <option value="">Select Category...</option>
                {categories.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Condition <span className="text-rose-400">*</span>
              </label>
              <select
                value={condition || ""}
                onChange={(e) => {
                  setCondition(e.target.value as ProductCondition | null);
                  if (errors.condition) setErrors((prev) => ({ ...prev, condition: "" }));
                }}
                className={`w-full px-3.5 py-2.5 bg-slate-950 border rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500 ${
                  errors.condition ? "border-rose-500" : "border-slate-800"
                }`}
              >
                <option value="">Select Condition...</option>
                {PRODUCT_CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {errors.condition && (
                <p className="text-xs text-rose-400 mt-1">{errors.condition}</p>
              )}
              <p className="text-[11px] text-slate-500 mt-1">
                Changing condition does not merge New/Used — each remains a separate product record with its own barcode.
              </p>
            </div>

            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Product Group / Family
                </label>
                <button
                  type="button"
                  onClick={() => setQuickAddType("group")}
                  className="text-[11px] font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-0.5"
                >
                  <Plus className="w-3 h-3" /> Add New Group
                </button>
              </div>
              <select
                value={productGroup}
                onChange={(e) => setProductGroup(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
              >
                <option value="">Select Product Group...</option>
                {groups.map((g) => (
                  <option key={g._id} value={g._id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Brand Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Brand
              </label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="e.g. Sony, Microsoft, Apple"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Color Selection & Custom Entry */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Color Variant
              </label>
              <div className="flex gap-2">
                <select
                  value={colorSelection}
                  onChange={(e) => setColorSelection(e.target.value)}
                  className="flex-1 px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Select Color...</option>
                  <option value="White">White</option>
                  <option value="Black">Black</option>
                  <option value="Blue">Blue</option>
                  <option value="Red">Red</option>
                  <option value="Silver">Silver</option>
                  <option value="Gold">Gold</option>
                  <option value="Other">Other / Custom</option>
                </select>

                {colorSelection === "Other" && (
                  <input
                    type="text"
                    value={customColor}
                    onChange={(e) => setCustomColor(e.target.value)}
                    placeholder="Enter color..."
                    className="w-1/2 px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
                  />
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Model Number</label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g. PS5-Slim-Disc"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Status</label>
              <select
                value={active ? "true" : "false"}
                onChange={(e) => setActive(e.target.value === "true")}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>

            {/* Variant Preview Card */}
            {(name.trim() || brand.trim() || model.trim() || colorSelection) && (
              <div className="sm:col-span-2 bg-slate-950 p-4 rounded-xl border border-indigo-500/30 text-xs space-y-1">
                <div className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider mb-1">
                  Variant Summary Preview
                </div>
                <div className="font-bold text-slate-100 text-sm">{name || "Product Name"}</div>
                {brand && <div className="text-slate-300">{brand}</div>}
                {model && <div className="text-slate-400 font-mono">Model: {model}</div>}
                <div className="text-slate-300">
                  Color: <span className="font-semibold text-indigo-300">{colorSelection === "Other" ? (customColor || "Custom") : (colorSelection || "Unspecified")}</span>
                </div>
                <div className="text-slate-300">Condition: <span className="font-semibold">{condition || "New"}</span></div>
                {sku && <div className="text-slate-400 font-mono">SKU: {sku}</div>}
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Identifiers & Barcode Workflow */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <BarcodeIcon className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-bold text-slate-100">Identifiers & Barcode Workflow</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                SKU <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={sku}
                  disabled
                  placeholder="Auto-generated from name and condition"
                  className={`w-full px-3.5 py-2.5 bg-slate-950 border rounded-xl text-slate-100 text-sm font-mono focus:outline-none focus:border-indigo-500 disabled:opacity-70 disabled:cursor-not-allowed ${
                    errors.sku ? "border-rose-500" : "border-slate-800"
                  }`}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Wand2 className="w-4 h-4 text-indigo-400" />
                </div>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Auto-generated from product name and condition. Cannot be manually edited.
              </p>
              {errors.sku && <p className="text-xs text-rose-400 mt-1">{errors.sku}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Barcode <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={barcode}
                  disabled
                  placeholder="Auto-generated by system"
                  className={`w-full px-3.5 py-2.5 bg-slate-950 border rounded-xl text-slate-100 text-sm font-mono focus:outline-none focus:border-indigo-500 disabled:opacity-70 disabled:cursor-not-allowed ${
                    errors.barcode ? "border-rose-500" : "border-slate-800"
                  }`}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <BarcodeIcon className="w-4 h-4 text-emerald-400" />
                </div>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Auto-generated by system. Unique per product. Cannot be manually edited.
              </p>
              {errors.barcode && <p className="text-xs text-rose-400 mt-1">{errors.barcode}</p>}
            </div>

            {/* Serial Tracking Toggle */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Serial Tracking
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSerialTracking(!serialTracking)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    serialTracking ? "bg-indigo-600" : "bg-slate-700"
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      serialTracking ? "translate-x-6" : "translate-x-0"
                    }`}
                  />
                </button>
                <span className="text-sm text-slate-300">
                  {serialTracking ? "Enabled - Track individual units" : "Disabled - Quantity-based tracking"}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {serialTracking
                  ? "Each physical unit will have a unique serial number for individual tracking."
                  : "Only quantity will be tracked. No individual serial numbers required."}
              </p>
            </div>

            {barcode && (
              <div className="sm:col-span-2 pt-2">
                <BarcodeGenerator value={barcode} productName={name} sellingPrice={sellingPrice ? Number(sellingPrice) : null} showPrint={false} condition={condition || undefined} />
              </div>
            )}
          </div>
        </div>

        {/* Section 3: Pricing */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-amber-400" />
              <h2 className="text-base font-bold text-slate-100">Pricing</h2>
            </div>
            <span className="px-2.5 py-0.5 text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded">
              Cost Price is Internal Only
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Cost Price (Rs.) <span className="text-rose-400">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                className={`w-full px-3.5 py-2.5 bg-slate-950 border rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500 ${
                  errors.costPrice ? "border-rose-500" : "border-slate-800"
                }`}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Selling Price (Rs.) <span className="text-rose-400">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                className={`w-full px-3.5 py-2.5 bg-slate-950 border rounded-xl text-slate-100 text-sm font-bold focus:outline-none focus:border-indigo-500 ${
                  errors.sellingPrice ? "border-rose-500" : "border-slate-800"
                }`}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Min Selling Price (Rs.) <span className="text-rose-400">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={minSellingPrice}
                onChange={(e) => setMinSellingPrice(e.target.value)}
                className={`w-full px-3.5 py-2.5 bg-slate-950 border rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500 ${
                  errors.minSellingPrice ? "border-rose-500" : "border-slate-800"
                }`}
              />
              {errors.minSellingPrice && (
                <p className="text-xs text-rose-400 mt-1">{errors.minSellingPrice}</p>
              )}
            </div>
          </div>
        </div>

        {/* Section 4: Media & Description */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <ImageIcon className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-bold text-slate-100">Product Images</h2>
          </div>

          <ProductImageUpload
            images={images}
            setImages={setImages}
            maxImages={10}
            onUploadError={(error) => addToast("error", error)}
          />

          <div className="border-t border-slate-800 pt-5">
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            href={`/products/${id}`}
            className="px-5 py-3 rounded-xl border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 text-sm font-semibold transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-900/40 flex items-center gap-2 transition-all hover:scale-102"
          >
            {submitting ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            Update Product
          </button>
        </div>
      </form>
    </div>
  );
}
