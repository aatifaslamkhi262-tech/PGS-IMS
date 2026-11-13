"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import {
  Layers,
  Lock,
  AlertTriangle,
  ArrowRightLeft,
  Camera,
  RotateCcw,
  Check,
  X,
  HelpCircle,
  Sparkles,
  Plus,
  RefreshCw,
  Barcode,
  Wrench,
  Send,
} from "lucide-react";
import { ToastContainer, ToastMessage } from "@/components/Toast";
import { CameraBarcodeScannerModal } from "@/components/CameraBarcodeScannerModal";
import { Pagination } from "@/components/Pagination";

interface BranchLocation {
  _id: string;
  name: string;
  code: string;
  type: string;
}

interface SerialItemState {
  serialNumber: string;
  originalLocationId: string;
  currentLocationId: string; // branch _id, or "DAMAGE_CLAIM", or "SOLD"
  condition?: string;
  status:
    | "VERIFIED"
    | "UNCHECKED"
    | "MOVED"
    | "PENDING_BRANCH_CHECK"
    | "DAMAGE_CLAIM"
    | "SOLD";
  checkedOutBranches: string[];
}

interface SyncRowItem {
  productId: string;
  name: string;
  brand: string;
  sku: string;
  barcode: string;
  model: string;
  condition: string;
  serialTracking: boolean;
  lockedAvgCost: number;
  systemBranchQty: Record<string, number>;
  physicalBranchQty: Record<string, number>;
  systemDamageClaimQty: number;
  physicalDamageClaimQty: number;
  serials: SerialItemState[];
  rowVerified: boolean;
}

