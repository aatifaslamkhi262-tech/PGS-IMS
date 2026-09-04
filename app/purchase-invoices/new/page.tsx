"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  FileText,
  Plus,
  Trash2,
  AlertCircle,
  Truck,
  Calendar,
  Barcode as BarcodeIcon,
  Search,
  CheckCircle,
} from "lucide-react";
import { ToastContainer, ToastMessage } from "@/components/Toast";

interface SupplierOption {
  _id: string;
  name: string;
  code: string;
}

interface ProductItem {
  _id: string;
  name: string;
  brand?: string;
  modelNumber?: string;
  model?: string;
  color?: string;
  sku: string;
  barcode: string;
  condition: string;
  sellingPrice: number;
  minSellingPrice: number;
  costPrice: number;
}

interface InvoiceLine {
  product: string;
  name: string;
  brand?: string;
  modelNumber?: string;
  color?: string;
  sku: string;
  barcode: string;
  condition: string;
  quantity: number;
  unitCost: number;
  sellingPrice: number;
  minSellingPrice: number;
  amount: number;
}

export default function NewPurchaseInvoicePage() {
  const router = useRouter();

  // Header Details
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(
    new Date().toISOString().substring(0, 10)
  );
  const [notes, setNotes] = useState("");

  // Product Selection & Line Items
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ProductItem[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  // States
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (type: "success" | "error" | "info", text: string) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, type, text }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Fetch Suppliers and set default values
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/suppliers?activeOnly=true");
        const data = await res.json();
        if (data.success) {
          setSuppliers(data.data);
        } else {
          setError("Failed to load active suppliers.");
        }
      } catch {
        setError("Network error loading suppliers.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Product Search handler
  useEffect(() => {
    const searchProducts = async () => {
      if (!productSearch.trim()) {
        setSearchResults([]);
        return;
      }
      try {
        const res = await fetch(`/api/products?search=${encodeURIComponent(productSearch.trim())}&limit=5`);
        const data = await res.json();
        if (data.success) {
          setSearchResults(data.products || data.data || []);
        }
      } catch {
        console.error("Failed to query products");
      }
    };

    const delayDebounceFn = setTimeout(() => {
      searchProducts();
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [productSearch]);

  // Resolve barcode scanning
  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;

    try {
      const res = await fetch(`/api/barcodes/scan?barcode=${encodeURIComponent(barcodeInput.trim())}`);
      const data = await res.json();

      if (data.success && data.data && data.data.product) {
        const prod = data.data.product as ProductItem;
        addProductToLines(prod);
        setBarcodeInput("");
        addToast("success", `Resolved Product: ${prod.name}`);
      } else {
        addToast("error", "No Product resolved with this barcode.");
      }
    } catch {
      addToast("error", "Failed to resolve barcode due to a network error.");
    }
  };

  const addProductToLines = (product: ProductItem) => {
    setLines((prevLines) => {
      const existingIndex = prevLines.findIndex((l) => l.product === product._id);
      if (existingIndex > -1) {
        // Merge duplicate lines: increment quantity by 1
        const updated = [...prevLines];
        const line = updated[existingIndex];
        const newQty = line.quantity + 1;
        updated[existingIndex] = {
          ...line,
          quantity: newQty,
          amount: newQty * line.unitCost,
        };
        return updated;
      } else {
        // Add new line with product details
        return [
          ...prevLines,
          {
            product: product._id,
            name: product.name,
            brand: product.brand || "",
            modelNumber: product.modelNumber || product.model || "",
            color: product.color || "Unspecified",
            sku: product.sku,
            barcode: product.barcode,
            condition: product.condition,
            quantity: 1,
            unitCost: product.costPrice || 0,
            sellingPrice: product.sellingPrice || 0,
            minSellingPrice: product.minSellingPrice || 0,
            amount: product.costPrice || 0,
          },
        ];
      }
    });
  };

  const handleLineChange = (
    index: number,
    field: "quantity" | "unitCost" | "sellingPrice" | "minSellingPrice",
    value: number
  ) => {
    setLines((prevLines) => {
      const updated = [...prevLines];
      const line = updated[index];
      const quantity = field === "quantity" ? Math.max(1, value) : line.quantity;
      const unitCost = field === "unitCost" ? Math.max(0, value) : line.unitCost;
      const sellingPrice = field === "sellingPrice" ? Math.max(0, value) : line.sellingPrice;
      const minSellingPrice = field === "minSellingPrice" ? Math.max(0, value) : line.minSellingPrice;
      updated[index] = {
        ...line,
        quantity,
        unitCost,
        sellingPrice,
        minSellingPrice,
        amount: quantity * unitCost,
      };
      return updated;
    });
  };

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const calculateSubtotal = () => {
    return lines.reduce((sum, l) => sum + l.amount, 0);
  };

  const handleSave = async (submitForApproval = false) => {
    if (!selectedSupplier) {
      setError("Please select a Supplier.");
      return;
    }
    if (!invoiceNumber.trim()) {
      setError("Please enter an Invoice Number.");
      return;
    }
    if (lines.length === 0) {
      setError("At least one product line item is required.");
      return;
    }

    // Front-end validations for pricing
    for (const l of lines) {
      if (l.sellingPrice <= 0) {
        setError(`Selling Price for "${l.name}" must be greater than 0.`);
        return;
      }
      if (l.minSellingPrice <= 0) {
        setError(`Minimum Selling Price for "${l.name}" must be greater than 0.`);
        return;
      }
      if (Number(l.minSellingPrice) > Number(l.sellingPrice)) {
        setError(`Minimum Selling Price for "${l.name}" cannot exceed Selling Price.`);
        return;
      }
    }

    setSubmitting(true);
    setError("");

    const payload = {
      invoiceNumber: invoiceNumber.trim(),
      supplier: selectedSupplier,
      invoiceDate: new Date(invoiceDate).toISOString(),
      notes: notes.trim() || undefined,
      items: lines.map((l) => ({
        product: l.product,
        name: l.name,
        sku: l.sku,
        barcode: l.barcode,
        condition: l.condition,
        quantity: l.quantity,
        unitCost: l.unitCost,
        sellingPrice: l.sellingPrice,
        minSellingPrice: l.minSellingPrice,
      })),
    };

    try {
      // 1. Create Invoice Draft
      const res = await fetch("/api/purchase-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error || "Failed to create purchase invoice.");
        setSubmitting(false);
        return;
      }

      // 2. Submit for Approval if requested
      if (submitForApproval) {
        const submitRes = await fetch(`/api/purchase-invoices/${data.data._id}/submit`, {
          method: "POST",
        });
        const submitData = await submitRes.json();
        if (!submitData.success) {
          setError(submitData.error || "Invoice created as draft, but failed to submit for approval.");
          setSubmitting(false);
          return;
        }
        addToast("success", "Purchase invoice submitted for approval successfully!");
      } else {
        addToast("success", "Purchase invoice draft saved successfully!");
      }

      setTimeout(() => {
        router.push("/purchase-invoices");
        router.refresh();
      }, 1000);
    } catch {
      setError("Failed to communicate with server.");
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb Header */}
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
            <span>Create Purchase Invoice</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Build and record vendor invoice items. Stock increases only upon final Accountant approval.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold rounded-xl flex items-center gap-2">
          <AlertCircle className="w-5 h-5 animate-bounce shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-slate-900 border border-slate-800 rounded-xl">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
          <span className="text-xs">Initialising invoice page...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Form Side */}
          <div className="lg:col-span-2 space-y-6">
            {/* Header Details */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2.5">
                Invoice Header
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Supplier select */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Truck className="w-3.5 h-3.5 text-slate-500" />
                    <span>Supplier *</span>
                  </label>
                  <select
                    value={selectedSupplier}
                    onChange={(e) => setSelectedSupplier(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="">Select Supplier</option>
                    {suppliers.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Invoice Number */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Invoice Number *
                  </label>
                  <input
                    type="text"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="e.g. INV-00125"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {/* Invoice Date */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    <span>Invoice Date *</span>
                  </label>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  />
                </div>

                {/* Notes */}
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Internal Notes / Comments
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Provide additional details regarding supplier batch or shipment..."
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Line Items Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Product Line Items
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700 rounded-sm">
                  {lines.length} {lines.length === 1 ? "Line" : "Lines"}
                </span>
              </div>

              {/* Empty lines state */}
              {lines.length === 0 ? (
                <div className="text-center py-10 bg-slate-950/40 border border-dashed border-slate-800 rounded-xl">
                  <BarcodeIcon className="w-8 h-8 text-slate-650 mx-auto mb-2" />
                  <p className="text-[11px] text-slate-400 px-4">
                    No items added. Scan a product barcode or use search input below.
                  </p>
                </div>
              ) : (
                <div className="space-y-3.5 divide-y divide-slate-850">
                  {lines.map((line, idx) => (
                    <div
                      key={line.product}
                      className={`pt-3.5 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}
                    >
                      <div className="space-y-1 md:max-w-md w-full">
                        <div className="flex items-start gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-200 leading-snug">{line.name}</span>
                          <span className="px-1.5 py-0.2 text-[9px] font-bold bg-slate-800 text-slate-400 rounded uppercase tracking-wider">
                            {line.condition}
                          </span>
                          <span className="px-1.5 py-0.2 text-[9px] font-bold bg-purple-500/10 text-purple-300 border border-purple-500/20 rounded uppercase tracking-wider">
                            Color: {line.color || "Unspecified"}
                          </span>
                        </div>
                        {line.brand && (
                          <div className="text-[11px] text-indigo-300 font-semibold">{line.brand}</div>
                        )}
                        <p className="text-[10px] font-semibold text-slate-500 uppercase">
                          Model: {line.modelNumber || "N/A"} | SKU: {line.sku} | Barcode: {line.barcode}
                        </p>
                      </div>

                      {/* Inputs Row */}
                      <div className="flex items-center justify-between sm:justify-end gap-4.5 w-full sm:w-auto shrink-0">
                        {/* Qty */}
                        <div className="w-18">
                          <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                            Qty
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={line.quantity}
                            onChange={(e) =>
                              handleLineChange(idx, "quantity", parseInt(e.target.value, 10) || 1)
                            }
                            className="w-full text-center px-1 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-slate-100 font-bold"
                          />
                        </div>

                        {/* Rate */}
                        <div className="w-24">
                          <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                            Rate (Rs)
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={line.unitCost}
                            onChange={(e) =>
                              handleLineChange(idx, "unitCost", parseFloat(e.target.value) || 0)
                            }
                            className="w-full text-center px-1.5 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-slate-100 font-bold"
                          />
                        </div>

                        {/* Selling Price */}
                        <div className="w-24">
                          <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                            Selling (Rs)
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={line.sellingPrice}
                            onChange={(e) =>
                              handleLineChange(idx, "sellingPrice", parseFloat(e.target.value) || 0)
                            }
                            className="w-full text-center px-1.5 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-slate-100 font-bold font-mono"
                          />
                        </div>

                        {/* Minimum Selling Price */}
                        <div className="w-24">
                          <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                            Min Selling (Rs)
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={line.minSellingPrice}
                            onChange={(e) =>
                              handleLineChange(idx, "minSellingPrice", parseFloat(e.target.value) || 0)
                            }
                            className="w-full text-center px-1.5 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-slate-100 font-bold font-mono"
                          />
                        </div>

                        {/* Line Total */}
                        <div className="w-28 text-right">
                          <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                            Amount
                          </span>
                          <span className="block text-xs font-bold text-slate-200 mt-1.5">
                            Rs. {line.amount.toLocaleString("en-PK")}
                          </span>
                        </div>

                        {/* Trash */}
                        <button
                          type="button"
                          onClick={() => removeLine(idx)}
                          className="p-2 text-slate-500 hover:text-rose-400 hover:bg-slate-850 rounded transition-colors self-end sm:self-center"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Search & Actions Panel */}
          <div className="space-y-6">
            {/* Product Selector */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2.5">
                Add Products
              </h2>

              {/* Barcode Search */}
              <form onSubmit={handleBarcodeSubmit} className="space-y-2">
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Scan / Enter Barcode
                </label>
                <div className="relative">
                  <BarcodeIcon className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    placeholder="Enter Barcode & press Enter..."
                    className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </form>

              {/* Text Search Auto-complete */}
              <div className="relative space-y-2">
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Or Search Product Master
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => {
                      setProductSearch(e.target.value);
                      setShowSearchDropdown(true);
                    }}
                    onFocus={() => setShowSearchDropdown(true)}
                    placeholder="Type name, sku, condition..."
                    className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Dropdown Options */}
                {showSearchDropdown && searchResults.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg shadow-xl divide-y divide-slate-900 max-h-56 overflow-y-auto">
                    {searchResults.map((prod) => (
                      <button
                        key={prod._id}
                        type="button"
                        onClick={() => {
                          addProductToLines(prod);
                          setProductSearch("");
                          setSearchResults([]);
                          setShowSearchDropdown(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-slate-900 transition-colors flex flex-col gap-1 cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-200">{prod.name}</span>
                          <div className="flex items-center gap-1">
                            <span className="px-1.5 py-0.2 text-[8px] font-bold bg-purple-500/10 text-purple-300 border border-purple-500/20 rounded uppercase">
                              Color: {prod.color || "Unspecified"}
                            </span>
                            <span className="px-1.5 py-0.2 text-[8px] font-bold bg-slate-850 text-indigo-400 border border-slate-850 rounded uppercase">
                              {prod.condition}
                            </span>
                          </div>
                        </div>
                        <div className="text-[10px] text-slate-400 font-medium">
                          {prod.brand ? `${prod.brand} | ` : ""}{(prod.modelNumber || prod.model) ? `Model: ${prod.modelNumber || prod.model} | ` : ""}SKU: {prod.sku} | Barcode: {prod.barcode}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {/* Click outside closer hook */}
                {showSearchDropdown && productSearch.trim() && searchResults.length === 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-3 text-center text-[10px] text-slate-500 shadow-xl">
                    No matching products found in master catalog.
                  </div>
                )}
              </div>
            </div>

            {/* Subtotal / Total and Actions Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2.5">
                Summary & Actions
              </h2>

              <div className="space-y-2 text-xs border-b border-slate-800 pb-4">
                <div className="flex justify-between">
                  <span className="text-slate-400">Subtotal:</span>
                  <span className="font-bold text-slate-200">
                    Rs. {calculateSubtotal().toLocaleString("en-PK")}
                  </span>
                </div>
                <div className="flex justify-between text-sm pt-2 border-t border-slate-850">
                  <span className="font-bold text-slate-350">Invoice Total:</span>
                  <span className="font-extrabold text-indigo-400">
                    Rs. {calculateSubtotal().toLocaleString("en-PK")}
                  </span>
                </div>
              </div>

              {/* Action Triggers */}
              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={() => handleSave(true)}
                  disabled={submitting}
                  className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-900/30 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {submitting ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  <span>Submit for Accountant Approval</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSave(false)}
                  disabled={submitting}
                  className="w-full py-2.5 px-4 rounded-lg border border-slate-700 bg-slate-850 hover:bg-slate-800 text-slate-300 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  <span>Save Invoice Draft</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Click listener background to close search dropdown */}
      {showSearchDropdown && (
        <div className="fixed inset-0 z-0" onClick={() => setShowSearchDropdown(false)} />
      )}

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
