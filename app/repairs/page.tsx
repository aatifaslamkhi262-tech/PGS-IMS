"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Wrench,
  Search,
  Plus,
  Trash2,
  Printer,
  CheckCircle,
  AlertCircle,
  Clock,
  DollarSign,
  Barcode,
  User,
  Phone,
  Gamepad2,
  FileText,
  RotateCcw,
} from "lucide-react";
import {
  ThermalRepairSlipModal,
  RepairSlipData,
} from "@/components/ThermalRepairSlipModal";

interface PartItem {
  productId: string;
  productName: string;
  sku: string;
  barcode: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export default function RepairsPage() {
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [staffList, setStaffList] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any | null>(null);

  // Form State
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [productName, setProductName] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [faultReason, setFaultReason] = useState("");
  const [billAmount, setBillAmount] = useState<number | string>(0);
  const [repairCost, setRepairCost] = useState<number | string>(0);
  const [repairedBy, setRepairedBy] = useState("");
  const [paidAmount, setPaidAmount] = useState<number | string>(0);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD" | "BANK_TRANSFER">("CASH");
  const [notes, setNotes] = useState("");

  // Used Parts State
  const [parts, setParts] = useState<PartItem[]>([]);
  const [partSearch, setPartSearch] = useState("");
  const [partSearching, setPartSearching] = useState(false);
  const [partSearchResults, setPartSearchResults] = useState<any[]>([]);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Submitting & Feedback
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Print Slip Modal State
  const [slipData, setSlipData] = useState<RepairSlipData | null>(null);
  const [showSlipModal, setShowSlipModal] = useState(false);

  // Recent Repairs List & Search
  const [repairsList, setRepairsList] = useState<any[]>([]);
  const [repairsLoading, setRepairsLoading] = useState(false);
  const [listSearch, setListSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Collect Balance Modal State
  const [collectingRepair, setCollectingRepair] = useState<any | null>(null);
  const [collectAmount, setCollectAmount] = useState<number>(0);
  const [collectPaymentMethod, setCollectPaymentMethod] = useState<string>("CASH");
  const [collectSubmitting, setCollectSubmitting] = useState(false);

  // Initial Load
  useEffect(() => {
    fetchInitialData();
    fetchRepairs();
  }, []);

  const fetchInitialData = async () => {
    try {
      const [locRes, staffRes, meRes] = await Promise.all([
        fetch("/api/locations"),
        fetch("/api/users/active"),
        fetch("/api/auth/me"),
      ]);

      const locData = await locRes.json();
      if (locData.success && locData.data.length > 0) {
        setLocations(locData.data);
        setSelectedLocation(locData.data[0]._id);
      }

      const staffData = await staffRes.json();
      if (staffData.success && Array.isArray(staffData.data)) {
        setStaffList(staffData.data);
      }

      const meData = await meRes.json();
      if (meData.success) {
        setCurrentUser(meData.data);
        setRepairedBy(meData.data.name || meData.data.username || "In-House Technician");
      }
    } catch {
      // Silent error handling
    }
  };

  const fetchRepairs = async () => {
    setRepairsLoading(true);
    try {
      const params = new URLSearchParams();
      if (listSearch) params.append("search", listSearch);
      if (statusFilter !== "ALL") params.append("status", statusFilter);

      const res = await fetch(`/api/repairs?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setRepairsList(data.data || []);
      }
    } catch {
      // Silent error
    } finally {
      setRepairsLoading(false);
    }
  };

  useEffect(() => {
    fetchRepairs();
  }, [listSearch, statusFilter]);

  // Customer phone auto-lookup
  const handlePhoneBlur = async () => {
    const cleanPhone = customerPhone.trim();
    if (cleanPhone.length >= 7 && !customerName.trim()) {
      try {
        const res = await fetch(`/api/customers?search=${encodeURIComponent(cleanPhone)}`);
        const data = await res.json();
        if (data.success && data.data && data.data.length > 0) {
          const match = data.data.find(
            (c: any) => c.phone?.trim() === cleanPhone || c.phone?.replace(/\D/g, "") === cleanPhone.replace(/\D/g, "")
          );
          if (match && match.name) {
            setCustomerName(match.name);
          }
        }
      } catch {
        // Silent catch
      }
    }
  };

  // Barcode / Product Search for Used Parts
  const handleSearchPart = async (query: string) => {
    setPartSearch(query);
    if (!query.trim()) {
      setPartSearchResults([]);
      return;
    }

    setPartSearching(true);
    try {
      const res = await fetch(`/api/products?search=${encodeURIComponent(query.trim())}&limit=8`);
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setPartSearchResults(data.data);
      } else {
        setPartSearchResults([]);
      }
    } catch {
      setPartSearchResults([]);
    } finally {
      setPartSearching(false);
    }
  };

  // Direct Barcode Scan / Keydown Enter
  const handleBarcodeKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const code = partSearch.trim();
      if (!code) return;

      try {
        const res = await fetch(`/api/products?search=${encodeURIComponent(code)}&limit=1`);
        const data = await res.json();
        if (data.success && data.data && data.data.length > 0) {
          addPart(data.data[0]);
          setPartSearch("");
          setPartSearchResults([]);
        } else {
          setError(`No spare part found with barcode/name '${code}'.`);
        }
      } catch {
        setError("Error looking up part barcode.");
      }
    }
  };

  const addPart = (product: any) => {
    setError("");
    const existingIndex = parts.findIndex((p) => p.productId === product._id);

    if (existingIndex >= 0) {
      const updated = [...parts];
      updated[existingIndex].quantity += 1;
      updated[existingIndex].lineTotal = updated[existingIndex].quantity * updated[existingIndex].unitPrice;
      setParts(updated);
    } else {
      const unitPrice = Number(product.sellingPrice || product.costPrice || 0);
      setParts([
        ...parts,
        {
          productId: product._id,
          productName: product.name,
          sku: product.sku || "",
          barcode: product.barcode || "",
          quantity: 1,
          unitPrice,
          lineTotal: unitPrice,
        },
      ]);
    }
    setPartSearch("");
    setPartSearchResults([]);
    if (barcodeInputRef.current) barcodeInputRef.current.focus();
  };

  const updatePartQuantity = (index: number, newQty: number) => {
    if (newQty <= 0) {
      removePart(index);
      return;
    }
    const updated = [...parts];
    updated[index].quantity = newQty;
    updated[index].lineTotal = newQty * updated[index].unitPrice;
    setParts(updated);
  };

  const updatePartPrice = (index: number, newPrice: number) => {
    const updated = [...parts];
    updated[index].unitPrice = Math.max(0, newPrice);
    updated[index].lineTotal = updated[index].quantity * Math.max(0, newPrice);
    setParts(updated);
  };

  const removePart = (index: number) => {
    setParts(parts.filter((_, i) => i !== index));
  };

  // Calculations
  const numericBill = Math.max(0, Number(billAmount || 0));
  const numericRepairCost = Math.max(0, Number(repairCost || 0));
  const partsTotal = parts.reduce((sum, p) => sum + p.lineTotal, 0);
  const totalAmount = numericBill > 0 ? numericBill : partsTotal;
  const totalCost = numericRepairCost;
  const estimatedProfit = totalAmount - totalCost;
  const numericPaid = Math.max(0, Number(paidAmount || 0));
  const balanceDue = Math.max(0, totalAmount - numericPaid);

  // Reset Form
  const resetForm = () => {
    setCustomerName("");
    setCustomerPhone("");
    setProductName("");
    setSerialNumber("");
    setFaultReason("");
    setBillAmount(0);
    setRepairCost(0);
    setParts([]);
    setPaidAmount(0);
    setNotes("");
    setError("");
  };

  // Submit Repair Job
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    if (!customerName.trim()) {
      setError("Customer name is required.");
      return;
    }
    if (!customerPhone.trim()) {
      setError("Customer mobile number is required.");
      return;
    }
    if (!productName.trim()) {
      setError("Customer product / device name is required.");
      return;
    }
    if (!faultReason.trim()) {
      setError("Fault / Problem description is required.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        productName: productName.trim(),
        serialNumber: serialNumber.trim(),
        faultReason: faultReason.trim(),
        billAmount: totalAmount,
        repairCost: numericRepairCost,
        laborCost: Math.max(0, totalAmount - partsTotal),
        parts: parts.map((p) => ({
          productId: p.productId,
          quantity: p.quantity,
          unitPrice: p.unitPrice,
        })),
        paidAmount: numericPaid,
        paymentMethod,
        repairedBy: repairedBy.trim() || currentUser?.name || currentUser?.username || "In-House Technician",
        locationId: selectedLocation,
        notes: notes.trim(),
      };

      const res = await fetch("/api/repairs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to create repair ticket.");
      }

      setSuccessMsg(`Repair Job ${data.data.repairNumber} created successfully!`);

      // Prepare data for thermal slip modal
      const locObj = locations.find((l) => l._id === selectedLocation);
      const printData: RepairSlipData = {
        repairNumber: data.data.repairNumber,
        createdAt: data.data.createdAt,
        locationName: locObj?.name || "Main Counter",
        repairedBy: data.data.repairedBy,
        customerName: data.data.customerName,
        customerPhone: data.data.customerPhone,
        productName: data.data.productName,
        serialNumber: data.data.serialNumber,
        faultReason: data.data.faultReason,
        parts: (data.data.parts || []).map((p: any) => ({
          productName: p.productName,
          quantity: p.quantity,
          unitPrice: p.unitPrice,
          lineTotal: p.lineTotal,
        })),
        laborCost: data.data.laborCost,
        partsTotal: data.data.partsTotal,
        totalAmount: data.data.totalAmount,
        paidAmount: data.data.paidAmount,
        balanceDue: data.data.balanceDue,
        paymentMethod: data.data.paymentMethod,
        status: data.data.status,
      };

      setSlipData(printData);
      setShowSlipModal(true);
      resetForm();
      fetchRepairs();
    } catch (err: any) {
      setError(err.message || "Failed to save repair.");
    } finally {
      setSubmitting(false);
    }
  };

  // Open Slip for Past Repair
  const handlePrintPastSlip = (repair: any) => {
    const printData: RepairSlipData = {
      repairNumber: repair.repairNumber,
      createdAt: repair.createdAt,
      locationName: repair.locationName || "Main Counter",
      repairedBy: repair.repairedBy,
      customerName: repair.customerName,
      customerPhone: repair.customerPhone,
      productName: repair.productName,
      serialNumber: repair.serialNumber,
      faultReason: repair.faultReason,
      parts: (repair.parts || []).map((p: any) => ({
        productName: p.productName,
        quantity: p.quantity,
        unitPrice: p.unitPrice,
        lineTotal: p.lineTotal,
      })),
      laborCost: repair.laborCost,
      partsTotal: repair.partsTotal,
      totalAmount: repair.totalAmount,
      paidAmount: repair.paidAmount,
      balanceDue: repair.balanceDue,
      paymentMethod: repair.paymentMethod,
      status: repair.status,
    };
    setSlipData(printData);
    setShowSlipModal(true);
  };

  // Collect Balance Handler
  const handleCollectBalanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collectingRepair) return;

    if (collectAmount <= 0) {
      alert("Collection amount must be greater than 0.");
      return;
    }

    setCollectSubmitting(true);
    try {
      const res = await fetch(`/api/repairs/${collectingRepair._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "COLLECT_BALANCE",
          collectAmount,
          paymentMethod: collectPaymentMethod,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to collect balance.");
      }

      setCollectingRepair(null);
      setSuccessMsg(`Successfully collected balance for ${collectingRepair.repairNumber}!`);
      fetchRepairs();
    } catch (err: any) {
      alert(err.message || "Error collecting balance.");
    } finally {
      setCollectSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 lg:p-6 space-y-6">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
            <Wrench className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100">Console & Controller Repairing Terminal</h1>
            <p className="text-xs text-slate-400">
              Simple Job Entry, Serial Number Tracking, Spare Parts Deduction & Thermal Slip
            </p>
          </div>
        </div>

        {/* Location & Technician Quick Selectors */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs flex items-center gap-2">
            <span className="text-slate-400 font-semibold">Location:</span>
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="bg-transparent text-slate-200 font-bold focus:outline-none cursor-pointer"
            >
              {locations.map((loc) => (
                <option key={loc._id} value={loc._id} className="bg-slate-900 text-slate-200">
                  {loc.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Alert Messages */}
      {successMsg && (
        <div className="flex items-center justify-between p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg("")} className="text-emerald-400 hover:text-emerald-200 font-bold text-xs">
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError("")} className="text-red-400 hover:text-red-200 font-bold text-xs">
            ✕
          </button>
        </div>
      )}

      {/* MAIN TWO-COLUMN WORKSPACE: FORM ON LEFT, RECENT JOBS ON RIGHT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: THE CLEAN, SIMPLE REPAIR FORM */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                New Repair Job Sheet
              </h2>
            </div>
            <button
              type="button"
              onClick={resetForm}
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Form</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* 1. Customer Information */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-indigo-400" />
                <span>Customer Information</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1 font-semibold">
                    Customer Mobile Number <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      placeholder="03001234567"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      onBlur={handlePhoneBlur}
                      className="w-full bg-slate-900 border border-slate-700/80 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1 font-semibold">
                    Customer Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ali Khan"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* 2. Customer Product & Fault Details */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Gamepad2 className="w-3.5 h-3.5 text-amber-400" />
                <span>Customer Device & Problem</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1 font-semibold">
                    Device / Product Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. PS5 Slim Disc / DualSense Controller"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1 font-semibold">
                    Customer Product Serial Number (Optional)
                  </label>
                  <div className="relative">
                    <Barcode className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="e.g. 03-27452819-..."
                      value={serialNumber}
                      onChange={(e) => setSerialNumber(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700/80 rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1 font-semibold">
                  Fault / Reason Description <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. HDMI port pin broken - no signal on TV, or Left analog stick drift"
                  value={faultReason}
                  onChange={(e) => setFaultReason(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* 3. Spare Parts Used (Barcode Scanner & Search) */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Barcode className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Spare Parts Installed (Optional)</span>
                </h3>
                <span className="text-[10px] text-slate-500 font-semibold">
                  Barcode Scanner Supported
                </span>
              </div>

              {/* Barcode Search Bar */}
              <div className="relative">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Barcode className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      ref={barcodeInputRef}
                      type="text"
                      placeholder="Scan Barcode or Type Part Name (e.g. HDMI, Analog, IC)..."
                      value={partSearch}
                      onChange={(e) => handleSearchPart(e.target.value)}
                      onKeyDown={handleBarcodeKeyDown}
                      className="w-full bg-slate-900 border border-slate-700/80 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>
                </div>

                {/* Dropdown Suggestions */}
                {partSearchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden max-h-56 overflow-y-auto">
                    {partSearchResults.map((prod) => (
                      <div
                        key={prod._id}
                        onClick={() => addPart(prod)}
                        className="p-2.5 border-b border-slate-800 last:border-b-0 hover:bg-slate-800 cursor-pointer flex items-center justify-between text-xs transition"
                      >
                        <div>
                          <p className="font-bold text-slate-200">{prod.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            SKU: {prod.sku} | Barcode: {prod.barcode}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-bold text-emerald-400">
                            Rs. {(prod.sellingPrice || 0).toLocaleString()}
                          </p>
                          <span className="text-[10px] text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded">
                            Select Part
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Parts Table */}
              {parts.length > 0 ? (
                <div className="overflow-x-auto mt-2">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-[10px] text-slate-400 uppercase tracking-wider">
                        <th className="pb-1.5">Part Name</th>
                        <th className="pb-1.5 text-center w-20">Qty</th>
                        <th className="pb-1.5 text-right w-24">Unit Price</th>
                        <th className="pb-1.5 text-right w-24">Total</th>
                        <th className="pb-1.5 text-center w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {parts.map((p, idx) => (
                        <tr key={idx} className="hover:bg-slate-900/40">
                          <td className="py-2 font-sans font-semibold text-slate-200">
                            {p.productName}
                            <span className="block text-[10px] text-slate-400 font-mono">
                              SKU: {p.sku}
                            </span>
                          </td>
                          <td className="py-2 text-center">
                            <input
                              type="number"
                              min="1"
                              value={p.quantity}
                              onChange={(e) => updatePartQuantity(idx, parseInt(e.target.value, 10) || 1)}
                              className="w-14 bg-slate-900 border border-slate-700 text-center py-1 rounded text-xs text-slate-100 font-bold"
                            />
                          </td>
                          <td className="py-2 text-right">
                            <input
                              type="number"
                              min="0"
                              value={p.unitPrice}
                              onChange={(e) => updatePartPrice(idx, parseFloat(e.target.value) || 0)}
                              className="w-20 bg-slate-900 border border-slate-700 text-right pr-2 py-1 rounded text-xs text-slate-100 font-bold"
                            />
                          </td>
                          <td className="py-2 text-right font-bold text-emerald-400">
                            Rs. {p.lineTotal.toLocaleString()}
                          </td>
                          <td className="py-2 text-center">
                            <button
                              type="button"
                              onClick={() => removePart(idx)}
                              className="text-slate-400 hover:text-red-400 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-[11px] text-slate-500 italic py-1 text-center">
                  No shop spare parts attached. (Only labor charge will be billed if blank).
                </p>
              )}
            </div>

            {/* 4. Financial Charges, Technician Attribution & Settlement */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-4">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                <span>Pricing, Cost & Customer Settlement</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-300 mb-1 font-semibold flex items-center justify-between">
                    <span>Customer Bill (Rs.)</span>
                    <span className="text-[10px] text-emerald-400 font-normal">Customer dega</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={billAmount}
                    onChange={(e) => setBillAmount(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-emerald-400 font-mono font-bold focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-300 mb-1 font-semibold flex items-center justify-between">
                    <span>Repair Cost / Kharcha (Rs.)</span>
                    <span className="text-[10px] text-slate-400 font-normal">Dukaan ka kharcha</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={repairCost}
                    onChange={(e) => setRepairCost(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-amber-400 font-mono font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1 font-semibold">
                    Technician / Repaired By <span className="text-red-400">*</span>
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={repairedBy}
                      onChange={(e) => setRepairedBy(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-bold focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="">Select Technician...</option>
                      {staffList.map((st) => (
                        <option key={st._id} value={st.name || st.username} className="bg-slate-900">
                          {st.name || st.username} ({st.role})
                        </option>
                      ))}
                      <option value="In-House Technician" className="bg-slate-900">
                        In-House Technician
                      </option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Bill & Profit Totals Summary */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Customer Total Bill:</span>
                  <span className="font-mono text-emerald-400 font-bold">Rs. {totalAmount.toLocaleString()}</span>
                </div>
                {totalCost > 0 && (
                  <div className="flex justify-between text-slate-400">
                    <span>Repair Cost (Kharcha):</span>
                    <span className="font-mono text-slate-300">Rs. {totalCost.toLocaleString()}</span>
                  </div>
                )}
                {partsTotal > 0 && (
                  <div className="flex justify-between text-slate-400">
                    <span>Installed Parts Total:</span>
                    <span className="font-mono text-slate-300">Rs. {partsTotal.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs font-bold pt-1 border-t border-slate-800">
                  <span className="text-slate-300">ESTIMATED NET PROFIT:</span>
                  <span className={`font-mono font-bold ${estimatedProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    Rs. {estimatedProfit.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Payment Settlement Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1 font-semibold">
                    Customer Paid Amount (Rs.)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono font-bold focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1 font-semibold">
                    Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-semibold focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="CASH">CASH (Physical Drawer)</option>
                    <option value="CARD">CARD / POS Machine</option>
                    <option value="BANK_TRANSFER">BANK TRANSFER / Online</option>
                  </select>
                </div>
              </div>

              {/* Outstanding Balance Banner */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                <span className="font-semibold text-slate-400">Remaining Balance Due:</span>
                <span className={`font-mono font-bold text-sm ${balanceDue > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                  Rs. {balanceDue.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Submit Action Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition"
              >
                <Printer className="w-4 h-4" />
                <span>{submitting ? "Saving & Generating Slip..." : "Save Repair Ticket & Print Slip"}</span>
              </button>
            </div>

          </form>
        </div>

        {/* RIGHT COLUMN: RECENT REPAIRS AUDIT & SEARCH LIST */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                Recent Repair Tickets
              </h2>
            </div>
            <span className="text-[10px] text-slate-400 font-mono bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
              {repairsList.length} Total
            </span>
          </div>

          {/* Search & Filter Controls */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search by S/N, Phone, Job #, or Customer..."
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex gap-1.5 overflow-x-auto text-xs">
              {["ALL", "COMPLETED", "PENDING", "DELIVERED"].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                    statusFilter === st
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* List of Repair Tickets */}
          <div className="space-y-3 max-h-[680px] overflow-y-auto pr-1">
            {repairsLoading ? (
              <div className="text-center py-10 text-slate-500 text-xs">Loading repair tickets...</div>
            ) : repairsList.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-xs">
                No repair tickets match the search query.
              </div>
            ) : (
              repairsList.map((r) => (
                <div
                  key={r._id}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2.5 hover:border-slate-700 transition"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono font-bold text-xs text-amber-400">
                        {r.repairNumber}
                      </span>
                      <span className="text-[10px] text-slate-400 ml-2">
                        {new Date(r.createdAt).toLocaleDateString("en-PK", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                        r.status === "COMPLETED"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : r.status === "DELIVERED"
                          ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                          : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      }`}
                    >
                      {r.status}
                    </span>
                  </div>

                  <div>
                    <p className="font-bold text-slate-200 text-xs">{r.productName}</p>
                    {r.serialNumber && (
                      <p className="text-[11px] font-mono text-indigo-400 font-semibold">
                        S/N: {r.serialNumber}
                      </p>
                    )}
                    <p className="text-[11px] text-slate-400 italic">
                      Fault: {r.faultReason}
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-850 pt-2">
                    <div>
                      <span>Customer: </span>
                      <span className="text-slate-200 font-semibold">{r.customerName}</span>
                      <span className="font-mono text-slate-400 text-[10px] ml-1">({r.customerPhone})</span>
                    </div>
                    <div>
                      <span>Tech: </span>
                      <span className="text-slate-300 font-semibold">{r.repairedBy}</span>
                    </div>
                  </div>

                  {/* Pricing & Balance Row */}
                  <div className="flex items-center justify-between bg-slate-900 border border-slate-800/80 rounded-lg px-2.5 py-1.5 text-xs font-mono">
                    <div>
                      <span className="text-[10px] text-slate-400">Bill: </span>
                      <span className="font-bold text-slate-200">Rs. {r.totalAmount.toLocaleString()}</span>
                    </div>
                    {((r.repairCost || 0) + (r.partsCostTotal || 0)) > 0 && (
                      <div>
                        <span className="text-[10px] text-slate-400">Cost: </span>
                        <span className="font-bold text-slate-400">Rs. {((r.repairCost || 0) + (r.partsCostTotal || 0)).toLocaleString()}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-[10px] text-slate-400">Profit: </span>
                      <span className="font-bold text-emerald-400">Rs. {(r.totalAmount - ((r.repairCost || 0) + (r.partsCostTotal || 0))).toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400">Balance: </span>
                      <span className={`font-bold ${r.balanceDue > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                        Rs. {r.balanceDue.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    {r.balanceDue > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setCollectingRepair(r);
                          setCollectAmount(r.balanceDue);
                        }}
                        className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition"
                      >
                        Collect Balance
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handlePrintPastSlip(r)}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition flex items-center gap-1"
                    >
                      <Printer className="w-3 h-3" />
                      <span>Slip</span>
                    </button>
                  </div>

                </div>
              ))
            )}
          </div>

        </div>

      </div>

      {/* THERMAL PRINT MODAL */}
      {showSlipModal && slipData && (
        <ThermalRepairSlipModal
          repairData={slipData}
          onClose={() => setShowSlipModal(false)}
        />
      )}

      {/* COLLECT BALANCE MODAL */}
      {collectingRepair && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-5 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <span>Collect Remaining Repair Balance</span>
            </h3>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Repair Job:</span>
                <span className="font-mono font-bold text-amber-400">{collectingRepair.repairNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Customer:</span>
                <span className="text-slate-200 font-semibold">{collectingRepair.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total Billed:</span>
                <span className="font-mono text-slate-200">Rs. {collectingRepair.totalAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-bold text-amber-400 pt-1 border-t border-slate-800">
                <span>Balance Due:</span>
                <span>Rs. {collectingRepair.balanceDue.toLocaleString()}</span>
              </div>
            </div>

            <form onSubmit={handleCollectBalanceSubmit} className="space-y-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1 font-semibold">
                  Amount to Collect (Rs.)
                </label>
                <input
                  type="number"
                  min="1"
                  max={collectingRepair.balanceDue}
                  required
                  value={collectAmount}
                  onChange={(e) => setCollectAmount(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono font-bold text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1 font-semibold">
                  Payment Method
                </label>
                <select
                  value={collectPaymentMethod}
                  onChange={(e) => setCollectPaymentMethod(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-semibold focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="CASH">CASH (Physical Drawer)</option>
                  <option value="CARD">CARD / POS Machine</option>
                  <option value="BANK_TRANSFER">BANK TRANSFER / Online</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCollectingRepair(null)}
                  className="flex-1 py-2 text-xs font-semibold rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={collectSubmitting}
                  className="flex-1 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition"
                >
                  {collectSubmitting ? "Collecting..." : "Confirm & Collect"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
