"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface LocationOption {
  _id: string;
  name: string;
  code: string;
  type: string;
}

interface ProductOption {
  _id: string;
  name: string;
  sku: string;
  barcode: string;
  serialTracking: boolean;
  condition: string;
  brand?: string;
  modelNumber?: string;
}

interface SerialOption {
  _id: string;
  serialNumber: string;
  status: string;
}

export default function NewTransferPage() {
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);

  const [userRole, setUserRole] = useState<string | null>(null);
  const [reason, setReason] = useState("Stock Request");
  const [notes, setNotes] = useState("");
  const [directApprove, setDirectApprove] = useState(false);

  // Line items state
  const [productSearch, setProductSearch] = useState("");
  const [autoAddOnScan, setAutoAddOnScan] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [condition, setCondition] = useState("New");
  const [quantity, setQuantity] = useState(1);
  const [availableSerials, setAvailableSerials] = useState<SerialOption[]>([]);
  const [selectedSerials, setSelectedSerials] = useState<string[]>([]);
  const [scanStatusMsg, setScanStatusMsg] = useState("");

  const [items, setItems] = useState<
    Array<{
      product: ProductOption;
      condition: string;
      quantity: number;
      serialNumbers: string[];
    }>
  >([]);

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Fetch user session to determine auto-approval permissions
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          const role = d.data.role;
          setUserRole(role);
          if (role === "Admin" || role === "Warehouse") {
            setDirectApprove(true);
          } else {
            setDirectApprove(false);
          }
        }
      });

    // Fetch locations & products
    fetch("/api/locations")
      .then((r) => r.json())

      .then((d) => {
        if (d.success) setLocations(d.data);
      });

    fetch("/api/products")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setProducts(d.data);
      });
  }, []);

  // When product changes, auto-inherit saved product condition & fetch serials if applicable
  useEffect(() => {
    if (!selectedProductId) {
      setAvailableSerials([]);
      setSelectedSerials([]);
      return;
    }

    const prod = products.find((p) => p._id === selectedProductId);
    if (prod) {
      // Auto-inherit saved product condition
      setCondition(prod.condition || "New");

      if (prod.serialTracking) {
        fetch(`/api/serial-numbers?product=${selectedProductId}&status=Available&limit=200`)
          .then((r) => r.json())
          .then((d) => {
            if (d.success) {
              setAvailableSerials(d.data || []);
            }
          });
      } else {
        setAvailableSerials([]);
        setSelectedSerials([]);
      }
    }
  }, [selectedProductId, products]);

  // Robust Barcode & Serial Number Resolver (Handles Bluetooth Scanner & Enter Key)
  const resolveScannedBarcode = async (rawCode: string) => {
    setError("");
    setScanStatusMsg("");
    const cleanCode = rawCode.replace(/[\r\n]/g, "").trim();
    if (!cleanCode) return;

    try {
      setScanStatusMsg("🔍 Querying barcode / serial scanner API...");
      const res = await fetch(`/api/barcodes/scan?barcode=${encodeURIComponent(cleanCode)}`);
      const resData = await res.json();

      if (resData.success && resData.data?.product) {
        const fetchedProd: ProductOption = {
          _id: resData.data.product._id,
          name: resData.data.product.name,
          sku: resData.data.product.sku,
          barcode: resData.data.product.barcode,
          serialTracking: resData.data.product.serialTracking,
          condition: resData.data.product.condition || "New",
          brand: resData.data.product.brand,
          modelNumber: resData.data.product.modelNumber,
        };

        // Ensure product exists in selection list
        setProducts((prev) => {
          if (!prev.some((p) => p._id === fetchedProd._id)) {
            return [...prev, fetchedProd];
          }
          return prev;
        });

        // IF AUTO-ADD MODE IS ON (Default for fast scanner gun workflow):
        if (autoAddOnScan) {
          // If scanned item was a Serial Number:
          if (resData.data.serialDetails?.serialNumber) {
            const scannedSerial = resData.data.serialDetails.serialNumber;

            // Check if serial is ALREADY added in transfer items list
            const isAlreadyAdded = items.some((it) => it.serialNumbers.includes(scannedSerial));
            if (isAlreadyAdded) {
              setScanStatusMsg(`⚠️ Serial '${scannedSerial}' is ALREADY added in this transfer request!`);
              setProductSearch("");
              setTimeout(() => searchInputRef.current?.focus(), 50);
              return;
            }

            // Auto-add serial line item directly to list!
            setItems((prev) => [
              ...prev,
              {
                product: fetchedProd,
                condition: fetchedProd.condition || "New",
                quantity: 1,
                serialNumbers: [scannedSerial],
              },
            ]);

            setScanStatusMsg(`⚡ Auto-Added Serial '${scannedSerial}' for ${fetchedProd.name}!`);
          } else {
            // Non-serialized barcode item auto-add
            setItems((prev) => {
              const existingIdx = prev.findIndex(
                (it) => it.product._id === fetchedProd._id && it.condition === (fetchedProd.condition || "New")
              );
              if (existingIdx >= 0) {
                const updated = [...prev];
                updated[existingIdx].quantity += 1;
                return updated;
              }
              return [
                ...prev,
                {
                  product: fetchedProd,
                  condition: fetchedProd.condition || "New",
                  quantity: 1,
                  serialNumbers: [],
                },
              ];
            });

            setScanStatusMsg(`⚡ Auto-Added Product '${fetchedProd.name}'!`);
          }

          // Clear form & auto-focus input for next scan!
          setProductSearch("");
          setSelectedProductId("");
          setSelectedSerials([]);
          setAvailableSerials([]);
          setQuantity(1);
          setTimeout(() => searchInputRef.current?.focus(), 50);
          return;
        }

        // IF AUTO-ADD MODE IS OFF (Manual Form Selection Mode):
        const isSameProduct = selectedProductId === fetchedProd._id;
        setSelectedProductId(fetchedProd._id);

        if (resData.data.serialDetails?.serialNumber) {
          const scannedSerial = resData.data.serialDetails.serialNumber;
          setSelectedSerials((prev) => {
            if (!isSameProduct || prev.length === 0) {
              setQuantity(1);
              return [scannedSerial];
            }
            if (prev.includes(scannedSerial)) {
              setQuantity(prev.length);
              return prev;
            }
            const updated = [...prev, scannedSerial];
            setQuantity(updated.length);
            return updated;
          });

          setScanStatusMsg(`✅ Scanned & Selected Serial '${scannedSerial}' for ${fetchedProd.name}`);
        } else {
          if (!isSameProduct) {
            setSelectedSerials([]);
            setQuantity(1);
          }
          setScanStatusMsg(`✅ Scanned Product: ${fetchedProd.name}`);
        }

        // Auto-clear search box and refocus for easy manual workflow
        setProductSearch("");
        setTimeout(() => searchInputRef.current?.focus(), 50);
        return;
      }
    } catch (err: any) {
      console.error("Barcode scan lookup error:", err);
    }

    // Local fallback match by barcode, SKU, or name
    const localMatch = products.find(
      (p) =>
        (p.barcode && p.barcode.toLowerCase() === cleanCode.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase() === cleanCode.toLowerCase()) ||
        p.name.toLowerCase() === cleanCode.toLowerCase()
    );

    if (localMatch) {
      if (selectedProductId !== localMatch._id) {
        setSelectedProductId(localMatch._id);
        setSelectedSerials([]);
        setQuantity(1);
      }
      setScanStatusMsg(`✅ Matched Product: ${localMatch.name}`);
      setProductSearch("");
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      setScanStatusMsg(`❌ Barcode / Serial '${cleanCode}' not found in system.`);
    }
  };

  const handleProductSearchChange = (term: string) => {
    setProductSearch(term);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault(); // Prevent form submit on Bluetooth barcode scanner Enter key
      resolveScannedBarcode(productSearch);
    }
  };

  const handleClearSearchInput = () => {
    setProductSearch("");
    setScanStatusMsg("");
    setSelectedProductId("");
    setSelectedSerials([]);
    setAvailableSerials([]);
    setTimeout(() => searchInputRef.current?.focus(), 50);
  };

  // Toggle individual serial number selection (auto-syncs quantity)
  const handleToggleSerial = (serialNum: string) => {
    setError("");
    const isSelected = selectedSerials.includes(serialNum);
    const updated = isSelected
      ? selectedSerials.filter((s) => s !== serialNum)
      : [...selectedSerials, serialNum];

    setSelectedSerials(updated);
    setQuantity(updated.length > 0 ? updated.length : 1);
  };

  // Handle quantity input change
  const handleQuantityInputChange = (val: number) => {
    setError("");
    const newQty = Math.max(1, val);
    setQuantity(newQty);

    // If user reduces quantity below selected serials count, trim selected serials
    if (selectedSerials.length > newQty) {
      setSelectedSerials((prev) => prev.slice(0, newQty));
    }
  };

  // Quick Action: Select All Available Serials
  const handleSelectAllSerials = () => {
    const all = availableSerials.map((s) => s.serialNumber);
    setSelectedSerials(all);
    setQuantity(Math.max(1, all.length));
  };

  // Quick Action: Clear Serial Selection
  const handleClearSerials = () => {
    setSelectedSerials([]);
    setQuantity(1);
  };

  const handleAddItem = () => {
    setError("");
    if (!selectedProductId) {
      setError("Please search or select a product.");
      return;
    }

    const prod = products.find((p) => p._id === selectedProductId);
    if (!prod) return;

    if (quantity <= 0) {
      setError("Quantity must be greater than 0.");
      return;
    }

    let finalSerials = [...selectedSerials];

    if (prod.serialTracking) {
      // If no serials selected manually yet, auto-select up to 'quantity' available serials
      if (finalSerials.length === 0 && availableSerials.length > 0) {
        finalSerials = availableSerials.slice(0, quantity).map((s) => s.serialNumber);
      }

      if (finalSerials.length === 0) {
        setError(`No available serial numbers found in system for "${prod.name}".`);
        return;
      }

      const finalQty = finalSerials.length;

      setItems([
        ...items,
        {
          product: prod,
          condition: prod.condition || condition || "New",
          quantity: finalQty,
          serialNumbers: finalSerials,
        },
      ]);
    } else {
      setItems([
        ...items,
        {
          product: prod,
          condition: prod.condition || condition || "New",
          quantity,
          serialNumbers: [],
        },
      ]);
    }

    // Reset line item fields & focus input for next scan!
    setSelectedProductId("");
    setProductSearch("");
    setScanStatusMsg("");
    setQuantity(1);
    setSelectedSerials([]);
    setAvailableSerials([]);
    setTimeout(() => searchInputRef.current?.focus(), 50);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!sourceLocation || !destinationLocation) {
      setError("Source Location and Destination Location are required.");
      return;
    }

    if (sourceLocation === destinationLocation) {
      setError("Source and Destination locations cannot be the same.");
      return;
    }

    let finalItems = [...items];

    // Auto-add pending selected item if items list is empty but valid selection exists
    if (finalItems.length === 0 && selectedProductId) {
      const prod = products.find((p) => p._id === selectedProductId);
      if (prod && quantity > 0) {
        if (prod.serialTracking && selectedSerials.length !== quantity) {
          setError(`Product requires exact ${quantity} serial numbers selected. Currently selected: ${selectedSerials.length}`);
          return;
        }
        finalItems.push({
          product: prod,
          condition: prod.condition || condition || "New",
          quantity,
          serialNumbers: selectedSerials,
        });
      }
    }

    if (finalItems.length === 0) {
      setError("Please click '+ Add Line Item' to add your item to the transfer list.");
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceLocation,
          destinationLocation,
          reason,
          notes,
          status: directApprove ? "Approved" : "Pending_Approval",
          items: finalItems.map((it) => ({
            product: it.product._id,
            condition: it.condition,
            quantity: it.quantity,
            serialNumbers: it.serialNumbers,
          })),
        }),
      });

      const data = await res.json();
      if (data.success) {
        router.push(`/transfers/${data.data._id}`);
      } else {
        setError(data.error || "Failed to create stock transfer.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to submit request.");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedProductObj = products.find((p) => p._id === selectedProductId);

  // Filtered products list by search, ensuring selectedProductObj is ALWAYS included
  const filteredProducts = products.filter((p) => {
    if (selectedProductId && p._id === selectedProductId) return true;
    if (!productSearch.trim()) return true;
    const s = productSearch.toLowerCase().trim();
    return (
      p.name.toLowerCase().includes(s) ||
      (p.barcode && p.barcode.toLowerCase().includes(s)) ||
      (p.sku && p.sku.toLowerCase().includes(s)) ||
      (p.modelNumber && p.modelNumber.toLowerCase().includes(s))
    );
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 p-5 sm:p-6 rounded-2xl border border-slate-800">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight">
              Create Stock Transfer Request
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm mt-1">
              Search product by name or scan barcode / serial number with Bluetooth scanner
            </p>
          </div>
          <Link
            href="/transfers"
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 border border-slate-700 shrink-0"
          >
            ← Back to Directory
          </Link>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-sm">
            ❌ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Location & Header Selection */}
          <div className="bg-slate-900/80 p-6 rounded-2xl border border-slate-800 space-y-4">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
              1. Transfer Header & Locations
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  From (Source Location) *
                </label>
                <select
                  value={sourceLocation}
                  onChange={(e) => setSourceLocation(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
                  required
                >
                  <option value="">-- Select Source Location --</option>
                  {locations.map((loc) => (
                    <option key={loc._id} value={loc._id}>
                      {loc.name} ({loc.type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  To (Destination Location) *
                </label>
                <select
                  value={destinationLocation}
                  onChange={(e) => setDestinationLocation(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
                  required
                >
                  <option value="">-- Select Destination Location --</option>
                  {locations.map((loc) => (
                    <option key={loc._id} value={loc._id}>
                      {loc.name} ({loc.type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Reason / Purpose</label>
                <input
                  type="text"
                  placeholder="e.g. Stock Request, Customer Inquiry"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Approval Mode</label>
                {userRole === "Admin" || userRole === "Warehouse" ? (
                  <label className="flex items-center gap-2 mt-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={directApprove}
                      onChange={(e) => setDirectApprove(e.target.checked)}
                      className="rounded bg-slate-950 border-slate-800 text-blue-600 focus:ring-0"
                    />
                    <span>Auto-Approve for immediate dispatch</span>
                  </label>
                ) : (
                  <p className="text-xs text-amber-400 mt-2 font-medium">
                    ⚡ Requires Admin / Warehouse Approval before dispatch
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Add Line Items */}
          <div className="bg-slate-900/80 p-6 rounded-2xl border border-slate-800 space-y-4">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
              2. Add Transfer Line Items
            </h2>

            <div className="space-y-4 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              {/* Product Search & Barcode Scanner Input */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs text-slate-400">
                      🔍 Search Product Name, SKU, Barcode or Serial Number
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px] text-blue-400 font-bold cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={autoAddOnScan}
                        onChange={(e) => setAutoAddOnScan(e.target.checked)}
                        className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-0"
                      />
                      <span>⚡ Instant Auto-Add on Scan</span>
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative w-full">
                      <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Type name or scan barcode / serial with scanner gun..."
                        value={productSearch}
                        onChange={(e) => handleProductSearchChange(e.target.value)}
                        onKeyDown={handleSearchKeyDown}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-3 pr-8 py-2 text-xs text-slate-100 focus:border-blue-500 focus:outline-none font-mono"
                      />
                      {productSearch && (
                        <button
                          type="button"
                          onClick={handleClearSearchInput}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-200 font-bold px-1"
                          title="Clear Search"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => resolveScannedBarcode(productSearch)}
                      className="px-3.5 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 font-semibold text-xs rounded-lg border border-blue-500/30 whitespace-nowrap"
                    >
                      Scan / Match
                    </button>
                  </div>
                  {scanStatusMsg && (
                    <p className={`text-[11px] font-semibold mt-1.5 ${
                      scanStatusMsg.startsWith("⚡") || scanStatusMsg.startsWith("✅")
                        ? "text-emerald-400"
                        : "text-amber-400"
                    }`}>
                      {scanStatusMsg}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Select Matched Product</label>
                  <select
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 font-semibold"
                  >
                    <option value="">-- Choose Product ({filteredProducts.length}) --</option>
                    {filteredProducts.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name} ({p.condition}) - Barcode: {p.barcode || p.sku} {p.serialTracking ? "🔢 Serialized" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Auto-inherited Condition & Quantity */}
              {selectedProductObj && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 bg-slate-900/90 rounded-lg border border-slate-800">
                  <div>
                    <span className="block text-[11px] text-slate-400">Auto-Inherited Condition</span>
                    <span className="inline-block mt-1 px-2.5 py-0.5 rounded text-xs font-bold bg-blue-950 text-blue-300 border border-blue-800">
                      {selectedProductObj.condition || "New"}
                    </span>
                  </div>

                  <div>
                    <span className="block text-[11px] text-slate-400">Product SKU & Barcode</span>
                    <span className="text-xs font-mono text-slate-200 mt-1 block">
                      {selectedProductObj.sku} / {selectedProductObj.barcode || "N/A"}
                    </span>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Quantity {selectedProductObj.serialTracking ? "(Auto-synced with Serials)" : ""}
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={quantity}
                      onChange={(e) => handleQuantityInputChange(parseInt(e.target.value) || 1)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1 text-xs text-slate-100 font-bold"
                    />
                  </div>
                </div>
              )}

              {/* Serial Number Selection if product is serialized */}
              {selectedProductObj?.serialTracking && (
                <div className="bg-slate-900/80 p-3.5 rounded-lg border border-slate-800 space-y-2.5">
                  <div className="flex flex-wrap justify-between items-center gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-blue-400">
                        🔢 Serial Numbers for {selectedProductObj.name}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 font-bold">
                        {selectedSerials.length} Selected
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {availableSerials.length > 0 && (
                        <>
                          <button
                            type="button"
                            onClick={handleSelectAllSerials}
                            className="text-[10px] px-2.5 py-1 bg-blue-900/60 hover:bg-blue-800 text-blue-200 font-semibold rounded border border-blue-700 transition"
                          >
                            Select All ({availableSerials.length})
                          </button>
                          {selectedSerials.length > 0 && (
                            <button
                              type="button"
                              onClick={handleClearSerials}
                              className="text-[10px] px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded border border-slate-700 transition"
                            >
                              Clear Selection
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {availableSerials.length === 0 ? (
                    <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-lg text-amber-300 text-xs">
                      ⚠️ No available serial numbers found in system for this product.
                    </div>
                  ) : (
                    <div className="max-h-40 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 p-2 bg-slate-950 rounded-lg border border-slate-800">
                      {availableSerials.map((sn) => {
                        const isChecked = selectedSerials.includes(sn.serialNumber);
                        return (
                          <button
                            type="button"
                            key={sn._id}
                            onClick={() => handleToggleSerial(sn.serialNumber)}
                            className={`flex items-center justify-between p-2 rounded text-[11px] font-mono cursor-pointer border transition text-left ${
                              isChecked
                                ? "bg-blue-950 text-blue-200 border-blue-600 font-bold shadow-xs"
                                : "bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-850 hover:text-slate-200"
                            }`}
                          >
                            <span className="truncate">{sn.serialNumber}</span>
                            <span className={`text-[10px] px-1 rounded ${isChecked ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-500"}`}>
                              {isChecked ? "✓" : "+"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow"
                >
                  + Add Line Item
                </button>
              </div>
            </div>

            {/* Added Items List */}
            {items.length > 0 && (
              <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900 text-slate-400 uppercase border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-4">Product</th>
                      <th className="py-2.5 px-4">Condition</th>
                      <th className="py-2.5 px-4">Qty</th>
                      <th className="py-2.5 px-4">Serials</th>
                      <th className="py-2.5 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {items.map((it, idx) => (
                      <tr key={idx}>
                        <td className="py-2.5 px-4 font-semibold text-slate-100">{it.product.name}</td>
                        <td className="py-2.5 px-4">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-950 text-blue-300 border border-blue-800">
                            {it.condition}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 font-mono font-bold text-blue-400">{it.quantity}</td>
                        <td className="py-2.5 px-4">
                          {it.serialNumbers.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {it.serialNumbers.map((s, i) => (
                                <span
                                  key={i}
                                  className="px-1.5 py-0.5 bg-slate-900 text-blue-300 border border-slate-800 rounded font-mono text-[10px]"
                                >
                                  {s}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="text-rose-400 hover:text-rose-300 text-xs font-semibold"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <Link
              href="/transfers"
              className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold border border-slate-700"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition cursor-pointer disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit Transfer Request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
