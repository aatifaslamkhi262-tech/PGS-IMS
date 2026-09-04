"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
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
  Save,
  Send,
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
  sku: string;
  barcode: string;
  condition: string;
  quantity: number;
  unitCost: number;
  sellingPrice: number;
  minSellingPrice: number;
  amount: number;
}

export default function EditPurchaseInvoicePage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  // Header Details
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("");

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
  const [userRole, setUserRole] = useState("");
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (type: "success" | "error" | "info", text: string) => {
    const toastId = Date.now().toString();
    setToasts((prev) => [...prev, { id: toastId, type, text }]);
  };

  const removeToast = (toastId: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== toastId));
  };

  // Fetch session & role
  const fetchSession = async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      if (data.success) {
        setUserRole(data.data.role);
        if (data.data.role !== "Admin" && data.data.role !== "Warehouse") {
          setError("Access Denied. Only Admin and Warehouse can edit purchase invoices.");
        }
      }
    } catch {
      setError("Failed to verify authorization session.");
    }
  };

  // Fetch Suppliers
  const fetchSuppliers = async () => {
    try {
      const res = await fetch("/api/suppliers?activeOnly=true");
      const data = await res.json();
      if (data.success) {
        setSuppliers(data.data);
      }
    } catch {
      setError("Network error loading suppliers.");
    }
  };

  // Fetch Invoice Details
  const fetchInvoiceDetails = async () => {
    try {
      const res = await fetch(`/api/purchase-invoices/${id}`);
      const data = await res.json();
      if (data.success) {
        const inv = data.data;
        if (inv.status === "Approved") {
          setError("Approved purchase invoices cannot be modified.");
          return;
        }
        setInvoiceNumber(inv.invoiceNumber);
        setSelectedSupplier(inv.supplier?._id || inv.supplier || "");
        setInvoiceDate(new Date(inv.invoiceDate).toISOString().substring(0, 10));
        setNotes(inv.notes || "");
        setStatus(inv.status);
        
        const mappedLines = inv.items.map((item: any) => ({
          product: item.product?._id || item.product,
          name: item.name,
          sku: item.sku,
          barcode: item.barcode,
          condition: item.condition,
          quantity: item.quantity,
          unitCost: item.unitCost,
          sellingPrice: item.sellingPrice || 0,
          minSellingPrice: item.minSellingPrice || 0,
          amount: item.amount,
        }));
        setLines(mappedLines);
      } else {
        setError(data.error || "Failed to load purchase invoice details.");
      }
    } catch {
      setError("Failed to fetch invoice details.");
    }
  };

  useEffect(() => {
    if (id) {
      const loadAll = async () => {
        setLoading(true);
        await fetchSession();
        await fetchSuppliers();
        await fetchInvoiceDetails();
        setLoading(false);
      };
      loadAll();
    }
  }, [id]);

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
        return [
          ...prevLines,
          {
            product: product._id,
            name: product.name,
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

  const handleUpdate = async (resubmit = false) => {
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
      // 1. Save / Update Invoice
      const res = await fetch(`/api/purchase-invoices/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error || "Failed to update purchase invoice.");
        setSubmitting(false);
        return;
      }

      // 2. Optional Resubmission
      if (resubmit) {
        const submitRes = await fetch(`/api/purchase-invoices/${id}/submit`, {
          method: "POST",
        });
        const submitData = await submitRes.json();

        if (submitData.success) {
          addToast("success", "Purchase invoice resubmitted successfully!");
          setTimeout(() => {
            router.push(`/purchase-invoices/${id}`);
            router.refresh();
          }, 1000);
        } else {
          setError(submitData.error || "Invoice updated but resubmission failed.");
          setSubmitting(false);
        }
      } else {
        addToast("success", "Purchase invoice updated successfully!");
        setTimeout(() => {
          router.push(`/purchase-invoices/${id}`);
          router.refresh();
        }, 1000);
      }
    } catch {
      setError("Network error. Failed to save purchase invoice.");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-slate-900 border border-slate-800 rounded-xl">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-xs">Preloading invoice editor...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Link
          href={`/purchase-invoices/${id}`}
          className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Details</span>
        </Link>
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold rounded-xl flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex items-center gap-3">
        <Link
          href={`/purchase-invoices/${id}`}
          className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-400" />
            <span>Revise Invoice: {invoiceNumber}</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Status: <span className="text-amber-400 font-bold uppercase">{status.replace("_", " ")}</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Side: Items & Scanning */}
        <div className="lg:col-span-2 space-y-6">
          {/* Barcode Scanner Section */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <BarcodeIcon className="w-4 h-4 text-indigo-400" />
              <span>Barcode Scanner First</span>
            </h2>

            <form onSubmit={handleBarcodeSubmit} className="flex gap-2">
              <input
                type="text"
                placeholder="Scan product barcode (or enter manual number)..."
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                className="flex-1 px-3 py-2 bg-slate-950 border border-slate-850 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-slate-800 border border-slate-700 hover:bg-slate-750 text-indigo-400 hover:text-indigo-300 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Scan / Add
              </button>
            </form>
          </div>

          {/* Search Product Section */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 relative">
            <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Search className="w-4 h-4 text-indigo-400" />
              <span>Or Search Product Directory</span>
            </h2>

            <div className="relative">
              <input
                type="text"
                placeholder="Type product name or SKU..."
                value={productSearch}
                onChange={(e) => {
                  setProductSearch(e.target.value);
                  setShowSearchDropdown(true);
                }}
                onFocus={() => setShowSearchDropdown(true)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />

              {showSearchDropdown && searchResults.length > 0 && (
                <div className="absolute top-full left-0 w-full mt-1.5 bg-slate-950 border border-slate-800 rounded-lg shadow-xl z-30 divide-y divide-slate-900">
                  {searchResults.map((prod) => (
                    <button
                      key={prod._id}
                      onClick={() => {
                        addProductToLines(prod);
                        setProductSearch("");
                        setShowSearchDropdown(false);
                      }}
                      className="w-full text-left p-3 hover:bg-slate-900 text-xs flex justify-between items-center transition-colors cursor-pointer"
                    >
                      <div>
                        <div className="font-bold text-slate-200">{prod.name}</div>
                        <div className="text-[10px] text-slate-500 uppercase">
                          SKU: {prod.sku} | Barcode: {prod.barcode}
                        </div>
                      </div>
                      <span className="px-1.5 py-0.2 text-[8px] bg-slate-850 text-slate-400 rounded-sm font-bold uppercase border border-slate-800">
                        {prod.condition}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Invoice Line Items Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2">
              Invoice Line Items
            </h2>

            {lines.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-xs italic">
                No items added yet. Scan a barcode or search for products above.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider pb-2">
                      <th className="pb-3 pr-2">Product Name</th>
                      <th className="pb-3 px-2 text-center w-24">Quantity</th>
                      <th className="pb-3 px-2 text-right w-36">Unit Cost</th>
                      <th className="pb-3 px-2 text-right w-36">Selling Price</th>
                      <th className="pb-3 px-2 text-right w-36">Min Selling</th>
                      <th className="pb-3 pl-2 text-right w-36">Total Amount</th>
                      <th className="pb-3 text-right w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850 text-slate-350">
                    {lines.map((line, idx) => (
                      <tr key={idx} className="hover:bg-slate-850/40">
                        <td className="py-3.5 pr-2">
                          <div className="font-bold text-slate-200">{line.name}</div>
                          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                            SKU: {line.sku} | Barcode: {line.barcode} | Condition: {line.condition}
                          </p>
                        </td>
                        <td className="py-3.5 px-2 text-center">
                          <input
                            type="number"
                            min="1"
                            value={line.quantity}
                            onChange={(e) => handleLineChange(idx, "quantity", parseInt(e.target.value) || 1)}
                            className="w-16 px-2 py-1 bg-slate-950 border border-slate-850 rounded text-center text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                          />
                        </td>
                        <td className="py-3.5 px-2 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="text-[10px] text-slate-500">Rs.</span>
                            <input
                              type="number"
                              min="0"
                              value={line.unitCost}
                              onChange={(e) => handleLineChange(idx, "unitCost", parseFloat(e.target.value) || 0)}
                              className="w-24 px-2 py-1 bg-slate-950 border border-slate-850 rounded text-right text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                        </td>
                        <td className="py-3.5 px-2 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="text-[10px] text-slate-500">Rs.</span>
                            <input
                              type="number"
                              min="0"
                              value={line.sellingPrice}
                              onChange={(e) => handleLineChange(idx, "sellingPrice", parseFloat(e.target.value) || 0)}
                              className="w-24 px-2 py-1 bg-slate-950 border border-slate-850 rounded text-right text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-bold font-mono"
                            />
                          </div>
                        </td>
                        <td className="py-3.5 px-2 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="text-[10px] text-slate-500">Rs.</span>
                            <input
                              type="number"
                              min="0"
                              value={line.minSellingPrice}
                              onChange={(e) => handleLineChange(idx, "minSellingPrice", parseFloat(e.target.value) || 0)}
                              className="w-24 px-2 py-1 bg-slate-950 border border-slate-850 rounded text-right text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-bold font-mono"
                            />
                          </div>
                        </td>
                        <td className="py-3.5 pl-2 text-right font-bold text-slate-200">
                          Rs. {line.amount.toLocaleString("en-PK")}
                        </td>
                        <td className="py-3.5 text-right">
                          <button
                            onClick={() => removeLine(idx)}
                            className="p-1 hover:bg-slate-800 text-rose-500 hover:text-rose-400 rounded cursor-pointer transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Invoice Metadata */}
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2 flex items-center gap-1.5">
              <Truck className="w-4 h-4 text-indigo-400" />
              <span>Purchase Header</span>
            </h2>

            <div className="space-y-4 text-xs">
              {/* Supplier Selection */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Supplier *
                </label>
                <select
                  value={selectedSupplier}
                  onChange={(e) => setSelectedSupplier(e.target.value)}
                  className="w-full px-2.5 py-2 bg-slate-950 border border-slate-850 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
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
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Invoice Number *
                </label>
                <input
                  type="text"
                  placeholder="e.g. SONY-INV-2026-09"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="w-full px-2.5 py-2 bg-slate-950 border border-slate-850 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Invoice Date */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <span>Invoice Date *</span>
                </label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="w-full px-2.5 py-2 bg-slate-950 border border-slate-850 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Internal Notes
                </label>
                <textarea
                  placeholder="Add any internal remarks or memo for this purchase..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  className="w-full px-2.5 py-2 bg-slate-950 border border-slate-850 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 resize-none leading-normal"
                />
              </div>

              {/* Financial calculations */}
              <div className="pt-4 border-t border-slate-800 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-semibold">Subtotal:</span>
                  <span className="font-bold text-slate-200">
                    Rs. {calculateSubtotal().toLocaleString("en-PK")}
                  </span>
                </div>
                <div className="flex justify-between text-sm pt-2 border-t border-slate-850">
                  <span className="font-bold text-slate-300">Invoice Total:</span>
                  <span className="font-extrabold text-indigo-400 text-sm">
                    Rs. {calculateSubtotal().toLocaleString("en-PK")}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Panel */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-2">
            <button
              onClick={() => handleUpdate(true)}
              disabled={submitting}
              className="w-full py-2.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>Resubmit for Approval</span>
            </button>
            <button
              onClick={() => handleUpdate(false)}
              disabled={submitting}
              className="w-full py-2.5 px-3 border border-slate-800 bg-slate-950 hover:bg-slate-850 text-indigo-400 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>Save as Draft</span>
            </button>
          </div>
        </div>
      </div>

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
