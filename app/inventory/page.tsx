"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Layers,
  Search,
  Filter,
  ArrowRight,
  AlertCircle,
  Truck,
  Grid,
  Plus,
  X,
} from "lucide-react";
import { ToastContainer, ToastMessage } from "@/components/Toast";

interface InventoryProduct {
  product: {
    _id: string;
    name: string;
    brand?: string;
    modelNumber?: string;
    model?: string;
    color?: string;
    sku: string;
    barcode: string;
    condition: string;
    serialTracking: boolean;
  };
  locations: {
    locationId: string;
    locationName: string;
    locationCode: string;
    locationType: string;
    quantity: number;
  }[];
  totalQuantity: number;
  status: "In Stock" | "Out of Stock";
}

export default function InventoryPage() {
  const [inventory, setInventory] = useState<InventoryProduct[]>([]);
  const [locations, setLocations] = useState<{ _id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ _id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userRole, setUserRole] = useState("");

  // Create Location Modal State
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [newLocName, setNewLocName] = useState("");
  const [newLocCode, setNewLocCode] = useState("");
  const [newLocType, setNewLocType] = useState("Branch");
  const [modalError, setModalError] = useState("");
  const [creatingLocation, setCreatingLocation] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [selectedCondition, setSelectedCondition] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedSerialized, setSelectedSerialized] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const addToast = (type: "success" | "error" | "info", text: string) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, type, text }]);
  };
  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Fetch Locations for filters
  const fetchLocations = async () => {
    try {
      const res = await fetch("/api/locations?activeOnly=true");
      const data = await res.json();
      if (data.success) {
        setLocations(data.data);
      }
    } catch {
      console.error("Failed to load locations for filters");
    }
  };

  // Fetch Categories for filters
  const fetchCategories = async () => {
    try {
      const res = await fetch("/api/categories");
      const data = await res.json();
      if (data.success) {
        setCategories(data.data);
      }
    } catch {
      console.error("Failed to load categories for filters");
    }
  };

  // Fetch Inventory List
  const fetchInventory = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.append("search", search);
      if (selectedLocation) params.append("location", selectedLocation);
      if (selectedCondition) params.append("condition", selectedCondition);
      if (selectedCategory) params.append("category", selectedCategory);
      if (selectedSerialized) params.append("serialized", selectedSerialized);
      if (selectedStatus) params.append("status", selectedStatus);

      const res = await fetch(`/api/inventory?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setInventory(data.data);
      } else {
        setError(data.error || "Failed to load inventory registry.");
      }
    } catch {
      setError("Failed to fetch inventory from server.");
    } finally {
      setLoading(false);
    }
  };

  // Fetch session & role
  const fetchSession = async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      if (data.success) {
        setUserRole(data.data.role);
      }
    } catch {
      console.error("Failed to fetch session");
    }
  };

  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLocName.trim() || !newLocCode.trim() || !newLocType) {
      setModalError("All fields are required.");
      return;
    }
    setCreatingLocation(true);
    setModalError("");
    try {
      const res = await fetch("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newLocName.trim(),
          code: newLocCode.trim().toUpperCase(),
          type: newLocType,
        }),
      });
      const data = await res.json();
      if (data.success) {
        addToast("success", `Location "${newLocName}" created successfully!`);
        setShowLocationModal(false);
        setNewLocName("");
        setNewLocCode("");
        setNewLocType("Branch");
        // Refresh locations filter list
        fetchLocations();
        // Refresh inventory table to show the new location column
        fetchInventory();
      } else {
        setModalError(data.error || "Failed to create location.");
      }
    } catch {
      setModalError("Network error. Failed to create location.");
    } finally {
      setCreatingLocation(false);
    }
  };

  useEffect(() => {
    fetchSession();
    fetchLocations();
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchInventory();
  }, [search, selectedLocation, selectedCondition, selectedCategory, selectedSerialized, selectedStatus]);

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-400" />
            <span>Inventory Registry</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Monitor physical stock levels, location-wise distributions, conditions, and serial numbers.
          </p>
        </div>

        {userRole && (userRole === "Admin" || userRole === "Warehouse") && (
          <button
            onClick={() => {
              setShowLocationModal(true);
              setModalError("");
            }}
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-655 hover:bg-indigo-600 text-white rounded-lg text-xs font-semibold shadow-md shadow-indigo-900/30 transition-colors cursor-pointer w-full sm:w-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Create Location</span>
          </button>
        )}
      </div>

      {/* Search & Filter Panel */}
      <div className="bg-slate-900 p-4 border border-slate-800 rounded-xl grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {/* Search */}
        <div className="relative col-span-1 sm:col-span-2">
          <Search className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by product, SKU, barcode, serial..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-850 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
          />
        </div>

        {/* Location Filter */}
        <div className="relative">
          <Truck className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-850 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer appearance-none"
          >
            <option value="">All Locations</option>
            {locations.map((loc) => (
              <option key={loc._id} value={loc._id}>
                {loc.name}
              </option>
            ))}
          </select>
        </div>

        {/* Category Filter */}
        <div className="relative">
          <Grid className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-850 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer appearance-none"
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat._id} value={cat._id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        {/* Condition Filter */}
        <div className="relative">
          <Filter className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
          <select
            value={selectedCondition}
            onChange={(e) => setSelectedCondition(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-850 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer appearance-none"
          >
            <option value="">All Conditions</option>
            <option value="New">New</option>
            <option value="Used">Used</option>
          </select>
        </div>

        {/* Serialized Filter */}
        <div className="relative">
          <Filter className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
          <select
            value={selectedSerialized}
            onChange={(e) => setSelectedSerialized(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-850 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer appearance-none"
          >
            <option value="">All Tracking</option>
            <option value="true">Serialized</option>
            <option value="false">Non-Serialized</option>
          </select>
        </div>
      </div>

      {/* Loader & Error */}
      {loading && inventory.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-slate-900 border border-slate-800 rounded-xl">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
          <span className="text-xs">Loading inventory registry...</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold rounded-xl flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && inventory.length === 0 && (
        <div className="text-center py-16 bg-slate-900 border border-slate-800 rounded-xl">
          <Layers className="w-12 h-12 text-slate-650 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-200">No Stock Found</h3>
          <p className="text-xs text-slate-400 mt-1 px-4">
            Try adjusting search keyword filters or check if stock has been received yet.
          </p>
        </div>
      )}

      {/* Inventory List */}
      {!loading && !error && inventory.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xs">
          {/* Desktop Table view */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950 border-b border-slate-850 text-slate-400 font-bold uppercase tracking-wider">
                  <th className="p-4">Product Details</th>
                  <th className="p-4">Model</th>
                  <th className="p-4 text-center">Color</th>
                  <th className="p-4 text-center">Condition</th>
                  <th className="p-4">Location-wise Stock Breakdown</th>
                  <th className="p-4 text-center">Total Stock</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-350">
                {inventory.map((item) => (
                  <tr key={item.product._id} className="hover:bg-slate-850 transition-colors">
                    <td className="p-4 space-y-0.5">
                      <div className="font-bold text-slate-200">{item.product.name}</div>
                      {item.product.brand && (
                        <div className="text-xs text-indigo-300 font-semibold">{item.product.brand}</div>
                      )}
                      <div className="text-[10px] text-slate-500 font-bold uppercase">
                        SKU: {item.product.sku} | Barcode: {item.product.barcode}
                      </div>
                      {item.product.serialTracking && (
                        <span className="inline-block mt-1 px-1.5 py-0.2 text-[8px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/25 rounded uppercase">
                          Serialized
                        </span>
                      )}
                    </td>
                    <td className="p-4 font-mono text-slate-300">
                      {item.product.modelNumber || item.product.model || "-"}
                    </td>
                    <td className="p-4 text-center">
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-purple-500/10 text-purple-300 border border-purple-500/20 rounded uppercase">
                        {item.product.color || "Unspecified"}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-800 text-slate-300 rounded border border-slate-700 uppercase">
                        {item.product.condition}
                      </span>
                    </td>
                    <td className="p-4">
                      {/* Grid representation for locations */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5 max-w-lg">
                        {item.locations.map((loc) => (
                          <div key={loc.locationId} className="flex gap-1.5 items-center">
                            <span className="text-[10px] text-slate-500 font-bold uppercase">
                              {loc.locationCode}:
                            </span>
                            <span
                              className={`font-bold ${
                                loc.quantity > 0 ? "text-slate-200" : "text-slate-600 font-medium"
                              }`}
                            >
                              {loc.quantity}
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="p-4 text-center font-extrabold text-slate-200 text-sm">
                      {item.totalQuantity}
                    </td>
                    <td className="p-4 text-center">
                      <span
                        className={`px-2 py-0.5 text-[9px] font-bold rounded-sm border ${
                          item.totalQuantity > 0
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-slate-800 text-slate-500 border-slate-750"
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <Link
                        href={`/inventory/${item.product._id}`}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 px-2 py-1 bg-slate-800 border border-slate-755 rounded"
                      >
                        <span>View Ledger</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card view */}
          <div className="block md:hidden divide-y divide-slate-800/60">
            {inventory.map((item) => (
              <div key={item.product._id} className="p-4 space-y-3.5 hover:bg-slate-850/30 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold text-slate-200">{item.product.name}</h3>
                    {item.product.brand && (
                      <span className="text-[11px] text-indigo-300 font-semibold block">{item.product.brand}</span>
                    )}
                    <p className="text-[10px] text-slate-500 uppercase tracking-tight font-semibold">
                      SKU: {item.product.sku} {(item.product.modelNumber || item.product.model) ? `| Model: ${item.product.modelNumber || item.product.model}` : ""}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-0.5 text-[8px] font-bold rounded-sm border ${
                      item.totalQuantity > 0
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : "bg-slate-800 text-slate-500 border-slate-750"
                    }`}
                  >
                    {item.status}
                  </span>
                </div>

                {/* Locations list */}
                <div className="grid grid-cols-2 gap-2 bg-slate-950/60 p-2.5 border border-slate-850 rounded-lg text-xs">
                  {item.locations.map((loc) => (
                    <div key={loc.locationId} className="flex justify-between items-center text-slate-400">
                      <span className="font-semibold text-slate-550">{loc.locationName}</span>
                      <span className={`font-bold ${loc.quantity > 0 ? "text-slate-200" : "text-slate-600"}`}>
                        {loc.quantity}
                      </span>
                    </div>
                  ))}
                  <div className="col-span-2 pt-2 border-t border-slate-900 flex justify-between items-center font-bold text-slate-200">
                    <span>Total Quantity</span>
                    <span className="text-indigo-400">{item.totalQuantity}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800/40">
                  <div className="flex items-center gap-1.5">
                    <span className="px-1.5 py-0.2 text-[8px] font-bold bg-slate-800 text-slate-400 rounded uppercase">
                      Condition: {item.product.condition}
                    </span>
                    <span className="px-1.5 py-0.2 text-[8px] font-bold bg-purple-500/10 text-purple-300 border border-purple-500/20 rounded uppercase">
                      Color: {item.product.color || "Unspecified"}
                    </span>
                  </div>
                  <Link
                    href={`/inventory/${item.product._id}`}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300"
                  >
                    <span>View stock ledger</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Create Location Modal */}
      {showLocationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Truck className="w-4 h-4 text-indigo-400" />
                <span>Create New Stock Location</span>
              </h2>
              <button
                onClick={() => setShowLocationModal(false)}
                className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer font-bold"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateLocation} className="p-5 space-y-4 text-xs">
              {modalError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-slate-450 uppercase tracking-wider mb-1.5">
                  Location Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. G-12 or Claim Godam"
                  value={newLocName}
                  onChange={(e) => setNewLocName(e.target.value)}
                  className="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-455 uppercase tracking-wider mb-1.5">
                  Location Code *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. G12 or CG"
                  value={newLocCode}
                  onChange={(e) => setNewLocCode(e.target.value)}
                  className="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 uppercase"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-455 uppercase tracking-wider mb-1.5">
                  Location Type *
                </label>
                <select
                  value={newLocType}
                  onChange={(e) => setNewLocType(e.target.value)}
                  className="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-250 focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="Warehouse">Warehouse</option>
                  <option value="Branch">Branch</option>
                  <option value="Claim Godam">Claim Godam</option>
                </select>
              </div>

              <div className="pt-2 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowLocationModal(false)}
                  className="px-4 py-2 border border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingLocation}
                  className="px-4 py-2 bg-indigo-650 hover:bg-indigo-600 text-white rounded-lg text-[11px] font-bold transition-colors shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {creatingLocation && (
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  <span>Create Location</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