export default function LiveBranchStockSyncPage() {
  const [branches, setBranches] = useState<BranchLocation[]>([]);
  const [rows, setRows] = useState<SyncRowItem[]>([]);
  const [editedRowsMap, setEditedRowsMap] = useState<Record<string, SyncRowItem>>({});
  const [savingProductIds, setSavingProductIds] = useState<Record<string, boolean>>({});
  // Track live POS sales detected while user has screen open: { [productId]: { serials: string[], branchQty: Record<string, number> } }
  const [livePosSalesMap, setLivePosSalesMap] = useState<
    Record<string, { serials: string[]; branchQty: Record<string, number> }>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Last scanned/searched spotlight product ID
  const [highlightedProductId, setHighlightedProductId] = useState<string | null>(null);

  // Pagination & Server Search
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Filters & active focus
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categories, setCategories] = useState<Array<{ _id: string; name: string }>>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [inStockOnly, setInStockOnly] = useState<boolean>(true);
  const [trackingFilter, setTrackingFilter] = useState<"ALL" | "SERIAL" | "NON_SERIAL">("ALL");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "DAMAGE_CLAIM" | "MODIFIED" | "BRANCH_CHECK" | "VERIFIED"
  >("ALL");
  const [focusBranchId, setFocusBranchId] = useState<string>("");

  // Active serial popover
  const [activeSerialMenu, setActiveSerialMenu] = useState<{
    productId: string;
    serialNumber: string;
  } | null>(null);

  // Partial restore state per product: { qty: number, branchId: string }
  const [restoreInputs, setRestoreInputs] = useState<
    Record<string, { qty: number; branchId: string }>
  >({});

  // Quick add serial input per row
  const [newSerialInputs, setNewSerialInputs] = useState<Record<string, string>>({});
  const [cameraScannerOpen, setCameraScannerOpen] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const addToast = (type: "success" | "error" | "info", text: string) => {
    setToasts((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, type, text }]);
  };
  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Auto-focus search/barcode box on load and when pressing "/" or F2
  useEffect(() => {
    searchInputRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === "/" || e.key === "F2") && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 250);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Load categories once on mount
  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => {
        if (d?.success && Array.isArray(d.data)) {
          setCategories(d.data);
        }
      })
      .catch(() => {});
  }, []);

  // Reset to page 1 on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, trackingFilter, statusFilter, selectedCategory, inStockOnly]);

  const updateRowState = (productId: string, updater: (row: SyncRowItem) => SyncRowItem) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.productId !== productId) return r;
        const updated = updater(r);
        setEditedRowsMap((mapPrev) => ({ ...mapPrev, [productId]: updated }));
        return updated;
      })
    );
  };

  // Load 100% REAL inventory, branches, Damage & Claim pool, serials & average cost from DB
  const loadRealData = async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: itemsPerPage.toString(),
        tracking: trackingFilter,
      });
      if (debouncedSearch) {
        params.set("search", debouncedSearch);
      }
      if (selectedCategory) {
        params.set("category", selectedCategory);
      }
      if (inStockOnly && !debouncedSearch) {
        params.set("inStockOnly", "true");
      }
      if (statusFilter === "DAMAGE_CLAIM") {
        params.set("onlyDamageClaim", "true");
      }

      const res = await fetch(`/api/inventory/live-sync?${params.toString()}`, { signal });
      if (signal?.aborted) return;
      const data = await res.json();
      if (signal?.aborted) return;

      if (!data.success) {
        setError(data.error || "Failed to load real inventory from database.");
        setRows([]);
        return;
      }

      const dbBranches: BranchLocation[] = data.branches || [];
      setBranches(dbBranches);
      if (!focusBranchId && dbBranches.length > 0) {
        setFocusBranchId(dbBranches[0]._id);
      }

      const incomingRows: SyncRowItem[] = (data.rows || []).map((r: SyncRowItem) => {
        return editedRowsMap[r.productId] ? editedRowsMap[r.productId] : r;
      });

      setRows(incomingRows);
      setTotalItems(data.pagination?.total || 0);
      setTotalPages(data.pagination?.totalPages || 1);

      if (debouncedSearch && incomingRows.length === 1) {
        setHighlightedProductId(incomingRows[0].productId);
      } else if (!debouncedSearch) {
        setHighlightedProductId(null);
      }
    } catch (err: any) {
      if (err.name === "AbortError" || signal?.aborted) return;
      setError("Database connection error while loading inventory.");
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    loadRealData(controller.signal);
    return () => controller.abort();
  }, [currentPage, itemsPerPage, debouncedSearch, trackingFilter, statusFilter, selectedCategory, inStockOnly]);

  // LIVE POS SALE WATCHER: Poll every 8s in background to auto-remove POS-sold serials & auto-deduct POS-sold quantities
  useEffect(() => {
    const interval = setInterval(async () => {
      if (loading || Object.values(savingProductIds).some(Boolean)) return;
      try {
        const params = new URLSearchParams({
          page: currentPage.toString(),
          limit: itemsPerPage.toString(),
          tracking: trackingFilter,
        });
        if (debouncedSearch) params.set("search", debouncedSearch);
        if (selectedCategory) params.set("category", selectedCategory);
        if (inStockOnly && !debouncedSearch) params.set("inStockOnly", "true");
        if (statusFilter === "DAMAGE_CLAIM") params.set("onlyDamageClaim", "true");

        const res = await fetch(`/api/inventory/live-sync?${params.toString()}`);
        const data = await res.json();
        if (!data?.success || !Array.isArray(data.rows)) return;

        const freshMap = new Map<string, SyncRowItem>();
        for (const fr of data.rows) {
          freshMap.set(fr.productId, fr);
        }

        setRows((prevRows) =>
          prevRows.map((curr) => {
            const fresh = freshMap.get(curr.productId);
            if (!fresh) return curr;

            // 1. Check Serialized POS Sales
            if (curr.serialTracking) {
              const freshSerialSet = new Set(fresh.serials.map((s) => s.serialNumber));
              const newlySoldSerials = curr.serials
                .filter(
                  (s) =>
                    s.status !== "SOLD" &&
                    !freshSerialSet.has(s.serialNumber)
                )
                .map((s) => s.serialNumber);

              if (newlySoldSerials.length > 0) {
                addToast(
                  "info",
                  `🛒 POS Sale Alert: "${curr.name}" serial (${newlySoldSerials.join(", ")}) abhi POS se bik gaya — screen se auto-remove kar diya gaya!`
                );
                setLivePosSalesMap((prev) => ({
                  ...prev,
                  [curr.productId]: {
                    serials: Array.from(
                      new Set([...(prev[curr.productId]?.serials || []), ...newlySoldSerials])
                    ),
                    branchQty: prev[curr.productId]?.branchQty || {},
                  },
                }));

                const updatedRow: SyncRowItem = {
                  ...curr,
                  systemBranchQty: fresh.systemBranchQty,
                  serials: curr.serials.filter((s) => !newlySoldSerials.includes(s.serialNumber)),
                };
                setEditedRowsMap((m) => (m[curr.productId] ? { ...m, [curr.productId]: updatedRow } : m));
                return updatedRow;
              }
              return curr;
            }

            // 2. Check Non-Serialized POS Sales (DB stock dropped at any branch)
            let anyBranchDropped = false;
            const nextSysQty = { ...curr.systemBranchQty };
            const nextPhysQty = { ...curr.physicalBranchQty };
            const branchSoldNotices: Record<string, number> = {};

            for (const b of branches) {
              const oldDb = curr.systemBranchQty[b._id] || 0;
              const newDb = fresh.systemBranchQty[b._id] || 0;
              if (newDb < oldDb) {
                const soldDelta = oldDb - newDb;
                anyBranchDropped = true;
                nextSysQty[b._id] = newDb;
                nextPhysQty[b._id] = Math.max(0, (curr.physicalBranchQty[b._id] ?? oldDb) - soldDelta);
                branchSoldNotices[b._id] = soldDelta;
                addToast(
                  "info",
                  `🛒 POS Sale Alert: "${curr.name}" ke ${soldDelta} pcs abhi ${b.code} par POS se bik gaye — quantity khud -${soldDelta} kar di gayi!`
                );
              }
            }

            if (anyBranchDropped) {
              setLivePosSalesMap((prev) => {
                const prevBranchQty = prev[curr.productId]?.branchQty || {};
                const mergedBranchQty = { ...prevBranchQty };
                for (const [bid, delta] of Object.entries(branchSoldNotices)) {
                  mergedBranchQty[bid] = (mergedBranchQty[bid] || 0) + delta;
                }
                return {
                  ...prev,
                  [curr.productId]: {
                    serials: prev[curr.productId]?.serials || [],
                    branchQty: mergedBranchQty,
                  },
                };
              });

              const updatedRow: SyncRowItem = {
                ...curr,
                systemBranchQty: nextSysQty,
                physicalBranchQty: nextPhysQty,
              };
              setEditedRowsMap((m) => (m[curr.productId] ? { ...m, [curr.productId]: updatedRow } : m));
              return updatedRow;
            }

            return curr;
          })
        );
      } catch {
        // ignore silent background poll errors
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [
    loading,
    savingProductIds,
    currentPage,
    itemsPerPage,
    debouncedSearch,
    trackingFilter,
    statusFilter,
    selectedCategory,
    inStockOnly,
    branches,
  ]);

  // 1-Click helper for Serialized Branch Cell: Keep Verified serials in this branch, move remaining unchecked serials of this branch to Damage & Claim
  const moveUncheckedBranchSerialsToClaim = (
    productId: string,
    branchId: string,
    branchCode: string
  ) => {
    let movedCount = 0;
    updateRowState(productId, (r) => ({
      ...r,
      serials: r.serials.map((s) => {
        if (s.currentLocationId === branchId && s.status === "UNCHECKED") {
          movedCount += 1;
          return {
            ...s,
            currentLocationId: "DAMAGE_CLAIM",
            status: "DAMAGE_CLAIM" as const,
          };
        }
        return s;
      }),
    }));
    if (movedCount > 0) {
      addToast(
        "info",
        `${branchCode} ke ${movedCount} unchecked serials Damage & Claim mein bhej diye gaye (Click Verify & Save)`
      );
    }
  };

  // Update Non-Serialized Branch Qty
  const updateNonSerialQty = (productId: string, branchId: string, newQty: number) => {
    const cleanQty = Math.max(0, Number.isNaN(newQty) ? 0 : newQty);
    updateRowState(productId, (r) => ({
      ...r,
      physicalBranchQty: {
        ...r.physicalBranchQty,
        [branchId]: cleanQty,
      },
    }));
  };

  const zeroOutBranchQty = (productId: string, branchId: string, branchCode: string) => {
    updateNonSerialQty(productId, branchId, 0);
    addToast(
      "info",
      `${branchCode} set to 0 — kam nikalne wale pieces Damage & Claim mein chale jayenge (Cost 🔒)`
    );
  };

  // Serial Actions (including Two-Way Damage & Claim)
  const handleSerialAction = (
    productId: string,
    serialNumber: string,
    action:
      | "VERIFY_HERE"
      | "MOVE_BRANCH"
      | "ASK_OTHER_BRANCHES"
      | "SEND_TO_DAMAGE_CLAIM"
      | "MARK_SOLD",
    targetBranchId?: string
  ) => {
    updateRowState(productId, (r) => {
      const updatedSerials = r.serials.map((s) => {
        if (s.serialNumber !== serialNumber) return s;

        if (action === "VERIFY_HERE") {
          const destId = targetBranchId || s.currentLocationId;
          return {
            ...s,
            currentLocationId: destId,
            status: "VERIFIED" as const,
          };
        }

        if (action === "MOVE_BRANCH" && targetBranchId) {
          return {
            ...s,
            currentLocationId: targetBranchId,
            status: "MOVED" as const,
            checkedOutBranches: [],
          };
        }

        if (action === "ASK_OTHER_BRANCHES") {
          return {
            ...s,
            status: "PENDING_BRANCH_CHECK" as const,
            checkedOutBranches: s.currentLocationId ? [s.currentLocationId] : [],
          };
        }

        if (action === "SEND_TO_DAMAGE_CLAIM") {
          return {
            ...s,
            currentLocationId: "DAMAGE_CLAIM",
            status: "DAMAGE_CLAIM" as const,
          };
        }

        if (action === "MARK_SOLD") {
          return {
            ...s,
            currentLocationId: "SOLD",
            status: "SOLD" as const,
          };
        }

        return s;
      });

      return { ...r, serials: updatedSerials };
    });
    setActiveSerialMenu(null);
  };

  // When another branch responds to a Pending Branch Check serial
  const handleBranchCheckResponse = (
    productId: string,
    serialNumber: string,
    respondingBranchId: string,
    foundAtThisBranch: boolean
  ) => {
    const branchObj = branches.find((b) => b._id === respondingBranchId);
    const branchLabel = branchObj?.code || "Branch";

    updateRowState(productId, (r) => {
      const updatedSerials = r.serials.map((s) => {
        if (s.serialNumber !== serialNumber) return s;

        if (foundAtThisBranch) {
          addToast(
            "success",
            `Serial ${serialNumber} shifted to ${branchLabel} (Avg Cost unchanged 🔒)`
          );
          return {
            ...s,
            currentLocationId: respondingBranchId,
            status: "VERIFIED" as const,
            checkedOutBranches: [],
          };
        } else {
          const nextCheckedOut = Array.from(
            new Set([...s.checkedOutBranches, respondingBranchId])
          );
          const allBranchIds = branches.map((b) => b._id);
          const allDenied = allBranchIds.every((id) => nextCheckedOut.includes(id));

          if (allDenied) {
            addToast(
              "info",
              `Serial ${serialNumber} kisi branch mein nahi mila -> Automatically moved to Damage & Claim! (Milne par wapas branch mein bhej sakte hain)`
            );
            return {
              ...s,
              currentLocationId: "DAMAGE_CLAIM",
              status: "DAMAGE_CLAIM" as const,
              checkedOutBranches: nextCheckedOut,
            };
          }

          addToast("info", `${branchLabel} marked "Nahi Hai" for ${serialNumber}`);
          return {
            ...s,
            checkedOutBranches: nextCheckedOut,
          };
        }
      });
      return { ...r, serials: updatedSerials };
    });
  };

  // Scan or type a barcode / SKU / serial number
  const handleQuickBarcodeOrSerialScan = (rawCode: string, specificProductId?: string) => {
    const code = rawCode.trim();
    if (!code) return;

    const targetBranch = focusBranchId || branches[0]?._id;
    const branchLabel = branches.find((b) => b._id === targetBranch)?.code || "Branch";

    for (const r of rows) {
      if (specificProductId && r.productId !== specificProductId) continue;
      const serialMatch = r.serials.find(
        (s) => s.serialNumber.toLowerCase() === code.toLowerCase()
      );
      if (serialMatch) {
        updateRowState(r.productId, (row) => ({
          ...row,
          serials: row.serials.map((s) =>
            s.serialNumber.toLowerCase() === code.toLowerCase()
              ? { ...s, currentLocationId: targetBranch, status: "VERIFIED" }
              : s
          ),
        }));
        setHighlightedProductId(r.productId);
        addToast(
          "success",
          `Serial ${serialMatch.serialNumber} (${r.name}) moved/verified in ${branchLabel} ✅`
        );
        return;
      }
    }

    if (specificProductId) {
      updateRowState(specificProductId, (row) => ({
        ...row,
        serials: [
          ...row.serials,
          {
            serialNumber: code.toUpperCase(),
            originalLocationId: targetBranch,
            currentLocationId: targetBranch,
            status: "VERIFIED",
            checkedOutBranches: [],
          },
        ],
      }));
      addToast("success", `Serial ${code.toUpperCase()} added & verified in ${branchLabel} ✅`);
      return;
    }

    setSearchQuery(code);
    setDebouncedSearch(code);
  };

  // Save row directly to MongoDB (with Auto Damage & Claim Pooling on Shortage + Locked Avg Cost)
  const saveRowToDatabase = async (productId: string) => {
    const targetRow = rows.find((r) => r.productId === productId) || editedRowsMap[productId];
    if (!targetRow) return;

    setSavingProductIds((prev) => ({ ...prev, [productId]: true }));
    try {
      const res = await fetch("/api/inventory/live-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SYNC_ROW",
          productId: targetRow.productId,
          condition: targetRow.condition,
          lockedAvgCost: targetRow.lockedAvgCost,
          serialTracking: targetRow.serialTracking,
          snapshotBranchQty: targetRow.systemBranchQty,
          physicalBranchQty: targetRow.physicalBranchQty,
          physicalDamageClaimQty: targetRow.physicalDamageClaimQty,
          serials: targetRow.serials,
        }),
      });
      const data = await res.json();

      if (!data.success) {
        addToast("error", data.error || "Failed to save to database.");
        return;
      }

      if (Array.isArray(data.posProtectedSerials) && data.posProtectedSerials.length > 0) {
        addToast(
          "info",
          `🛒 POS Guard: Serial (${data.posProtectedSerials.join(", ")}) abhi POS par bik chuka tha — usay Sold hi rakha gaya!`
        );
      }

      if (
        data.posProtectedBranchSales &&
        Object.keys(data.posProtectedBranchSales).length > 0
      ) {
        addToast(
          "info",
          `🛒 POS Guard: Counting ke dauran POS par bikne wale pieces khud minus kar ke save kiye gaye!`
        );
      }

      const newSysQty = data.systemBranchQty || targetRow.physicalBranchQty;
      const newClaimQty = data.systemDamageClaimQty ?? targetRow.physicalDamageClaimQty;

      updateRowState(productId, (r) => ({
        ...r,
        lockedAvgCost: data.lockedAvgCost ?? r.lockedAvgCost,
        systemBranchQty: newSysQty,
        physicalBranchQty: { ...newSysQty },
        systemDamageClaimQty: newClaimQty,
        physicalDamageClaimQty: newClaimQty,
        serials: data.serials || r.serials,
        rowVerified: true,
      }));

      addToast(
        "success",
        `"${targetRow.name}" Saved to DB! (Damage & Claim Pool: ${newClaimQty} pcs | Avg Cost Locked 🔒)`
      );
    } catch {
      addToast("error", "Network error while saving to database.");
    } finally {
      setSavingProductIds((prev) => ({ ...prev, [productId]: false }));
    }
  };

  // TWO-WAY RESTORE: Send Partial Qty OR Specific Serial from Damage & Claim -> Specific Branch in DB
  const handleRestoreFromDamageClaimToBranch = async (
    productId: string,
    targetBranchId: string,
    options: { transferQty?: number; specificSerialNumber?: string }
  ) => {
    const branchObj = branches.find((b) => b._id === targetBranchId);
    const branchCode = branchObj?.code || "Branch";

    setSavingProductIds((prev) => ({ ...prev, [productId]: true }));
    try {
      const res = await fetch("/api/inventory/live-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "RESTORE_FROM_DAMAGE_CLAIM",
          productId,
          targetBranchId,
          transferQty: options.transferQty,
          specificSerialNumber: options.specificSerialNumber,
        }),
      });
      const data = await res.json();

      if (!data.success) {
        addToast("error", data.error || "Failed to transfer from Damage & Claim.");
        return;
      }

      updateRowState(productId, (r) => ({
        ...r,
        lockedAvgCost: data.lockedAvgCost ?? r.lockedAvgCost,
        systemBranchQty: data.systemBranchQty,
        physicalBranchQty: { ...data.systemBranchQty },
        systemDamageClaimQty: data.systemDamageClaimQty,
        physicalDamageClaimQty: data.systemDamageClaimQty,
        serials: data.serials || r.serials,
        rowVerified: true,
      }));

      setActiveSerialMenu(null);
      if (options.specificSerialNumber) {
        addToast(
          "success",
          `Serial ${options.specificSerialNumber} Damage & Claim se ${branchCode} mein bhej diya gaya! (Avg Cost Locked 🔒)`
        );
      } else {
        addToast(
          "success",
          `${options.transferQty} pcs Damage & Claim se ${branchCode} mein shift ho gaye! (Avg Cost Locked 🔒)`
        );
      }
    } catch {
      addToast("error", "Network error while restoring from Damage & Claim.");
    } finally {
      setSavingProductIds((prev) => ({ ...prev, [productId]: false }));
    }
  };

  const isRowModified = (r: SyncRowItem) => {
    if (r.rowVerified) return true;
    if (r.serialTracking) {
      return r.serials.some((s) => s.status !== "UNCHECKED" && s.status !== "DAMAGE_CLAIM");
    }
    return branches.some(
      (b) => (r.physicalBranchQty[b._id] ?? 0) !== (r.systemBranchQty[b._id] ?? 0)
    );
  };

  const activeDataset = useMemo(() => {
    if (
      statusFilter === "MODIFIED" ||
      statusFilter === "BRANCH_CHECK" ||
      statusFilter === "VERIFIED"
    ) {
      const map = new Map<string, SyncRowItem>();
      for (const r of rows) map.set(r.productId, r);
      for (const [pid, r] of Object.entries(editedRowsMap)) map.set(pid, r);
      return Array.from(map.values());
    }
    return rows;
  }, [rows, editedRowsMap, statusFilter]);

  const pendingBranchCheckSerials = useMemo(() => {
    const map = new Map<string, SyncRowItem>();
    for (const r of rows) map.set(r.productId, r);
    for (const [pid, r] of Object.entries(editedRowsMap)) map.set(pid, r);

    const list: Array<{
      productId: string;
      productName: string;
      lockedAvgCost: number;
      serial: SerialItemState;
    }> = [];
    for (const r of map.values()) {
      for (const s of r.serials) {
        if (s.status === "PENDING_BRANCH_CHECK") {
          list.push({
            productId: r.productId,
            productName: r.name,
            lockedAvgCost: r.lockedAvgCost,
            serial: s,
          });
        }
      }
    }
    return list;
  }, [rows, editedRowsMap]);

  const filteredRows = useMemo(() => {
    return activeDataset
      .filter((r) => {
        if (statusFilter === "VERIFIED" && !r.rowVerified) return false;
        if (statusFilter === "MODIFIED" && !isRowModified(r)) return false;
        if (
          statusFilter === "BRANCH_CHECK" &&
          !r.serials.some((s) => s.status === "PENDING_BRANCH_CHECK")
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.productId === highlightedProductId) return -1;
        if (b.productId === highlightedProductId) return 1;
        return Number(a.rowVerified) - Number(b.rowVerified);
      });
  }, [activeDataset, statusFilter, highlightedProductId]);

  const stats = useMemo(() => {
    const allKnown = new Map<string, SyncRowItem>();
    for (const r of rows) allKnown.set(r.productId, r);
    for (const [pid, r] of Object.entries(editedRowsMap)) allKnown.set(pid, r);
    const list = Array.from(allKnown.values());

    const verifiedRows = list.filter((r) => r.rowVerified).length;
    const modifiedCount = list.filter((r) => isRowModified(r)).length;
    const pendingSerialChecks = pendingBranchCheckSerials.length;
    const totalInDamageClaim = list.reduce((acc, r) => {
      if (r.serialTracking) {
        return acc + r.serials.filter((s) => s.currentLocationId === "DAMAGE_CLAIM").length;
      }
      return acc + (r.systemDamageClaimQty || 0);
    }, 0);
    return { verifiedRows, modifiedCount, pendingSerialChecks, totalInDamageClaim };
  }, [rows, editedRowsMap, pendingBranchCheckSerials]);

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-md">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-100 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-400" />
              <span>All-Branch Live Stock Sync &amp; Two-Way Damage/Claim</span>
            </h1>
            <span className="px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 rounded-full">
              Live MongoDB Connected
            </span>
            <span className="px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-full flex items-center gap-1">
              <Lock className="w-3 h-3" />
              Avg Cost 100% Locked (Zero Dilution)
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Kam nikalne wala maal automatically <strong>Damage &amp; Claim</strong> mein jayega, aur jab mil jaye tou wahin se <strong>Partial Qty</strong> ya <strong>Specific Serial</strong> wapas kisi bhi branch mein bhej dein!
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => loadRealData()}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Reload DB</span>
          </button>
          <Link
            href="/inventory"
            className="px-3 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition-colors"
          >
            ← Back to Inventory
          </Link>
        </div>
      </div>

      {/* PROMINENT FULL-WIDTH BARCODE SCANNER & PRODUCT SEARCH BAR */}
      <div className="bg-slate-900 border-2 border-indigo-500/40 rounded-xl p-4 shadow-lg space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          <div className="relative flex-1">
            <Barcode className="absolute left-3.5 top-3.5 w-5 h-5 text-indigo-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && searchQuery.trim()) {
                  e.preventDefault();
                  handleQuickBarcodeOrSerialScan(searchQuery);
                }
              }}
              placeholder="🔍 Yahan Barcode Gun se Scan karein ya Product ka Naam / SKU / Model / Serial likhein (Press '/' anytime to focus)..."
              className="w-full pl-11 pr-28 py-3 bg-slate-950 border border-slate-700 focus:border-emerald-400 rounded-xl text-sm font-semibold text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
            />
            <div className="absolute right-2.5 top-2 flex items-center gap-1.5">
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setDebouncedSearch("");
                    setHighlightedProductId(null);
                    searchInputRef.current?.focus();
                  }}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setCameraScannerOpen(true)}
                className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
                title="Camera Barcode Scanner"
              >
                <Camera className="w-4 h-4" />
                <span className="hidden sm:inline">Scan</span>
              </button>
            </div>
          </div>

          {/* Active Branch Selector */}
          {branches.length > 0 && (
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-3.5 py-2.5 rounded-xl shrink-0">
              <span className="text-[11px] font-bold uppercase text-slate-400 whitespace-nowrap">
                Focus Branch:
              </span>
              <select
                value={focusBranchId}
                onChange={(e) => setFocusBranchId(e.target.value)}
                className="bg-transparent text-xs font-extrabold text-emerald-400 focus:outline-none cursor-pointer"
              >
                {branches.map((b) => (
                  <option key={b._id} value={b._id} className="bg-slate-900 text-slate-100">
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Secondary Filter Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-800/80 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {/* Category Filter Dropdown */}
            <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800">
              <span className="text-[10px] font-bold uppercase text-slate-400">Category:</span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-transparent text-xs font-extrabold text-indigo-300 focus:outline-none cursor-pointer"
              >
                <option value="" className="bg-slate-900 text-slate-100">
                  All Categories
                </option>
                {categories.map((cat) => (
                  <option key={cat._id} value={cat._id} className="bg-slate-900 text-slate-100">
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Hide 0 DB Stock Toggle */}
            <button
              type="button"
              onClick={() => setInStockOnly((prev) => !prev)}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer transition-colors ${
                inStockOnly
                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                  : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200"
              }`}
              title="0 stock wale khali products chupayein"
            >
              {inStockOnly ? "✅ Only In-Stock (>0 DB)" : "Show 0 Stock Also"}
            </button>

            {/* Tracking Filter */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
              {(
                [
                  { id: "ALL", label: "All Items" },
                  { id: "SERIAL", label: "Serialized" },
                  { id: "NON_SERIAL", label: "Non-Serial" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setTrackingFilter(tab.id)}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                    trackingFilter === tab.id
                      ? "bg-indigo-600 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Status / Damage & Claim Filter */}
            <div className="flex flex-wrap items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
              {(
                [
                  { id: "ALL", label: `All Products (${totalItems})` },
                  {
                    id: "DAMAGE_CLAIM",
                    label: `🛠️ Damage & Claim Pool (${stats.totalInDamageClaim})`,
                  },
                  { id: "MODIFIED", label: `Adjusted (${stats.modifiedCount})` },
                  { id: "BRANCH_CHECK", label: `Branch Check (${stats.pendingSerialChecks})` },
                  { id: "VERIFIED", label: `Saved ✅ (${stats.verifiedRows})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                    statusFilter === tab.id
                      ? tab.id === "DAMAGE_CLAIM"
                        ? "bg-amber-600 text-white"
                        : "bg-emerald-600 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold">
            <span className="text-slate-400">
              Showing <span className="text-slate-100">{filteredRows.length}</span> products
            </span>
          </div>
        </div>
      </div>

      {/* Pending Cross-Branch Verification Alert Queue */}
      {pendingBranchCheckSerials.length > 0 && (
        <div className="bg-amber-950/30 border border-amber-500/40 rounded-xl p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-amber-300">
                  Baqi Branches Se Confirmation Queue (Check in Other Branches / Warehouse)
                </h2>
                <p className="text-[11px] text-amber-200/80">
                  Jis branch par yeh serial mile wahan &quot;✅ Haan&quot; click karein. Agar sari branches &quot;✕ Nahi&quot; kar dengi tou yeh automatically <strong>Damage &amp; Claim</strong> mein chala jayega!
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {pendingBranchCheckSerials.map(({ productId, productName, lockedAvgCost, serial }) => (
              <div
                key={`${productId}-${serial.serialNumber}`}
                className="bg-slate-950/90 border border-amber-500/30 rounded-lg p-3 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="font-mono text-xs font-extrabold text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded border border-amber-500/30">
                      {serial.serialNumber}
                    </span>
                    <span className="ml-2 text-xs font-bold text-slate-200">{productName}</span>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Cost: Rs. {lockedAvgCost.toLocaleString()}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {branches.map((b) => {
                    const alreadySaidNo = serial.checkedOutBranches.includes(b._id);
                    return (
                      <div
                        key={b._id}
                        className={`flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-bold ${
                          alreadySaidNo
                            ? "bg-rose-950/40 border-rose-500/30 text-rose-400"
                            : "bg-slate-900 border-slate-700 text-slate-200"
                        }`}
                      >
                        <span>{b.code}:</span>
                        {alreadySaidNo ? (
                          <span className="text-rose-400">✕ Nahi</span>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                handleBranchCheckResponse(
                                  productId,
                                  serial.serialNumber,
                                  b._id,
                                  true
                                )
                              }
                              className="px-1.5 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded cursor-pointer"
                            >
                              ✅ Haan
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleBranchCheckResponse(
                                  productId,
                                  serial.serialNumber,
                                  b._id,
                                  false
                                )
                              }
                              className="px-1.5 py-0.5 bg-rose-600/80 hover:bg-rose-500 text-white rounded cursor-pointer"
                            >
                              ✕ Nahi
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() =>
                      handleSerialAction(
                        productId,
                        serial.serialNumber,
                        "SEND_TO_DAMAGE_CLAIM"
                      )
                    }
                    className="ml-auto px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-[10px] font-extrabold cursor-pointer"
                  >
                    🛠️ Move to Damage &amp; Claim
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold rounded-xl flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* UNIFIED TABLE WITH TWO-WAY DAMAGE & CLAIM COLUMN */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400 animate-pulse">
            Loading real DB products, branches, Damage &amp; Claim pool &amp; average cost...
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Layers className="w-10 h-10 text-slate-600 mx-auto" />
            <p className="text-sm font-bold text-slate-200">Koi Product Nahi Mila</p>
            <p className="text-xs text-slate-400">
              Dusra keyword search karein ya filter tab badlein.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse min-w-[1120px]">
                <thead>
                  <tr className="bg-slate-950 border-b border-slate-800 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                    <th className="p-3.5 w-60">Product (Serial &amp; Non-Serial)</th>
                    <th className="p-3.5 text-center w-32 bg-emerald-950/20 border-x border-slate-800/80">
                      Avg Cost (🔒)
                    </th>
                    {branches.map((b) => {
                      const isFocus = b._id === focusBranchId;
                      return (
                        <th
                          key={b._id}
                          className={`p-3.5 text-center border-r border-slate-800/80 ${
                            isFocus ? "bg-indigo-950/40 text-indigo-300" : ""
                          }`}
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span>{b.code}</span>
                            {isFocus && (
                              <span className="px-1.5 py-0.2 text-[9px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 rounded">
                                Focus
                              </span>
                            )}
                          </div>
                          <div className="text-[9px] font-medium text-slate-500 normal-case">
                            {b.name}
                          </div>
                        </th>
                      );
                    })}
                    {/* DEDICATED TWO-WAY DAMAGE & CLAIM COLUMN */}
                    <th className="p-3.5 text-center w-64 bg-amber-950/30 border-r border-amber-500/30 text-amber-300">
                      <div className="flex items-center justify-center gap-1.5">
                        <Wrench className="w-3.5 h-3.5 text-amber-400" />
                        <span>Damage &amp; Claim (Two-Way)</span>
                      </div>
                      <div className="text-[9px] font-medium text-amber-200/70 normal-case">
                        Shortage In ↔ Send Partial/Serial to Branch
                      </div>
                    </th>
                    <th className="p-3.5 text-right w-32">Verify &amp; Save</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-800">
                  {filteredRows.map((row) => {
                    const sysTotal = branches.reduce(
                      (sum, b) => sum + (row.systemBranchQty[b._id] || 0),
                      0
                    );
                    const physTotal = row.serialTracking
                      ? row.serials.filter(
                          (s) =>
                            s.status !== "SOLD" && s.currentLocationId !== "DAMAGE_CLAIM"
                        ).length
                      : branches.reduce(
                          (sum, b) => sum + (row.physicalBranchQty[b._id] || 0),
                          0
                        );

                    // Any shortage across branches automatically previews as incoming to Damage & Claim
                    const incomingShortage = !row.serialTracking
                      ? Math.max(0, sysTotal - physTotal)
                      : 0;
                    const totalDamageClaimNonSerial =
                      (row.physicalDamageClaimQty ?? row.systemDamageClaimQty ?? 0) +
                      incomingShortage;

                    const damageClaimSerials = row.serials.filter(
                      (s) =>
                        s.currentLocationId === "DAMAGE_CLAIM" ||
                        s.status === "DAMAGE_CLAIM"
                    );

                    const restoreCfg = restoreInputs[row.productId] || {
                      qty: 1,
                      branchId: focusBranchId || branches[0]?._id || "",
                    };

                    const isHighlighted = row.productId === highlightedProductId;

                    return (
                      <tr
                        key={row.productId}
                        className={`transition-colors ${
                          isHighlighted
                            ? "bg-indigo-950/30 ring-1 ring-inset ring-indigo-500/50"
                            : row.rowVerified
                            ? "bg-emerald-950/15 hover:bg-emerald-950/25"
                            : "hover:bg-slate-850/60"
                        }`}
                      >
                        {/* 1. Product Info */}
                        <td className="p-3.5 align-top space-y-1">
                          <div className="font-bold text-slate-100 leading-snug">{row.name}</div>
                          {row.brand && (
                            <div className="text-[11px] text-indigo-300 font-semibold">
                              {row.brand}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400 font-semibold">
                            <span>SKU: {row.sku}</span>
                            {row.barcode && <span>• BC: {row.barcode}</span>}
                            <span className="px-1.5 py-0.2 bg-slate-800 text-slate-300 rounded border border-slate-700">
                              {row.condition}
                            </span>
                            {row.serialTracking ? (
                              <span className="px-1.5 py-0.2 bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 rounded font-bold uppercase">
                                Serial ({row.serials.length})
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded font-bold uppercase">
                                Non-Serial
                              </span>
                            )}
                          </div>

                          {row.serialTracking && (
                            <div className="pt-1.5 flex items-center gap-1">
                              <input
                                type="text"
                                value={newSerialInputs[row.productId] || ""}
                                onChange={(e) =>
                                  setNewSerialInputs((prev) => ({
                                    ...prev,
                                    [row.productId]: e.target.value,
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    const val = newSerialInputs[row.productId] || "";
                                    if (val.trim()) {
                                      handleQuickBarcodeOrSerialScan(val, row.productId);
                                      setNewSerialInputs((prev) => ({
                                        ...prev,
                                        [row.productId]: "",
                                      }));
                                    }
                                  }
                                }}
                                placeholder="+ Scan/Add Serial..."
                                className="w-full px-2 py-1 bg-slate-950 border border-slate-800 rounded text-[10px] text-slate-200 focus:outline-none focus:border-indigo-500"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const val = newSerialInputs[row.productId] || "";
                                  if (val.trim()) {
                                    handleQuickBarcodeOrSerialScan(val, row.productId);
                                    setNewSerialInputs((prev) => ({
                                      ...prev,
                                      [row.productId]: "",
                                    }));
                                  }
                                }}
                                className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-bold cursor-pointer shrink-0"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          )}

                          {/* Live POS Sold Serials Notice */}
                          {livePosSalesMap[row.productId]?.serials?.length ? (
                            <div className="mt-1 px-2 py-1 rounded bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold text-emerald-300">
                              🛒 POS Sold Auto-Removed: {livePosSalesMap[row.productId].serials.join(", ")}
                            </div>
                          ) : null}
                        </td>

                        {/* 2. Locked Real Average Cost Column */}
                        <td className="p-3.5 align-top text-center bg-emerald-950/10 border-x border-slate-800/80">
                          <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 font-mono font-extrabold text-xs">
                            <Lock className="w-3 h-3 text-emerald-400 shrink-0" />
                            <span>
                              {row.lockedAvgCost > 0
                                ? `Rs. ${row.lockedAvgCost.toLocaleString()}`
                                : "Not Set"}
                            </span>
                          </div>
                          <div className="text-[9px] text-emerald-400/80 font-semibold mt-1">
                            No Dilution 🔒
                          </div>
                        </td>

                        {/* 3. Real Branch Columns Side-by-Side */}
                        {branches.map((b) => {
                          const isFocus = b._id === focusBranchId;

                          if (!row.serialTracking) {
                            const sysQ = row.systemBranchQty[b._id] || 0;
                            const physQ = row.physicalBranchQty[b._id] ?? sysQ;
                            const cellChanged = physQ !== sysQ;

                            return (
                              <td
                                key={b._id}
                                className={`p-3 align-top border-r border-slate-800/80 ${
                                  isFocus ? "bg-indigo-950/15" : ""
                                }`}
                              >
                                <div className="flex flex-col items-center gap-1.5">
                                  <div className="text-[10px] text-slate-400 font-semibold">
                                    DB Stock:{" "}
                                    <span
                                      className={`font-extrabold ${
                                        sysQ > 0 ? "text-emerald-400 text-xs" : "text-slate-400"
                                      }`}
                                    >
                                      {sysQ}
                                    </span>
                                  </div>

                                  {livePosSalesMap[row.productId]?.branchQty?.[b._id] ? (
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-[9px] font-extrabold text-emerald-300">
                                      🛒 -{livePosSalesMap[row.productId].branchQty[b._id]} Sold on POS
                                    </span>
                                  ) : null}

                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateNonSerialQty(row.productId, b._id, physQ - 1)
                                      }
                                      className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold flex items-center justify-center cursor-pointer border border-slate-700"
                                    >
                                      -
                                    </button>
                                    <input
                                      type="number"
                                      min={0}
                                      value={physQ}
                                      onChange={(e) =>
                                        updateNonSerialQty(
                                          row.productId,
                                          b._id,
                                          parseInt(e.target.value, 10)
                                        )
                                      }
                                      className={`w-14 text-center py-1 rounded font-mono text-xs font-extrabold border focus:outline-none ${
                                        cellChanged
                                          ? "bg-amber-500/15 border-amber-500/50 text-amber-300"
                                          : "bg-slate-950 border-slate-800 text-slate-100"
                                      }`}
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateNonSerialQty(row.productId, b._id, physQ + 1)
                                      }
                                      className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold flex items-center justify-center cursor-pointer border border-slate-700"
                                    >
                                      +
                                    </button>
                                  </div>

                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        zeroOutBranchQty(row.productId, b._id, b.code)
                                      }
                                      className="px-1.5 py-0.5 text-[9px] font-bold bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 rounded cursor-pointer"
                                    >
                                      0 Karo
                                    </button>
                                    {cellChanged && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updateNonSerialQty(row.productId, b._id, sysQ)
                                        }
                                        className="p-0.5 text-slate-400 hover:text-slate-200 cursor-pointer"
                                        title="Reset to DB qty"
                                      >
                                        <RotateCcw className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </td>
                            );
                          }

                          // SERIALIZED CELL: Real Serial Numbers in this branch
                          const branchSerials = row.serials.filter(
                            (s) =>
                              s.currentLocationId === b._id &&
                              s.status !== "SOLD" &&
                              s.status !== "DAMAGE_CLAIM"
                          );

                          return (
                            <td
                              key={b._id}
                              className={`p-3 align-top border-r border-slate-800/80 ${
                                isFocus ? "bg-indigo-950/15" : ""
                              }`}
                            >
                              <div className="space-y-1.5 min-w-[135px]">
                                <div className="flex items-center justify-between text-[10px] text-slate-400">
                                  <span>DB: {row.systemBranchQty[b._id] || 0}</span>
                                  <span className="font-extrabold text-slate-200">
                                    Now: {branchSerials.length}
                                  </span>
                                </div>

                                {branchSerials.some((s) => s.status === "UNCHECKED") && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      moveUncheckedBranchSerialsToClaim(
                                        row.productId,
                                        b._id,
                                        b.code
                                      )
                                    }
                                    className="w-full py-0.5 px-1.5 rounded bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-[9px] font-bold text-amber-300 cursor-pointer"
                                    title="Jo serial samne nahi mile (Unchecked hain) unko 1-click mein Damage & Claim bhejein"
                                  >
                                    Unchecked → Claim
                                  </button>
                                )}

                                {branchSerials.length === 0 ? (
                                  <div className="text-[10px] text-slate-600 italic py-1 text-center">
                                    0 serials
                                  </div>
                                ) : (
                                  <div className="flex flex-col gap-1 max-h-44 overflow-y-auto pr-0.5">
                                    {branchSerials.map((s) => {
                                      const isMenuOpen =
                                        activeSerialMenu?.productId === row.productId &&
                                        activeSerialMenu?.serialNumber === s.serialNumber;

                                      const badgeStyle =
                                        s.status === "VERIFIED"
                                          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                                          : s.status === "MOVED"
                                          ? "bg-indigo-500/15 border-indigo-500/40 text-indigo-300"
                                          : s.status === "PENDING_BRANCH_CHECK"
                                          ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                                          : "bg-slate-950 border-slate-800 text-slate-200 hover:border-slate-600";

                                      return (
                                        <div key={s.serialNumber} className="relative">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setActiveSerialMenu(
                                                isMenuOpen
                                                  ? null
                                                  : {
                                                      productId: row.productId,
                                                      serialNumber: s.serialNumber,
                                                    }
                                              )
                                            }
                                            className={`w-full px-2 py-1 rounded border text-[10px] font-mono font-bold flex items-center justify-between gap-1 cursor-pointer transition-colors ${badgeStyle}`}
                                          >
                                            <span className="truncate">{s.serialNumber}</span>
                                            {s.status === "VERIFIED" && (
                                              <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                                            )}
                                            {s.status === "MOVED" && (
                                              <ArrowRightLeft className="w-3 h-3 text-indigo-400 shrink-0" />
                                            )}
                                            {s.status === "PENDING_BRANCH_CHECK" && (
                                              <HelpCircle className="w-3 h-3 text-amber-400 shrink-0" />
                                            )}
                                          </button>

                                          {isMenuOpen && (
                                            <div className="mt-1 p-2 bg-slate-950 border border-slate-700 rounded-lg shadow-2xl space-y-1.5 z-30 text-[10px]">
                                              <div className="font-bold text-slate-300 border-b border-slate-800 pb-1 flex items-center justify-between">
                                                <span>{s.serialNumber}</span>
                                                <button
                                                  type="button"
                                                  onClick={() => setActiveSerialMenu(null)}
                                                  className="text-slate-400 hover:text-white cursor-pointer"
                                                >
                                                  <X className="w-3 h-3" />
                                                </button>
                                              </div>

                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleSerialAction(
                                                    row.productId,
                                                    s.serialNumber,
                                                    "VERIFY_HERE",
                                                    b._id
                                                  )
                                                }
                                                className="w-full text-left px-2 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 font-bold cursor-pointer block"
                                              >
                                                ✅ {b.code} mein Mojood Hai
                                              </button>

                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleSerialAction(
                                                    row.productId,
                                                    s.serialNumber,
                                                    "SEND_TO_DAMAGE_CLAIM"
                                                  )
                                                }
                                                className="w-full text-left px-2 py-1 rounded bg-amber-500/25 hover:bg-amber-500/35 text-amber-300 font-bold cursor-pointer block"
                                              >
                                                🛠️ Move to Damage &amp; Claim
                                              </button>

                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleSerialAction(
                                                    row.productId,
                                                    s.serialNumber,
                                                    "ASK_OTHER_BRANCHES"
                                                  )
                                                }
                                                className="w-full text-left px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold cursor-pointer block"
                                              >
                                                ⏳ Baqi Branch mein Check Karo
                                              </button>

                                              <div className="pt-1 border-t border-slate-800">
                                                <span className="text-[9px] text-slate-400 block mb-1">
                                                  Seedha Dusri Branch Shift Karein:
                                                </span>
                                                <div className="flex flex-wrap gap-1">
                                                  {branches
                                                    .filter((other) => other._id !== b._id)
                                                    .map((other) => (
                                                      <button
                                                        key={other._id}
                                                        type="button"
                                                        onClick={() =>
                                                          handleSerialAction(
                                                            row.productId,
                                                            s.serialNumber,
                                                            "MOVE_BRANCH",
                                                            other._id
                                                          )
                                                        }
                                                        className="px-1.5 py-0.5 rounded bg-indigo-600/25 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 font-bold cursor-pointer"
                                                      >
                                                        ➡️ {other.code}
                                                      </button>
                                                    ))}
                                                </div>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })}

                        {/* 4. TWO-WAY DAMAGE & CLAIM COLUMN (Incoming Shortage + Outgoing Partial/Specific Serial to Branch) */}
                        <td className="p-3 align-top bg-amber-950/10 border-r border-amber-500/20">
                          {!row.serialTracking ? (
                            <div className="space-y-2">
                              {/* Current + Incoming Shortage */}
                              <div className="flex items-center justify-between text-[10px]">
                                <span className="text-amber-300/80 font-semibold">
                                  In Damage/Claim:
                                </span>
                                <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono font-extrabold text-xs">
                                  {totalDamageClaimNonSerial} pcs
                                </span>
                              </div>

                              {incomingShortage > 0 && (
                                <div className="text-[10px] px-2 py-1 rounded bg-rose-500/15 border border-rose-500/30 text-rose-300 font-bold">
                                  +{incomingShortage} kam nikle → Auto जाने वाले हैं Damage &amp; Claim mein (Click Verify &amp; Save)
                                </div>
                              )}

                              {/* Outgoing Partial/Full Transfer from Damage & Claim -> Specific Branch */}
                              {(row.systemDamageClaimQty || 0) > 0 && (
                                <div className="p-2 bg-slate-950/90 border border-amber-500/30 rounded-lg space-y-1.5">
                                  <div className="text-[9px] font-bold uppercase text-amber-300 flex items-center justify-between">
                                    <span>Send Back to Branch:</span>
                                    <span>Avail: {row.systemDamageClaimQty}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      min={1}
                                      max={row.systemDamageClaimQty}
                                      value={restoreCfg.qty}
                                      onChange={(e) =>
                                        setRestoreInputs((prev) => ({
                                          ...prev,
                                          [row.productId]: {
                                            ...restoreCfg,
                                            qty: Math.max(
                                              1,
                                              Math.min(
                                                row.systemDamageClaimQty,
                                                parseInt(e.target.value, 10) || 1
                                              )
                                            ),
                                          },
                                        }))
                                      }
                                      className="w-12 text-center py-1 bg-slate-900 border border-slate-700 rounded text-xs font-mono font-bold text-slate-100"
                                      title="Partial or full qty to send"
                                    />
                                    <select
                                      value={restoreCfg.branchId}
                                      onChange={(e) =>
                                        setRestoreInputs((prev) => ({
                                          ...prev,
                                          [row.productId]: {
                                            ...restoreCfg,
                                            branchId: e.target.value,
                                          },
                                        }))
                                      }
                                      className="flex-1 py-1 px-1.5 bg-slate-900 border border-slate-700 rounded text-[10px] font-bold text-emerald-300 focus:outline-none cursor-pointer"
                                    >
                                      {branches.map((b) => (
                                        <option key={b._id} value={b._id}>
                                          → {b.code}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      disabled={Boolean(savingProductIds[row.productId])}
                                      onClick={() =>
                                        handleRestoreFromDamageClaimToBranch(
                                          row.productId,
                                          restoreCfg.branchId || branches[0]?._id,
                                          { transferQty: restoreCfg.qty }
                                        )
                                      }
                                      className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-extrabold flex items-center gap-1 cursor-pointer shrink-0"
                                      title="Send partial/full qty to selected branch (Avg Cost Locked)"
                                    >
                                      <Send className="w-3 h-3" />
                                      <span>Bhejo</span>
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            /* SERIALIZED TWO-WAY DAMAGE & CLAIM CELL */
                            <div className="space-y-1.5 min-w-[175px]">
                              <div className="flex items-center justify-between text-[10px]">
                                <span className="text-amber-300/80 font-semibold">
                                  In Damage/Claim:
                                </span>
                                <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono font-extrabold">
                                  {damageClaimSerials.length} Serials
                                </span>
                              </div>

                              {damageClaimSerials.length === 0 ? (
                                <div className="text-[10px] text-slate-500 italic py-1 text-center">
                                  0 serials in Damage &amp; Claim
                                </div>
                              ) : (
                                <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-0.5">
                                  {damageClaimSerials.map((s) => {
                                    const isClaimMenuOpen =
                                      activeSerialMenu?.productId === row.productId &&
                                      activeSerialMenu?.serialNumber === s.serialNumber;

                                    return (
                                      <div
                                        key={s.serialNumber}
                                        className="p-1.5 rounded bg-slate-950/90 border border-amber-500/40 space-y-1"
                                      >
                                        <div className="flex items-center justify-between gap-1">
                                          <span className="font-mono text-[10px] font-extrabold text-amber-300 truncate">
                                            {s.serialNumber}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setActiveSerialMenu(
                                                isClaimMenuOpen
                                                  ? null
                                                  : {
                                                      productId: row.productId,
                                                      serialNumber: s.serialNumber,
                                                    }
                                              )
                                            }
                                            className="px-1.5 py-0.5 rounded bg-emerald-600/25 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold cursor-pointer shrink-0"
                                          >
                                            ➡️ Send to Branch
                                          </button>
                                        </div>

                                        {isClaimMenuOpen && (
                                          <div className="pt-1 border-t border-slate-800 space-y-1">
                                            <span className="text-[9px] text-slate-400 block">
                                              Kis Branch mein wapas bhejna hai?
                                            </span>
                                            <div className="flex flex-wrap gap-1">
                                              {branches.map((b) => (
                                                <button
                                                  key={b._id}
                                                  type="button"
                                                  onClick={() =>
                                                    handleRestoreFromDamageClaimToBranch(
                                                      row.productId,
                                                      b._id,
                                                      {
                                                        specificSerialNumber:
                                                          s.serialNumber,
                                                      }
                                                    )
                                                  }
                                                  className="px-1.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-extrabold cursor-pointer"
                                                >
                                                  → {b.code}
                                                </button>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </td>

                        {/* 5. Row Verify & Save to DB Action */}
                        <td className="p-3.5 align-top text-right">
                          <button
                            type="button"
                            disabled={Boolean(savingProductIds[row.productId])}
                            onClick={() => saveRowToDatabase(row.productId)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50 ${
                              row.rowVerified
                                ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-900/40"
                                : "bg-indigo-600 hover:bg-emerald-600 text-white border border-indigo-500"
                            }`}
                          >
                            {savingProductIds[row.productId] ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            <span>
                              {savingProductIds[row.productId]
                                ? "Saving..."
                                : row.rowVerified
                                ? "Saved ✅"
                                : "Verify & Save"}
                            </span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {(statusFilter === "ALL" || statusFilter === "DAMAGE_CLAIM") && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalItems}
                itemsPerPage={itemsPerPage}
                onPageChange={(p) => setCurrentPage(p)}
                onItemsPerPageChange={(l) => {
                  setItemsPerPage(l);
                  setCurrentPage(1);
                }}
                itemLabel="real DB products"
              />
            )}
          </>
        )}
      </div>

      {cameraScannerOpen && (
        <CameraBarcodeScannerModal
          isOpen={cameraScannerOpen}
          onClose={() => setCameraScannerOpen(false)}
          onScanSuccess={(code) => {
            handleQuickBarcodeOrSerialScan(code);
            setCameraScannerOpen(false);
          }}
        />
      )}

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
