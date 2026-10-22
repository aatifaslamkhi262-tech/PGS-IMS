"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  CheckSquare,
  Barcode,
  Camera,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Layers,
  ArrowRight,
  Search,
  Trash2,
  Building2,
  ShieldAlert,
  Clock,
  Plus,
  ArrowRightLeft,
  X,
  FileCheck,
  TrendingDown,
  TrendingUp,
  HelpCircle,
  Check,
} from "lucide-react";
import { CameraBarcodeScannerModal } from "@/components/CameraBarcodeScannerModal";
import { ToastContainer, ToastMessage } from "@/components/Toast";

type AuditTab = "SERIALIZED" | "NON_SERIALIZED" | "SUMMARY" | "HISTORY";

export default function StockAuditPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<AuditTab>("SERIALIZED");

  // Audit data loaded from DB
  const [loadingAuditData, setLoadingAuditData] = useState(false);
  const [inventoryList, setInventoryList] = useState<any[]>([]);
  const [localAvailableSerials, setLocalAvailableSerials] = useState<any[]>([]);
  const [productList, setProductList] = useState<any[]>([]);

  // Physical shelf scanning state
  const [scannedSerials, setScannedSerials] = useState<string[]>([]);
  const [serialScanInput, setSerialScanInput] = useState<string>("");
  const [serialVerificationMap, setSerialVerificationMap] = useState<Record<string, any>>({});
  const [verifyingSerial, setVerifyingSerial] = useState(false);
  const [cameraScannerOpen, setCameraScannerOpen] = useState(false);

  // Cross-branch resolution action: "TRANSFER_TO_DESTINATION" | "RETURN_TO_ORIGIN"
  const [crossBranchResolutions, setCrossBranchResolutions] = useState<
    Record<string, "TRANSFER_TO_DESTINATION" | "RETURN_TO_ORIGIN">
  >({});

  const setResolutionForSerial = (sn: string, action: "TRANSFER_TO_DESTINATION" | "RETURN_TO_ORIGIN") => {
    setCrossBranchResolutions((prev) => ({
      ...prev,
      [sn]: action,
    }));
  };

  // Unregistered serial mapping state
  const [unregisteredMappings, setUnregisteredMappings] = useState<
    Array<{ serialNumber: string; productId: string; condition?: string }>
  >([]);

  // Non-serialized physical counts: { [productId_condition]: physicalQty }
  const [physicalCounts, setPhysicalCounts] = useState<Record<string, number>>({});
  const [nonSerializedSearch, setNonSerializedSearch] = useState<string>("");
  const [tab1ShelfSearch, setTab1ShelfSearch] = useState<string>("");
  const [nonSerializedFilter, setNonSerializedFilter] = useState<"ALL" | "DISCREPANCIES" | "SHORTAGE" | "SURPLUS">("ALL");

  // Submitting / Draft / Reconciling state
  const [submittingAudit, setSubmittingAudit] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [draftNumber, setDraftNumber] = useState<string | null>(null);
  const [lastSavedNotice, setLastSavedNotice] = useState<string | null>(null);
  const [auditNotes, setAuditNotes] = useState("");
  const [auditScope, setAuditScope] = useState<"ALL" | "SERIALIZED_ONLY" | "NON_SERIALIZED_ONLY">("ALL");
  const [pastAudits, setPastAudits] = useState<any[]>([]);
  const [loadingPastAudits, setLoadingPastAudits] = useState(false);

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const addToast = (type: "success" | "error" | "info", text: string) => {
    setToasts((prev) => [...prev, { id: Date.now().toString(), type, text }]);
  };
  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const loadedLocationIdRef = useRef<string>("");

  // Load session, locations & products
  useEffect(() => {
    const init = async () => {
      try {
        const [meRes, locRes, prodRes] = await Promise.all([
          fetch("/api/auth/me").then((r) => r.json()),
          fetch("/api/locations").then((r) => r.json()),
          fetch("/api/products?limit=250").then((r) => r.json()).catch(() => ({ success: false })),
        ]);

        if (meRes.success) setCurrentUser(meRes.data);
        if (locRes.success && locRes.data.length > 0) {
          setLocations(locRes.data);
          setSelectedLocationId(locRes.data[0]._id);
        }
        if (prodRes && prodRes.success) {
          setProductList(prodRes.data?.products || prodRes.data || []);
        }
      } catch (err) {
        console.error("Failed to load initial data", err);
      }
    };
    init();
  }, []);

  // Fetch location inventory and serials when location changes
  const fetchAuditData = async (locId: string) => {
    if (!locId) return;
    try {
      setLoadingAuditData(true);
      loadedLocationIdRef.current = "";
      setScannedSerials([]);
      setSerialVerificationMap({});
      setUnregisteredMappings([]);
      setCurrentDraftId(null);
      setDraftNumber(null);
      setLastSavedNotice(null);
      setPhysicalCounts({});

      const res = await fetch(`/api/inventory/audit?locationId=${locId}`);
      const data = await res.json();
      if (data.success) {
        setInventoryList(data.data.inventory || []);
        setLocalAvailableSerials(data.data.localAvailableSerials || []);

        // Initialize non-serialized counts with current system quantities
        const initCounts: Record<string, number> = {};
        for (const item of data.data.inventory || []) {
          const key = `${item.product?._id}_${item.condition || "New"}`;
          initCounts[key] = item.quantity;
        }

        // Check if there is a local draft or DB draft to restore
        let restored = false;
        if (typeof window !== "undefined") {
          try {
            // Clean up any legacy contaminated v1 storage keys
            localStorage.removeItem(`stock_audit_draft_${locId}`);

            const rawLocal = localStorage.getItem(`stock_audit_draft_v2_${locId}`);
            if (rawLocal) {
              const parsed = JSON.parse(rawLocal);
              // STRICT: Only restore if locationId matches this branch exactly
              if (parsed && parsed.locationId === locId) {
                // Discard stale draftId if DB doesn't have an active draft for this branch
                if (parsed.currentDraftId && !data.data.activeDraft) {
                  parsed.currentDraftId = null;
                  parsed.draftNumber = null;
                }

                const hasScannedSerials = Array.isArray(parsed.scannedSerials) && parsed.scannedSerials.length > 0;
                const hasPhysicalCounts = parsed.physicalCounts && Object.keys(parsed.physicalCounts).length > 0;
                if (hasScannedSerials || hasPhysicalCounts || parsed.currentDraftId) {
                  const dbDraft = data.data.activeDraft;
                  const localSavedTime = parsed.savedAt ? new Date(parsed.savedAt).getTime() : 0;
                  const dbUpdatedTime = dbDraft?.updatedAt ? new Date(dbDraft.updatedAt).getTime() : 0;

                  if (dbDraft && dbUpdatedTime > localSavedTime) {
                    restored = false;
                  } else {
                    setScannedSerials(parsed.scannedSerials || []);
                    if (parsed.serialVerificationMap) setSerialVerificationMap(parsed.serialVerificationMap);
                    if (parsed.unregisteredMappings) setUnregisteredMappings(parsed.unregisteredMappings);
                    if (parsed.crossBranchResolutions) setCrossBranchResolutions(parsed.crossBranchResolutions);
                    if (parsed.auditScope) setAuditScope(parsed.auditScope);

                    // Sanitize physical counts: only accept counts for products present at this location
                    const sanitizedCounts: Record<string, number> = { ...initCounts };
                    if (parsed.physicalCounts) {
                      for (const k of Object.keys(initCounts)) {
                        if (parsed.physicalCounts[k] !== undefined) {
                          sanitizedCounts[k] = parsed.physicalCounts[k];
                        }
                      }
                    }
                    setPhysicalCounts(sanitizedCounts);
                    if (parsed.auditNotes) setAuditNotes(parsed.auditNotes);
                    if (parsed.currentDraftId) setCurrentDraftId(parsed.currentDraftId);
                    if (parsed.draftNumber) setDraftNumber(parsed.draftNumber);
                    setLastSavedNotice(
                      `Active draft restored (${(parsed.scannedSerials || []).length} boxes scanned). Progress is saved!`
                    );
                    restored = true;
                  }
                }
              }
            }
          } catch {
            // ignore parse error
          }
        }

        // If not restored from localStorage, check if activeDraft came from DB
        if (!restored && data.data.activeDraft) {
          const draft = data.data.activeDraft;
          setScannedSerials(draft.scannedSerials || []);
          setCurrentDraftId(draft._id);
          setDraftNumber(draft.auditNumber);
          setAuditNotes(draft.notes || "");
          if (draft.auditScope) setAuditScope(draft.auditScope);
          const vMap: Record<string, any> = {};
          for (const sn of draft.scannedSerials || []) {
            vMap[sn] = { type: "MATCHED_LOCAL", serialNumber: sn };
          }
          setSerialVerificationMap(vMap);

          // Restore cross branch resolutions
          if (Array.isArray(draft.crossBranchSerials)) {
            const cbRes: Record<string, "TRANSFER_TO_DESTINATION" | "RETURN_TO_ORIGIN"> = {};
            for (const cb of draft.crossBranchSerials) {
              if (cb.serialNumber && cb.resolutionAction) {
                cbRes[cb.serialNumber] = cb.resolutionAction;
              }
            }
            setCrossBranchResolutions(cbRes);
          }

          // Restore physical counts from DB draft itemVariances
          const draftCounts: Record<string, number> = { ...initCounts };
          if (Array.isArray(draft.itemVariances)) {
            for (const iv of draft.itemVariances) {
              const pId = iv.product?._id || iv.product;
              if (pId) {
                const key = `${pId.toString()}_${iv.condition || "New"}`;
                if (draftCounts[key] !== undefined) {
                  draftCounts[key] = iv.physicalQuantity;
                }
              }
            }
          }
          setPhysicalCounts(draftCounts);
          setLastSavedNotice(`Draft #${draft.auditNumber} loaded from database.`);
          restored = true;
        }

        if (!restored) {
          setScannedSerials([]);
          setSerialVerificationMap({});
          setUnregisteredMappings([]);
          setCrossBranchResolutions({});
          setCurrentDraftId(null);
          setDraftNumber(null);
          setLastSavedNotice(null);
          setAuditScope("ALL");
          setPhysicalCounts(initCounts);
        }

        // Mark this location as safely and cleanly loaded!
        loadedLocationIdRef.current = locId;
      } else {
        addToast("error", data.error || "Failed to load location inventory");
      }
    } catch {
      addToast("error", "Network error while loading inventory data");
    } finally {
      setLoadingAuditData(false);
    }
  };

  useEffect(() => {
    if (selectedLocationId) {
      fetchAuditData(selectedLocationId);
    }
  }, [selectedLocationId]);

  // Auto-save to localStorage whenever user scans or changes counts
  // PREVENTS CROSS-BRANCH POLLUTION: Only saves if loadedLocationIdRef matches selectedLocationId!
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      selectedLocationId &&
      loadedLocationIdRef.current === selectedLocationId &&
      (scannedSerials.length > 0 || currentDraftId || Object.keys(physicalCounts).length > 0)
    ) {
      try {
        localStorage.setItem(
          `stock_audit_draft_v2_${selectedLocationId}`,
          JSON.stringify({
            locationId: selectedLocationId,
            scannedSerials,
            serialVerificationMap,
            unregisteredMappings,
            crossBranchResolutions,
            physicalCounts,
            auditScope,
            auditNotes,
            currentDraftId,
            draftNumber,
            savedAt: new Date().toISOString(),
          })
        );
      } catch {
        // quota or storage error
      }
    }
  }, [
    scannedSerials,
    serialVerificationMap,
    unregisteredMappings,
    crossBranchResolutions,
    physicalCounts,
    auditScope,
    auditNotes,
    selectedLocationId,
    currentDraftId,
    draftNumber,
  ]);

  // Explicit Save Draft to Database
  const handleSaveDraft = async () => {
    if (!selectedLocationId) return;
    try {
      setSavingDraft(true);
      const physicalCountsPayload = nonSerializedVariances.map((v) => ({
        productId: v.product?._id,
        condition: v.condition,
        physicalQuantity: v.physicalQuantity,
      }));

      const res = await fetch("/api/inventory/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId: selectedLocationId,
          auditId: currentDraftId,
          scannedSerials,
          physicalCounts: physicalCountsPayload,
          unregisteredSerialMappings: unregisteredMappings,
          crossBranchResolutions,
          auditScope,
          action: "SAVE_DRAFT",
          notes: auditNotes,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setCurrentDraftId(data.data._id);
        setDraftNumber(data.data.auditNumber);
        const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        const adjustedItemsCount = nonSerializedVariances.filter((v) => v.variance !== 0).length;
        setLastSavedNotice(
          `Draft #${data.data.auditNumber} saved at ${timeStr} (${scannedSerials.length} serials, ${adjustedItemsCount} non-serial adjustments)`
        );
        addToast(
          "success",
          `Draft #${data.data.auditNumber} saved at ${timeStr}! (${scannedSerials.length} serials, ${adjustedItemsCount} non-serial items)`
        );

        // Also update local storage immediately
        if (typeof window !== "undefined" && selectedLocationId) {
          localStorage.setItem(
            `stock_audit_draft_v2_${selectedLocationId}`,
            JSON.stringify({
              locationId: selectedLocationId,
              scannedSerials,
              serialVerificationMap,
              unregisteredMappings,
              crossBranchResolutions,
              physicalCounts,
              auditScope,
              auditNotes,
              currentDraftId: data.data._id,
              draftNumber: data.data.auditNumber,
              savedAt: new Date().toISOString(),
            })
          );
        }
      } else {
        addToast("error", data.error || "Failed to save draft.");
      }
    } catch {
      addToast("error", "Network error while saving draft.");
    } finally {
      setSavingDraft(false);
    }
  };

  // Discard draft and start fresh
  const handleClearDraft = () => {
    if (
      !confirm(
        "Are you sure you want to discard this draft count? All scanned serials and count adjustments in this session will be cleared."
      )
    ) {
      return;
    }
    setScannedSerials([]);
    setSerialVerificationMap({});
    setUnregisteredMappings([]);
    setCrossBranchResolutions({});
    setCurrentDraftId(null);
    setDraftNumber(null);
    setLastSavedNotice(null);
    setAuditScope("ALL");
    if (typeof window !== "undefined" && selectedLocationId) {
      localStorage.removeItem(`stock_audit_draft_v2_${selectedLocationId}`);
      localStorage.removeItem(`stock_audit_draft_${selectedLocationId}`);
    }
    const initCounts: Record<string, number> = {};
    for (const item of inventoryList) {
      const key = `${item.product?._id}_${item.condition || "New"}`;
      initCounts[key] = item.quantity;
    }
    setPhysicalCounts(initCounts);
    addToast("info", "Draft discarded. Started a fresh audit count.");
  };

  // Resume a draft from audit history
  const handleResumeDraftFromHistory = (aud: any) => {
    const locId = aud.isConsolidated ? "ALL" : (aud.location?._id || aud.location)?.toString();
    if (locId) {
      setSelectedLocationId(locId);
    }
    setScannedSerials(aud.scannedSerials || []);
    setCurrentDraftId(aud._id);
    setDraftNumber(aud.auditNumber);
    setAuditNotes(aud.notes || "");
    if (aud.auditScope) setAuditScope(aud.auditScope);
    const vMap: Record<string, any> = {};
    for (const sn of aud.scannedSerials || []) {
      vMap[sn] = { type: "MATCHED_LOCAL", serialNumber: sn };
    }
    setSerialVerificationMap(vMap);

    // Restore cross branch resolutions
    const cbRes: Record<string, "TRANSFER_TO_DESTINATION" | "RETURN_TO_ORIGIN"> = {};
    if (Array.isArray(aud.crossBranchSerials)) {
      for (const cb of aud.crossBranchSerials) {
        if (cb.serialNumber && cb.resolutionAction) {
          cbRes[cb.serialNumber] = cb.resolutionAction;
        }
      }
    }
    setCrossBranchResolutions(cbRes);

    // Reconstruct physical counts from itemVariances
    const initCounts: Record<string, number> = {};
    for (const item of inventoryList) {
      const key = `${item.product?._id}_${item.condition || "New"}`;
      initCounts[key] = item.quantity;
    }
    if (Array.isArray(aud.itemVariances)) {
      for (const iv of aud.itemVariances) {
        const pId = iv.product?._id || iv.product;
        if (pId) {
          const key = `${pId.toString()}_${iv.condition || "New"}`;
          initCounts[key] = iv.physicalQuantity;
        }
      }
    }
    setPhysicalCounts(initCounts);

    if (typeof window !== "undefined" && locId) {
      localStorage.setItem(
        `stock_audit_draft_v2_${locId}`,
        JSON.stringify({
          locationId: locId,
          scannedSerials: aud.scannedSerials || [],
          serialVerificationMap: vMap,
          unregisteredMappings: [],
          crossBranchResolutions: cbRes,
          physicalCounts: initCounts,
          auditScope: aud.auditScope || "ALL",
          auditNotes: aud.notes || "",
          currentDraftId: aud._id,
          draftNumber: aud.auditNumber,
          savedAt: new Date().toISOString(),
        })
      );
    }

    setLastSavedNotice(`Draft #${aud.auditNumber} resumed from database!`);
    setActiveTab("SERIALIZED");
    addToast("success", `Resumed Draft #${aud.auditNumber} for ${aud.locationName}!`);
  };

  // Load audit history
  const fetchPastAudits = async () => {
    try {
      setLoadingPastAudits(true);
      const res = await fetch("/api/inventory/audit");
      const data = await res.json();
      if (data.success) {
        setPastAudits(data.data || []);
      }
    } catch {
      console.error("Failed to fetch past audits");
    } finally {
      setLoadingPastAudits(false);
    }
  };

  useEffect(() => {
    if (activeTab === "HISTORY") {
      fetchPastAudits();
    }
  }, [activeTab]);

  // Handle Non-Serialized barcode scan / quick count +1
  const handleNonSerializedBarcodeScan = (term: string) => {
    const clean = term.trim().toLowerCase();
    if (!clean) return;

    // Look for exact match by barcode or SKU first
    const matched =
      nonSerializedItems.find(
        (it) =>
          (it.product?.barcode || "").toLowerCase().trim() === clean ||
          (it.product?.sku || "").toLowerCase().trim() === clean
      ) ||
      nonSerializedItems.find((it) => (it.product?.name || "").toLowerCase().includes(clean));

    if (matched) {
      const key = `${matched.product?._id}_${matched.condition || "New"}`;
      let updatedQty = 0;
      setPhysicalCounts((prev) => {
        const current = prev[key] !== undefined ? prev[key] : matched.quantity;
        updatedQty = current + 1;
        return {
          ...prev,
          [key]: updatedQty,
        };
      });
      setNonSerializedSearch(matched.product?.barcode || matched.product?.sku || clean);
      addToast(
        "success",
        `📦 +1 Counted: ${matched.product?.name} (Shelf Count: ${updatedQty})`
      );
    } else {
      addToast("error", `No non-serialized product found matching '${term}'.`);
    }
  };

  // Handle Scan Serial or Product Barcode
  const handleAddScannedSerial = async (rawSn: string) => {
    const cleanSn = rawSn.trim().toUpperCase();
    if (!cleanSn) return;

    // If it's already in scannedSerials
    if (scannedSerials.includes(cleanSn)) {
      addToast("info", `Serial '${cleanSn}' is already scanned in this session.`);
      setSerialScanInput("");
      return;
    }

    const scanLocId = selectedLocationId;
    setVerifyingSerial(true);
    try {
      const res = await fetch("/api/inventory/audit/verify-serial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serialNumber: cleanSn,
          locationId: scanLocId,
        }),
      });
      const data = await res.json();
      // Guard: Discard if user changed branch while verify-serial request was in-flight
      if (selectedLocationId !== scanLocId) return;

      if (data.success) {
        if (data.data.type === "NON_SERIALIZED_PRODUCT") {
          // Detected a non-serialized product barcode! Increment physical count +1
          const prod = data.data.product;
          const key = `${prod._id}_${prod.condition || "New"}`;
          let newQty = 1;
          setPhysicalCounts((prev) => {
            const current =
              prev[key] !== undefined
                ? prev[key]
                : inventoryList.find((it) => it.product?._id === prod._id)?.quantity || 0;
            newQty = current + 1;
            return {
              ...prev,
              [key]: newQty,
            };
          });
          setSerialScanInput("");
          addToast("success", `📦 +1 Counted: ${prod.name} (Shelf Count: ${newQty})`);
          return;
        }

        setScannedSerials((prev) => [cleanSn, ...prev]);
        setSerialVerificationMap((prev) => ({
          ...prev,
          [cleanSn]: data.data,
        }));
        setSerialScanInput("");
      } else {
        addToast("error", data.error || "Failed to verify serial");
      }
    } catch {
      addToast("error", "Error connecting to server for serial verification");
    } finally {
      setVerifyingSerial(false);
      barcodeInputRef.current?.focus();
    }
  };

  const handleRemoveScannedSerial = (snToRemove: string) => {
    setScannedSerials((prev) => prev.filter((s) => s !== snToRemove));
    setSerialVerificationMap((prev) => {
      const next = { ...prev };
      delete next[snToRemove];
      return next;
    });
    setUnregisteredMappings((prev) => prev.filter((m) => m.serialNumber !== snToRemove));
  };

  const isNonSerializedOnly = auditScope === "NON_SERIALIZED_ONLY";
  const isSerializedOnly = auditScope === "SERIALIZED_ONLY";

  // Missing Serials: Serials in DB as Available at this location, but NOT scanned on shelf
  const missingSerialsList = isNonSerializedOnly
    ? []
    : localAvailableSerials.filter((localSn) => {
        const snUpper = localSn.serialNumber.trim().toUpperCase();
        return !scannedSerials.includes(snUpper);
      });

  // Cross-branch serials scanned
  const crossBranchSerialsList = isNonSerializedOnly
    ? []
    : scannedSerials
        .map((sn) => serialVerificationMap[sn])
        .filter((v) => v?.type === "CROSS_BRANCH");

  // Unregistered serials scanned
  const unregisteredSerialsList = isNonSerializedOnly
    ? []
    : scannedSerials
        .map((sn) => serialVerificationMap[sn])
        .filter((v) => v?.type === "UNREGISTERED");

  // Reactivated serials scanned
  const reactivatedSerialsList = isNonSerializedOnly
    ? []
    : scannedSerials
        .map((sn) => serialVerificationMap[sn])
        .filter((v) => v?.type === "PREVIOUSLY_SOLD");

  // Calculate Non-serialized Variances
  const nonSerializedItems = inventoryList.filter((item) => !item.product?.serialTracking);
  let totalMissingQty = missingSerialsList.length;
  let totalSurplusQty = unregisteredSerialsList.length + reactivatedSerialsList.length;
  let netCostDelta = 0;

  // Add missing serials cost (only if serials are being audited)
  if (!isNonSerializedOnly) {
    for (const m of missingSerialsList) {
      netCostDelta -= m.product?.costPrice || 0;
    }
  }

  // Non-serialized item variance calculations
  const nonSerializedVariances = isSerializedOnly
    ? []
    : nonSerializedItems.map((item) => {
        const key = `${item.product?._id}_${item.condition || "New"}`;
        const physicalQty = physicalCounts[key] !== undefined ? physicalCounts[key] : item.quantity;
        const variance = physicalQty - item.quantity;
        const unitCost = item.averageCost || item.product?.costPrice || 0;
        const costDelta = variance * unitCost;

        if (variance < 0) totalMissingQty += Math.abs(variance);
        if (variance > 0) totalSurplusQty += variance;
        netCostDelta += costDelta;

        return {
          product: item.product,
          condition: item.condition || "New",
          systemQuantity: item.quantity,
          physicalQuantity: physicalQty,
          variance,
          unitCost,
          costDelta,
        };
      });

  // Execute or Submit Reconciliation
  const handleExecuteAudit = async (action: "DIRECT_APPROVE" | "SUBMIT_APPROVAL") => {
    if (!selectedLocationId) return;

    // Safety guard: If auditScope is ALL, but 0 serials were scanned and branch has serials in DB:
    if (auditScope === "ALL" && scannedSerials.length === 0 && localAvailableSerials.length > 0) {
      const choice = confirm(
        `⚠️ IMPORTANT SAFETY NOTICE:\n\n` +
        `You have selected FULL AUDIT, but have scanned 0 serialized consoles!\n` +
        `This location has ${localAvailableSerials.length} consoles registered in system.\n\n` +
        `If you proceed, all ${localAvailableSerials.length} consoles will be marked as MISSING (SOLD)!\n\n` +
        `• Click CANCEL to switch Scope to 'Shelf Items Only (Non-Serialized)' or scan your consoles.\n` +
        `• Click OK only if all consoles are genuinely missing from the shelf.`
      );
      if (!choice) return;
    }

    const physicalCountsPayload = nonSerializedVariances.map((v) => ({
      productId: v.product?._id,
      condition: v.condition,
      physicalQuantity: v.physicalQuantity,
    }));

    try {
      setSubmittingAudit(true);
      const res = await fetch("/api/inventory/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId: selectedLocationId,
          auditId: currentDraftId,
          scannedSerials,
          physicalCounts: physicalCountsPayload,
          unregisteredSerialMappings: unregisteredMappings,
          crossBranchResolutions,
          auditScope,
          action,
          notes: auditNotes,
        }),
      });

      const data = await res.json();
      if (data.success) {
        addToast("success", data.message || "Audit submitted successfully!");
        if (typeof window !== "undefined" && selectedLocationId) {
          localStorage.removeItem(`stock_audit_draft_v2_${selectedLocationId}`);
          localStorage.removeItem(`stock_audit_draft_${selectedLocationId}`);
        }
        setCurrentDraftId(null);
        setDraftNumber(null);
        setLastSavedNotice(null);
        fetchAuditData(selectedLocationId);
        setActiveTab("HISTORY");
      } else {
        addToast("error", data.error || "Failed to process stock audit.");
      }
    } catch {
      addToast("error", "Network error during audit execution.");
    } finally {
      setSubmittingAudit(false);
    }
  };

  const isAdmin = currentUser?.role === "Admin" || currentUser?.role === "Owner";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6">
      <ToastContainer toasts={toasts} onClose={removeToast} />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-850 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-emerald-600/10 border border-emerald-500/20 text-emerald-400">
              <CheckSquare className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-100 flex items-center gap-2">
                Physical Shelf Stock Audit & Reconciliation
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Scan shelf boxes, detect missing or cross-branch units, and reconcile physical inventory with zero costing errors.
              </p>
            </div>
          </div>
        </div>

        {/* Scope & Location Selectors */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Audit Scope Selector */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Scope:</span>
            <select
              value={auditScope}
              onChange={(e) => setAuditScope(e.target.value as any)}
              className="bg-transparent text-xs font-bold text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900 text-slate-100">🔀 Full Audit (Consoles + Items)</option>
              <option value="SERIALIZED_ONLY" className="bg-slate-900 text-slate-100">🎮 Consoles Only (Serialized)</option>
              <option value="NON_SERIALIZED_ONLY" className="bg-slate-900 text-slate-100">📦 Shelf Items Only (Non-Serialized)</option>
            </select>
          </div>

          {/* Location Selector */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-indigo-400" />
            <select
              value={selectedLocationId}
              onChange={(e) => {
                const newLoc = e.target.value;
                loadedLocationIdRef.current = "";
                // IMMEDIATELY WIPE ALL STATE FROM MEMORY (Serials + Counts)
                setScannedSerials([]);
                setSerialVerificationMap({});
                setUnregisteredMappings([]);
                setCrossBranchResolutions({});
                setPhysicalCounts({});
                setCurrentDraftId(null);
                setDraftNumber(null);
                setLastSavedNotice(null);
                setSelectedLocationId(newLoc);
              }}
              className="bg-transparent text-xs font-bold text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900 text-amber-300 font-bold">
                🏢 All Branches (Mall Consolidated Audit)
              </option>
              {locations.map((loc) => (
                <option key={loc._id} value={loc._id} className="bg-slate-900 text-slate-100">
                  {loc.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => fetchAuditData(selectedLocationId)}
            disabled={loadingAuditData}
            className="p-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl transition"
            title="Reload System Stock"
          >
            <RefreshCw className={`w-4 h-4 ${loadingAuditData ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Consolidated Mall Audit Info Banner */}
      {selectedLocationId === "ALL" && (
        <div className="bg-gradient-to-r from-amber-950/50 via-slate-900 to-indigo-950/60 border border-amber-500/40 p-4 rounded-2xl flex items-start gap-3.5 shadow-xl">
          <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-300 shrink-0 mt-0.5">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="text-xs">
            <div className="font-bold text-amber-200 text-sm flex items-center gap-2">
              <span>🏢 Consolidated Mall Audit Mode (All Branches)</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono font-bold">
                Unified Stock Pool
              </span>
            </div>
            <p className="text-slate-300 mt-1 leading-relaxed">
              All neighboring mall branches (Warehouse, G-14, Shop 2) are audited as a single combined inventory pool. Any console or shelf item found anywhere in the company is treated as valid stock with zero false cross-branch relocations.
            </p>
          </div>
        </div>
      )}

      {/* Draft Notification / Auto-Save Banner */}
      {(scannedSerials.length > 0 || currentDraftId || nonSerializedVariances.some((v) => v.variance !== 0)) && (
        <div className="bg-gradient-to-r from-indigo-950/70 via-slate-900 to-indigo-950/40 border border-indigo-500/30 p-3.5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-xl shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-100 flex items-center gap-2">
                <span>Working Count In Progress ({scannedSerials.length} boxes scanned)</span>
                {draftNumber && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    Draft #{draftNumber}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {lastSavedNotice ||
                  "Progress is safely kept in your browser. You do NOT have to scan everything at once. Take your time, take breaks, and submit only when ready!"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <button
              onClick={handleSaveDraft}
              disabled={savingDraft || submittingAudit}
              className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-xs font-bold rounded-lg border border-indigo-500/30 transition flex items-center gap-1.5"
            >
              <span>💾 {savingDraft ? "Saving..." : "Save Draft"}</span>
            </button>
            <button
              onClick={handleClearDraft}
              className="px-3 py-1.5 bg-rose-950/30 hover:bg-rose-900/40 text-rose-300 text-xs font-bold rounded-lg border border-rose-800/30 transition flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Discard / Start Fresh</span>
            </button>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800/80 pb-2">
        <button
          onClick={() => setActiveTab("SERIALIZED")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === "SERIALIZED"
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
              : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
          }`}
        >
          <Barcode className="w-4 h-4" />
          <span>1. Universal Shelf Scanner (Consoles + Items)</span>
          <span className="text-[10px] bg-black/40 px-1.5 py-0.5 rounded-full font-mono">
            {scannedSerials.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("NON_SERIALIZED")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === "NON_SERIALIZED"
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
              : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>2. Non-Serialized Shelf Count</span>
          <span className="text-[10px] bg-black/40 px-1.5 py-0.5 rounded-full font-mono">
            {nonSerializedItems.length}
          </span>
          {nonSerializedVariances.filter((v) => v.variance !== 0).length > 0 && (
            <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-full font-mono font-bold">
              {nonSerializedVariances.filter((v) => v.variance !== 0).length} diff
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("SUMMARY")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === "SUMMARY"
              ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20"
              : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
          }`}
        >
          <FileCheck className="w-4 h-4" />
          <span>3. Audit Discrepancies & Resolve</span>
          {(totalMissingQty > 0 || totalSurplusQty > 0 || crossBranchSerialsList.length > 0) && (
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          )}
        </button>

        <button
          onClick={() => setActiveTab("HISTORY")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === "HISTORY"
              ? "bg-slate-800 text-slate-200 border border-slate-700"
              : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Audit History</span>
        </button>
      </div>

      {/* TAB 1: SERIALIZED CONSOLE SCANNER */}
      {activeTab === "SERIALIZED" && (
        <div className="space-y-6">
          {/* Non-Serialized Only Scope Notice */}
          {auditScope === "NON_SERIALIZED_ONLY" && (
            <div className="bg-amber-500/10 border border-amber-500/30 p-3.5 rounded-2xl flex items-center gap-3 text-xs text-amber-300 shadow-lg">
              <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400" />
              <span>
                <strong>Notice:</strong> Audit Scope is set to <strong>Shelf Items Only (Non-Serialized)</strong>. Consoles and serial numbers are protected and will <strong>NOT</strong> be altered or marked missing. To audit consoles, switch Scope above to <strong>Full Audit</strong> or <strong>Consoles Only</strong>.
              </span>
            </div>
          )}

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Physical Scanned
              </span>
              <span className="text-xl font-black text-emerald-400">{scannedSerials.length}</span>
              <span className="text-[11px] text-slate-500 block mt-0.5">Boxes present on shelf</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Expected In System
              </span>
              <span className="text-xl font-black text-slate-200">{localAvailableSerials.length}</span>
              <span className="text-[11px] text-slate-500 block mt-0.5">Recorded as Available</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl">
              <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block">
                {auditScope === "NON_SERIALIZED_ONLY"
                  ? "Consoles Excluded"
                  : scannedSerials.length === 0
                  ? "Unscanned (In System)"
                  : "Phantom / Missing (Sold)"}
              </span>
              <span className="text-xl font-black text-rose-400">
                {auditScope === "NON_SERIALIZED_ONLY"
                  ? 0
                  : scannedSerials.length === 0
                  ? localAvailableSerials.length
                  : missingSerialsList.length}
              </span>
              <span className="text-[11px] text-slate-500 block mt-0.5">
                {auditScope === "NON_SERIALIZED_ONLY"
                  ? "Protected from audit"
                  : scannedSerials.length === 0
                  ? "Awaiting physical scan"
                  : "Not found on shelf"}
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl">
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                Cross-Branch Found
              </span>
              <span className="text-xl font-black text-amber-400">{crossBranchSerialsList.length}</span>
              <span className="text-[11px] text-slate-500 block mt-0.5">Belongs to another branch</span>
            </div>
          </div>

          {/* Barcode Scanner Input Box */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-3">
            <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Barcode className="w-4 h-4 text-indigo-400" />
                Scan Serial Barcode (Gun or Keyboard):
              </span>
              <span className="text-[11px] text-slate-400 font-normal">
                Press Enter or click Add to register serial
              </span>
            </label>

            <div className="flex gap-2">
              <input
                ref={barcodeInputRef}
                type="text"
                placeholder="Scan barcode or type serial number (e.g. S01F56401K...)"
                value={serialScanInput}
                onChange={(e) => setSerialScanInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddScannedSerial(serialScanInput);
                  }
                }}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />

              <button
                type="button"
                onClick={() => handleAddScannedSerial(serialScanInput)}
                disabled={verifyingSerial || !serialScanInput.trim()}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition shrink-0"
              >
                {verifyingSerial ? "Checking..." : "Add Serial"}
              </button>

              <button
                type="button"
                onClick={() => setCameraScannerOpen(true)}
                className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl transition flex items-center gap-1.5 shrink-0"
                title="Scan with Mobile/Webcam"
              >
                <Camera className="w-4 h-4 text-cyan-400" />
                <span className="hidden sm:inline text-xs font-semibold">Camera</span>
              </button>

              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={savingDraft}
                className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-indigo-300 border border-indigo-500/30 rounded-xl transition flex items-center gap-1.5 shrink-0"
                title="Save Draft to Database"
              >
                <Clock className="w-4 h-4 text-indigo-400" />
                <span className="hidden sm:inline text-xs font-semibold">
                  {savingDraft ? "Saving..." : "Save Draft"}
                </span>
              </button>
            </div>
          </div>

          {/* Scanned Serials List & Missing Serials Columns */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Scanned on Shelf */}
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <h3 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  Physically Scanned on Shelf ({scannedSerials.length})
                </h3>
                {scannedSerials.length > 0 && (
                  <button
                    onClick={() => {
                      if (confirm("Clear all scanned serials in this session?")) {
                        setScannedSerials([]);
                        setSerialVerificationMap({});
                        setUnregisteredMappings([]);
                        if (typeof window !== "undefined" && selectedLocationId) {
                          const raw = localStorage.getItem(`stock_audit_draft_v2_${selectedLocationId}`);
                          if (raw) {
                            try {
                              const parsed = JSON.parse(raw);
                              parsed.scannedSerials = [];
                              parsed.serialVerificationMap = {};
                              parsed.unregisteredMappings = [];
                              localStorage.setItem(`stock_audit_draft_v2_${selectedLocationId}`, JSON.stringify(parsed));
                            } catch {}
                          }
                          try {
                            localStorage.removeItem(`stock_audit_draft_${selectedLocationId}`);
                          } catch {}
                        }
                        addToast("info", "All scanned serials cleared.");
                      }
                    }}
                    className="text-[11px] text-rose-400 hover:underline"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {scannedSerials.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  No serials scanned yet. Start scanning boxes on your shelf!
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {scannedSerials.map((sn) => {
                    const meta = serialVerificationMap[sn];
                    return (
                      <div
                        key={sn}
                        className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 flex items-center justify-between gap-2"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xs text-slate-100">{sn}</span>
                            {meta?.type === "MATCHED_LOCAL" && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                🟢 Matched Local
                              </span>
                            )}
                            {meta?.type === "CROSS_BRANCH" && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                                <ArrowRightLeft className="w-3 h-3" />
                                From: {meta.fromLocationName}
                              </span>
                            )}
                            {meta?.type === "RESERVED" && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                                🔵 Reserved Order
                              </span>
                            )}
                            {meta?.type === "PREVIOUSLY_SOLD" && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                🟡 Reactivate (Was Sold)
                              </span>
                            )}
                            {meta?.type === "UNREGISTERED" && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                ❓ Unregistered (Found on Shelf)
                              </span>
                            )}
                          </div>
                          {meta?.product && (
                            <div className="text-[11px] text-slate-400">
                              {meta.product.name} ({meta.product.condition || "New"})
                            </div>
                          )}
                          <div className="text-[10px] text-slate-500">{meta?.message}</div>

                          {/* Quick mapping for unregistered serials */}
                          {meta?.type === "UNREGISTERED" && (
                            <div className="mt-2 p-2 bg-slate-900/90 rounded-lg border border-rose-500/30 space-y-1.5">
                              <div className="flex items-center justify-between text-[10px]">
                                <span className="font-bold text-rose-300 flex items-center gap-1">
                                  <HelpCircle className="w-3 h-3 text-rose-400" />
                                  Map to Catalog Product:
                                </span>
                                {unregisteredMappings.find((m) => m.serialNumber === sn) && (
                                  <span className="text-emerald-400 font-bold flex items-center gap-0.5">
                                    <Check className="w-3 h-3" /> Mapped as Found Stock
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <select
                                  value={unregisteredMappings.find((m) => m.serialNumber === sn)?.productId || ""}
                                  onChange={(e) => {
                                    const pId = e.target.value;
                                    setUnregisteredMappings((prev) => {
                                      const filtered = prev.filter((m) => m.serialNumber !== sn);
                                      if (!pId) return filtered;
                                      const existingCond = prev.find((m) => m.serialNumber === sn)?.condition || "New";
                                      return [...filtered, { serialNumber: sn, productId: pId, condition: existingCond }];
                                    });
                                  }}
                                  className="flex-1 bg-slate-950 border border-slate-700 rounded text-[11px] px-2 py-1 text-slate-100 focus:outline-none focus:border-indigo-500"
                                >
                                  <option value="">-- Choose Product Model --</option>
                                  {(productList.length > 0 ? productList : inventoryList.map((i) => i.product).filter(Boolean))
                                    .filter((p) => p.serialTracking !== false)
                                    .map((p) => (
                                      <option key={p._id} value={p._id}>
                                        {p.name} {p.sku ? `(${p.sku})` : ""}
                                      </option>
                                    ))}
                                </select>
                                <select
                                  value={unregisteredMappings.find((m) => m.serialNumber === sn)?.condition || "New"}
                                  onChange={(e) => {
                                    const c = e.target.value;
                                    setUnregisteredMappings((prev) => {
                                      const cur = prev.find((m) => m.serialNumber === sn);
                                      if (!cur) return prev;
                                      return [...prev.filter((m) => m.serialNumber !== sn), { ...cur, condition: c }];
                                    });
                                  }}
                                  className="w-20 bg-slate-950 border border-slate-700 rounded text-[11px] px-1.5 py-1 text-slate-100 focus:outline-none focus:border-indigo-500"
                                >
                                  <option value="New">New</option>
                                  <option value="Used">Used</option>
                                  <option value="Refurbished">Refurb</option>
                                </select>
                              </div>
                            </div>
                          )}
                        </div>

                        <button
                          onClick={() => handleRemoveScannedSerial(sn)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 transition"
                          title="Remove Scan"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Missing Serials (Ghost Stock) */}
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <h3 className="text-xs font-bold text-rose-400 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4" />
                  {auditScope === "NON_SERIALIZED_ONLY"
                    ? "Consoles Excluded"
                    : scannedSerials.length === 0
                    ? `Awaiting Console Scan (${localAvailableSerials.length} in System)`
                    : `Identified Missing / Phantom Stock (${missingSerialsList.length})`}
                </h3>
                <span className="text-[10px] text-slate-400 font-normal">
                  {auditScope === "NON_SERIALIZED_ONLY"
                    ? "Scope: Shelf Items Only"
                    : scannedSerials.length === 0
                    ? "Not Scanned Yet"
                    : "In System but NOT on Shelf (Sold)"}
                </span>
              </div>

              {auditScope === "NON_SERIALIZED_ONLY" ? (
                <div className="py-12 text-center text-slate-400 text-xs font-medium">
                  📦 Audit Scope is currently set to <strong>Shelf Items Only (Non-Serialized)</strong>.
                  <br />
                  <span className="text-slate-500 text-[11px] mt-1 block">
                    All {localAvailableSerials.length} consoles remain safe and untouched in system inventory.
                  </span>
                </div>
              ) : scannedSerials.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  🎮 Console physical scanning has not started yet.
                  <br />
                  <span className="text-slate-500 text-[11px] mt-1 block">
                    Scan boxes on the shelf. Any consoles registered in system that you do not scan will appear here.
                  </span>
                </div>
              ) : missingSerialsList.length === 0 ? (
                <div className="py-12 text-center text-emerald-400 text-xs font-semibold">
                  🎉 No missing serials! All system-tracked serials are accounted for.
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {missingSerialsList.map((item) => (
                    <div
                      key={item._id}
                      className="bg-slate-950 p-3 rounded-xl border border-rose-950/60 flex items-center justify-between gap-2"
                    >
                      <div>
                        <div className="font-bold text-xs text-slate-200">
                          {item.product?.name || "Product"}
                        </div>
                        <div className="font-mono text-xs text-rose-400 font-bold mt-0.5">
                          S/N: {item.serialNumber}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Condition: {item.condition || "New"} | Cost: Rs. {(item.product?.costPrice || 0).toLocaleString()}
                        </div>
                      </div>

                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30">
                        Will be marked Sold
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Section: Live Shelf Non-Serialized Items Counter (Unified 1-Tab Experience) */}
          {auditScope !== "SERIALIZED_ONLY" && (
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4 shadow-lg">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-850 pb-3">
                <div>
                  <h3 className="text-xs font-bold text-slate-100 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-400" />
                    <span>Live Shelf Non-Serialized Products ({nonSerializedItems.length} in catalog)</span>
                    {nonSerializedVariances.filter((v) => v.variance !== 0).length > 0 && (
                      <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono font-bold">
                        {nonSerializedVariances.filter((v) => v.variance !== 0).length} Discrepancies
                      </span>
                    )}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Scan any product barcode in the scanner above, or search & count shelf items (+/-) right here without leaving this tab!
                  </p>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-64">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="Search shelf item / barcode..."
                      value={tab1ShelfSearch}
                      onChange={(e) => setTab1ShelfSearch(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-7 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                    />
                    {tab1ShelfSearch && (
                      <button
                        type="button"
                        onClick={() => setTab1ShelfSearch("")}
                        className="absolute right-2.5 top-2 text-xs text-slate-500 hover:text-slate-300"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveTab("NON_SERIALIZED")}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-semibold transition shrink-0 flex items-center gap-1.5"
                  >
                    <span>Full Table</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Items List */}
              {(() => {
                const searchQ = tab1ShelfSearch.trim().toLowerCase();
                const filtered = nonSerializedItems.filter((it) => {
                  if (searchQ) {
                    return (
                      (it.product?.name || "").toLowerCase().includes(searchQ) ||
                      (it.product?.sku || "").toLowerCase().includes(searchQ) ||
                      (it.product?.barcode || "").toLowerCase().includes(searchQ)
                    );
                  }
                  const key = `${it.product?._id}_${it.condition || "New"}`;
                  const pQty = physicalCounts[key] !== undefined ? physicalCounts[key] : it.quantity;
                  return pQty !== it.quantity;
                });

                const displayList = searchQ ? filtered : filtered.length > 0 ? filtered : nonSerializedItems.slice(0, 8);

                return (
                  <div className="space-y-2.5">
                    {!searchQ && filtered.length === 0 && (
                      <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-850 text-center text-xs text-slate-400">
                        <span>📦 All shelf items currently match system stock. Scan accessory barcodes into the scanner above or search an item to adjust its shelf count.</span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
                      {displayList.map((item) => {
                        const key = `${item.product?._id}_${item.condition || "New"}`;
                        const physicalQty = physicalCounts[key] !== undefined ? physicalCounts[key] : item.quantity;
                        const variance = physicalQty - item.quantity;

                        return (
                          <div
                            key={key}
                            className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 flex items-center justify-between gap-3 hover:border-slate-700 transition"
                          >
                            <div className="space-y-0.5 min-w-0 flex-1">
                              <div className="font-bold text-xs text-slate-100 truncate">
                                {item.product?.name}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400 font-mono">
                                <span>Condition: <strong className="text-slate-300">{item.condition || "New"}</strong></span>
                                {item.product?.barcode && (
                                  <span className="text-cyan-400 bg-cyan-500/10 px-1 rounded border border-cyan-500/20">
                                    ║▌ {item.product.barcode}
                                  </span>
                                )}
                                <span>Sys: <strong className="text-slate-300">{item.quantity}</strong></span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {/* Quantity Modifier */}
                              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const val = Math.max(0, physicalQty - 1);
                                    setPhysicalCounts((prev) => ({ ...prev, [key]: val }));
                                  }}
                                  className="w-6 h-6 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 rounded-lg text-xs font-bold transition flex items-center justify-center"
                                  title="Minus 1"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  min="0"
                                  value={physicalQty}
                                  onChange={(e) => {
                                    const val = Math.max(0, parseInt(e.target.value || "0", 10));
                                    setPhysicalCounts((prev) => ({ ...prev, [key]: val }));
                                  }}
                                  className="w-10 bg-transparent text-center font-mono font-bold text-xs text-slate-100 focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const val = physicalQty + 1;
                                    setPhysicalCounts((prev) => ({ ...prev, [key]: val }));
                                  }}
                                  className="w-6 h-6 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 rounded-lg text-xs font-bold transition flex items-center justify-center"
                                  title="Add 1"
                                >
                                  +
                                </button>
                              </div>

                              {/* Variance Pill */}
                              <div className="w-20 text-right">
                                {variance === 0 ? (
                                  <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                                    Match
                                  </span>
                                ) : variance < 0 ? (
                                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                    {variance} Short
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                    +{variance} Surp
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: NON-SERIALIZED SHELF COUNT */}
      {activeTab === "NON_SERIALIZED" && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h3 className="text-xs font-bold text-slate-100 flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                Physical Count Entry (CDs, Accessories, Cables)
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Scan barcode or type to quickly find products. Enter physical shelf quantity.
              </p>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={savingDraft}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-indigo-300 text-xs font-bold rounded-xl border border-indigo-500/30 transition flex items-center gap-1.5 shrink-0 shadow-sm"
                title="Save Non-Serialized Count to Database"
              >
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span>{savingDraft ? "Saving..." : "💾 Save Draft"}</span>
              </button>
            </div>
          </div>

          {/* Dedicated Barcode Scanner Bar for Non-Serialized Items */}
          <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-2">
            <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Barcode className="w-4 h-4 text-indigo-400" />
                Scan Product Barcode or Search (Gun or Keyboard):
              </span>
              <span className="text-[11px] text-slate-400 font-normal">
                Scan barcode or press Enter to find product on shelf
              </span>
            </label>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Barcode className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Scan product barcode (e.g. PGS-555703383) or type product name / SKU..."
                  value={nonSerializedSearch}
                  onChange={(e) => setNonSerializedSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleNonSerializedBarcodeScan(nonSerializedSearch);
                    }
                  }}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                {nonSerializedSearch && (
                  <button
                    type="button"
                    onClick={() => setNonSerializedSearch("")}
                    className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-200"
                    title="Clear filter"
                  >
                    ✕
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleNonSerializedBarcodeScan(nonSerializedSearch)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition shrink-0"
              >
                Find / Scan
              </button>
            </div>
          </div>

          {/* Scope Guidance Banner */}
          {auditScope === "SERIALIZED_ONLY" ? (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-start gap-3 text-xs text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-amber-200">Notice: Audit Scope is set to Consoles Only (Serialized).</strong>
                <p className="text-slate-400 mt-0.5 leading-relaxed">
                  Non-serialized items will <strong>NOT</strong> be reconciled or altered in this audit session. To adjust shelf inventory, switch Scope above to <strong>Full Audit</strong> or <strong>Shelf Items Only</strong>.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-indigo-950/40 border border-indigo-500/20 rounded-xl p-3 flex items-start gap-3">
              <Layers className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-bold text-indigo-300">Auditing Consoles Only?</span>
                <p className="text-slate-400 mt-0.5 leading-relaxed">
                  If you only want to reconcile consoles right now, leave these physical quantities as they are (Variance 0) or switch Scope to <strong>Consoles Only</strong>. The system will <strong>NOT</strong> modify any non-serialized inventory.
                </p>
              </div>
            </div>
          )}

          {/* Filter Pills for Quick Navigation */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-400 mr-1">Show:</span>
              <button
                type="button"
                onClick={() => setNonSerializedFilter("ALL")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  nonSerializedFilter === "ALL"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
                }`}
              >
                All Items ({nonSerializedItems.length})
              </button>
              <button
                type="button"
                onClick={() => setNonSerializedFilter("DISCREPANCIES")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  nonSerializedFilter === "DISCREPANCIES"
                    ? "bg-amber-600 text-white shadow-md shadow-amber-600/30"
                    : "bg-slate-900 text-amber-400 hover:bg-slate-850 border border-amber-500/30"
                }`}
              >
                <span>⚡ Only Discrepancies</span>
                <span className="px-1.5 py-0.5 rounded-full bg-black/40 text-[10px] font-mono">
                  {nonSerializedVariances.filter((v) => v.variance !== 0).length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setNonSerializedFilter("SHORTAGE")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  nonSerializedFilter === "SHORTAGE"
                    ? "bg-rose-600 text-white shadow-md shadow-rose-600/30"
                    : "bg-slate-900 text-rose-400 hover:bg-slate-850 border border-rose-500/30"
                }`}
              >
                <span>Shortages</span>
                <span className="px-1.5 py-0.5 rounded-full bg-black/40 text-[10px] font-mono">
                  {nonSerializedVariances.filter((v) => v.variance < 0).length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setNonSerializedFilter("SURPLUS")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  nonSerializedFilter === "SURPLUS"
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                    : "bg-slate-900 text-emerald-400 hover:bg-slate-850 border border-emerald-500/30"
                }`}
              >
                <span>Surplus</span>
                <span className="px-1.5 py-0.5 rounded-full bg-black/40 text-[10px] font-mono">
                  {nonSerializedVariances.filter((v) => v.variance > 0).length}
                </span>
              </button>
            </div>

            {nonSerializedVariances.filter((v) => v.variance !== 0).length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const resetCounts: Record<string, number> = {};
                  for (const item of inventoryList) {
                    const key = `${item.product?._id}_${item.condition || "New"}`;
                    resetCounts[key] = item.quantity;
                  }
                  setPhysicalCounts(resetCounts);
                  if (typeof window !== "undefined" && selectedLocationId) {
                    const raw = localStorage.getItem(`stock_audit_draft_${selectedLocationId}`);
                    if (raw) {
                      try {
                        const parsed = JSON.parse(raw);
                        parsed.physicalCounts = resetCounts;
                        localStorage.setItem(`stock_audit_draft_${selectedLocationId}`, JSON.stringify(parsed));
                      } catch {}
                    }
                  }
                  addToast("info", "All non-serialized counts reset to match current system stock (0 variance).");
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition flex items-center gap-1.5"
                title="Reset all non-serialized items to system stock (Variance 0)"
              >
                <span>🔄 Reset to 0 Variance</span>
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                  <th className="p-3">Product Name</th>
                  <th className="p-3">Condition</th>
                  <th className="p-3 text-right">System Qty</th>
                  <th className="p-3 text-center w-40">Physical on Shelf</th>
                  <th className="p-3 text-right">Variance</th>
                  <th className="p-3 text-right">Unit Avg Cost</th>
                  <th className="p-3 text-right">Cost Delta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850/80">
                {nonSerializedItems
                  .filter((it) => {
                    const key = `${it.product?._id}_${it.condition || "New"}`;
                    const physicalQty = physicalCounts[key] !== undefined ? physicalCounts[key] : it.quantity;
                    const variance = physicalQty - it.quantity;

                    if (nonSerializedFilter === "DISCREPANCIES" && variance === 0) return false;
                    if (nonSerializedFilter === "SHORTAGE" && variance >= 0) return false;
                    if (nonSerializedFilter === "SURPLUS" && variance <= 0) return false;

                    const q = nonSerializedSearch.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      (it.product?.name || "").toLowerCase().includes(q) ||
                      (it.product?.sku || "").toLowerCase().includes(q) ||
                      (it.product?.barcode || "").toLowerCase().includes(q)
                    );
                  })
                  .map((item) => {
                    const key = `${item.product?._id}_${item.condition || "New"}`;
                    const physicalQty = physicalCounts[key] !== undefined ? physicalCounts[key] : item.quantity;
                    const variance = physicalQty - item.quantity;
                    const unitCost = item.averageCost || item.product?.costPrice || 0;
                    const costDelta = variance * unitCost;

                    return (
                      <tr key={key} className="hover:bg-slate-850/40 transition">
                        <td className="p-3 font-bold text-slate-200">
                          {item.product?.name}
                          <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-slate-500 font-normal mt-0.5">
                            <span>SKU: {item.product?.sku}</span>
                            {item.product?.barcode && (
                              <span className="text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20 font-bold">
                                ║▌ {item.product?.barcode}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-slate-400">{item.condition || "New"}</td>
                        <td className="p-3 text-right font-mono font-bold text-slate-300">
                          {item.quantity}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                const val = Math.max(0, physicalQty - 1);
                                setPhysicalCounts((prev) => ({ ...prev, [key]: val }));
                              }}
                              className="w-7 h-7 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-300 rounded-lg text-xs font-bold transition flex items-center justify-center border border-slate-700"
                              title="Decrease 1"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="0"
                              value={physicalQty}
                              onChange={(e) => {
                                const val = Math.max(0, parseInt(e.target.value || "0", 10));
                                setPhysicalCounts((prev) => ({
                                  ...prev,
                                  [key]: val,
                                }));
                              }}
                              className="w-16 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-center font-mono font-bold text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const val = physicalQty + 1;
                                setPhysicalCounts((prev) => ({ ...prev, [key]: val }));
                              }}
                              className="w-7 h-7 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-300 rounded-lg text-xs font-bold transition flex items-center justify-center border border-slate-700"
                              title="Add 1"
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="p-3 text-right font-mono font-bold">
                          {variance === 0 && <span className="text-slate-500">0</span>}
                          {variance < 0 && (
                            <span className="text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                              {variance} Shortage
                            </span>
                          )}
                          {variance > 0 && (
                            <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                              +{variance} Surplus
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right font-mono text-slate-400">
                          Rs. {unitCost.toLocaleString()}
                        </td>
                        <td
                          className={`p-3 text-right font-mono font-bold ${
                            costDelta < 0
                              ? "text-rose-400"
                              : costDelta > 0
                              ? "text-emerald-400"
                              : "text-slate-500"
                          }`}
                        >
                          {costDelta > 0 ? `+ Rs. ${costDelta.toLocaleString()}` : costDelta < 0 ? `- Rs. ${Math.abs(costDelta).toLocaleString()}` : "Rs. 0"}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {/* Bottom Action Footer for Tab 2 */}
          <div className="pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
            <span className="text-[11px] text-slate-400">
              Changes to non-serialized items are automatically preserved in your draft session.
            </span>
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={() => {
                  const initCounts: Record<string, number> = {};
                  for (const item of inventoryList) {
                    const key = `${item.product?._id}_${item.condition || "New"}`;
                    initCounts[key] = item.quantity;
                  }
                  setPhysicalCounts(initCounts);
                  addToast("info", "All non-serialized counts reset to match current system stock (0 variance).");
                }}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl border border-slate-700 transition"
              >
                🔄 Reset Non-Serialized (0 Variance)
              </button>

              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={savingDraft}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-indigo-300 text-xs font-bold rounded-xl border border-indigo-500/30 transition flex items-center gap-1.5"
              >
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span>{savingDraft ? "Saving Draft..." : "💾 Save Draft"}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("SUMMARY")}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-lg shadow-indigo-600/20"
              >
                <span>Review Discrepancies (Step 3)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: AUDIT SUMMARY & RECONCILIATION DASHBOARD */}
      {activeTab === "SUMMARY" && (
        <div className="space-y-6">
          {/* Quick Notice if User Has 0 Consoles Scanned on Full Audit */}
          {auditScope === "ALL" && scannedSerials.length === 0 && localAvailableSerials.length > 0 && (
            <div className="bg-gradient-to-r from-amber-950/60 via-slate-900 to-amber-950/40 border border-amber-500/30 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-300 shadow-lg">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400" />
                <div>
                  <div className="font-bold text-slate-100 text-sm">
                    0 Consoles Scanned ({localAvailableSerials.length} registered in system)
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    If this audit is intended <strong>ONLY</strong> for non-serialized shelf items (accessories/games), switch Scope to <strong>Shelf Items Only</strong> so consoles are not marked as missing/sold.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAuditScope("NON_SERIALIZED_ONLY")}
                className="px-3.5 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 rounded-xl text-xs font-bold transition shrink-0"
              >
                📦 Protect Consoles (Switch to Shelf Items Only)
              </button>
            </div>
          )}

          {auditScope === "NON_SERIALIZED_ONLY" && (
            <div className="bg-indigo-950/40 border border-indigo-500/20 p-3 rounded-xl flex items-center gap-2.5 text-xs text-indigo-300">
              <Layers className="w-4 h-4 shrink-0 text-indigo-400" />
              <span>
                <strong>Audit Scope: Shelf Items Only (Non-Serialized).</strong> All {localAvailableSerials.length} serialized consoles are safely excluded from this audit and will not be altered.
              </span>
            </div>
          )}

          {auditScope === "SERIALIZED_ONLY" && (
            <div className="bg-indigo-950/40 border border-indigo-500/20 p-3 rounded-xl flex items-center gap-2.5 text-xs text-indigo-300">
              <Barcode className="w-4 h-4 shrink-0 text-indigo-400" />
              <span>
                <strong>Audit Scope: Consoles Only (Serialized).</strong> Non-serialized shelf inventory is safely excluded from this audit.
              </span>
            </div>
          )}

          {/* Executive Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1">
              <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                <TrendingDown className="w-3.5 h-3.5" /> Total Missing Units (Sold)
              </span>
              <span className="text-2xl font-black text-rose-400">{totalMissingQty}</span>
              <span className="text-[11px] text-slate-500 block">
                {missingSerialsList.length} Consoles + {totalMissingQty - missingSerialsList.length} Non-serialized
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" /> Total Surplus Units (Found)
              </span>
              <span className="text-2xl font-black text-emerald-400">{totalSurplusQty}</span>
              <span className="text-[11px] text-slate-500 block">Physical count exceeds system</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1">
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <ArrowRightLeft className="w-3.5 h-3.5" /> Cross-Branch Found
              </span>
              <span className="text-2xl font-black text-amber-400">{crossBranchSerialsList.length}</span>
              <span className="text-[11px] text-slate-500 block">
                {selectedLocationId === "ALL"
                  ? "Consolidated Mall Audit (Zero Cross-Branch)"
                  : `${Object.values(crossBranchResolutions).filter((a) => a === "RETURN_TO_ORIGIN").length} to return, ${crossBranchSerialsList.length - Object.values(crossBranchResolutions).filter((a) => a === "RETURN_TO_ORIGIN").length} to keep`}
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1">
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider block">
                Net Cost Impact (PKR)
              </span>
              <span
                className={`text-2xl font-black ${
                  netCostDelta < 0
                    ? "text-rose-400"
                    : netCostDelta > 0
                    ? "text-emerald-400"
                    : "text-slate-300"
                }`}
              >
                {netCostDelta < 0
                  ? `- Rs. ${Math.abs(netCostDelta).toLocaleString()}`
                  : `+ Rs. ${netCostDelta.toLocaleString()}`}
              </span>
              <span className="text-[11px] text-slate-500 block">Inventory valuation variance</span>
            </div>
          </div>

          {/* Consolidated Mode Notice in Tab 3 */}
          {selectedLocationId === "ALL" && (
            <div className="bg-gradient-to-r from-amber-950/40 via-slate-900 to-indigo-950/40 border border-amber-500/30 p-3.5 rounded-2xl flex items-center gap-3 text-xs text-amber-300 shadow-md">
              <Building2 className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Consolidated Mall Audit Active:</strong> All branches are unified into a single stock pool. Missing consoles are only deducted if missing across the entire company.
              </span>
            </div>
          )}

          {/* Cross-Branch Relocations & Decision Panel */}
          {crossBranchSerialsList.length > 0 && selectedLocationId !== "ALL" && (
            <div className="bg-slate-900 border border-amber-500/30 p-5 rounded-2xl space-y-4 shadow-lg">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-850 pb-3">
                <div>
                  <h3 className="text-xs font-bold text-amber-300 flex items-center gap-2">
                    <ArrowRightLeft className="w-4 h-4 text-amber-400" />
                    <span>Inter-Branch Stock Movement Decisions ({crossBranchSerialsList.length} Units Found)</span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    These items are registered at another branch, but are physically lying on this shelf. Choose whether to keep or return each unit:
                  </p>
                </div>

                {/* Bulk action buttons */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const updated: Record<string, "TRANSFER_TO_DESTINATION" | "RETURN_TO_ORIGIN"> = {};
                      for (const cb of crossBranchSerialsList) {
                        updated[cb.serialNumber] = "TRANSFER_TO_DESTINATION";
                      }
                      setCrossBranchResolutions((prev) => ({ ...prev, ...updated }));
                    }}
                    className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30 rounded-lg text-[10px] font-bold transition"
                  >
                    All ➔ Keep Here
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const updated: Record<string, "TRANSFER_TO_DESTINATION" | "RETURN_TO_ORIGIN"> = {};
                      for (const cb of crossBranchSerialsList) {
                        updated[cb.serialNumber] = "RETURN_TO_ORIGIN";
                      }
                      setCrossBranchResolutions((prev) => ({ ...prev, ...updated }));
                    }}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-[10px] font-bold transition"
                  >
                    All ➔ Return to Origin
                  </button>
                </div>
              </div>

              <div className="space-y-2.5">
                {crossBranchSerialsList.map((cb, idx) => {
                  const currentAction = crossBranchResolutions[cb.serialNumber] || "TRANSFER_TO_DESTINATION";
                  const isKeep = currentAction === "TRANSFER_TO_DESTINATION";
                  const targetBranchName = locations.find((l) => l._id === selectedLocationId)?.name || "Current Branch";

                  return (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl border transition flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                        isKeep
                          ? "bg-slate-950 border-amber-500/30"
                          : "bg-slate-950 border-cyan-500/30"
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-slate-100">{cb.serialNumber}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                            {cb.product?.name || "Product"}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span>Registered at: <strong className="text-amber-400">{cb.fromLocationName}</strong></span>
                          <span>➔ Found on shelf at: <strong className="text-slate-200">{targetBranchName}</strong></span>
                        </div>
                      </div>

                      {/* Decision Toggle */}
                      <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
                        <button
                          type="button"
                          onClick={() => setResolutionForSerial(cb.serialNumber, "TRANSFER_TO_DESTINATION")}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                            isKeep
                              ? "bg-amber-600 text-white shadow-md shadow-amber-600/20"
                              : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
                          }`}
                        >
                          <span>🏢 Keep at {targetBranchName} (Auto-Transfer)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setResolutionForSerial(cb.serialNumber, "RETURN_TO_ORIGIN")}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                            !isKeep
                              ? "bg-cyan-600 text-white shadow-md shadow-cyan-600/20"
                              : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
                          }`}
                        >
                          <span>↩️ Return to {cb.fromLocationName}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Explanatory footer */}
              <div className="text-[11px] text-slate-400 bg-slate-950/60 p-3 rounded-xl border border-slate-850 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  <strong>Action details:</strong> Items marked <em>'Keep'</em> will be auto-transferred to this branch in the system upon approval. Items marked <em>'Return'</em> remain registered at their original branch in the database, flagged for physical return by store staff.
                </span>
              </div>
            </div>
          )}

          {/* Non-Serialized Variances Breakdown Table */}
          {nonSerializedVariances.filter((v) => v.variance !== 0).length > 0 && (
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <h3 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  Non-Serialized Inventory Discrepancies (
                  {nonSerializedVariances.filter((v) => v.variance !== 0).length} Products with Discrepancy)
                </h3>
                <span className="text-[11px] text-slate-400">
                  {totalMissingQty - missingSerialsList.length} Units Missing |{" "}
                  {totalSurplusQty - unregisteredSerialsList.length - reactivatedSerialsList.length} Units Surplus
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                      <th className="p-2.5">Product Name</th>
                      <th className="p-2.5">Condition</th>
                      <th className="p-2.5 text-right">System Stock</th>
                      <th className="p-2.5 text-right">Physical on Shelf</th>
                      <th className="p-2.5 text-right">Discrepancy (Variance)</th>
                      <th className="p-2.5 text-right">Unit Avg Cost</th>
                      <th className="p-2.5 text-right">Cost Delta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850/80">
                    {nonSerializedVariances
                      .filter((v) => v.variance !== 0)
                      .map((v) => (
                        <tr key={`${v.product?._id}_${v.condition}`} className="hover:bg-slate-850/40">
                          <td className="p-2.5 font-bold text-slate-200">
                            {v.product?.name}
                            <span className="text-[10px] font-mono text-slate-500 block">
                              SKU: {v.product?.sku}
                            </span>
                          </td>
                          <td className="p-2.5 text-slate-400">{v.condition}</td>
                          <td className="p-2.5 text-right font-mono text-slate-300">{v.systemQuantity}</td>
                          <td className="p-2.5 text-right font-mono font-bold text-slate-100">
                            {v.physicalQuantity}
                          </td>
                          <td className="p-2.5 text-right font-mono font-bold">
                            {v.variance < 0 ? (
                              <span className="text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                                {v.variance} Shortage (Sold)
                              </span>
                            ) : (
                              <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                +{v.variance} Surplus (Found)
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-right font-mono text-slate-400">
                            Rs. {v.unitCost.toLocaleString()}
                          </td>
                          <td
                            className={`p-2.5 text-right font-mono font-bold ${
                              v.costDelta < 0
                                ? "text-rose-400"
                                : v.costDelta > 0
                                ? "text-emerald-400"
                                : "text-slate-500"
                            }`}
                          >
                            {v.costDelta > 0
                              ? `+ Rs. ${v.costDelta.toLocaleString()}`
                              : `- Rs. ${Math.abs(v.costDelta).toLocaleString()}`}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Audit Notes & Submission Actions */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
            <h3 className="text-xs font-bold text-slate-200">Audit Notes & Resolution Comments</h3>
            <textarea
              rows={2}
              placeholder="e.g. Opening shelf stock count post-launch reconciliation by Store Manager"
              value={auditNotes}
              onChange={(e) => setAuditNotes(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
            />

            <div className="flex flex-col sm:flex-row justify-end items-center gap-3 pt-2">
              <button
                type="button"
                disabled={savingDraft || submittingAudit}
                onClick={handleSaveDraft}
                className="w-full sm:w-auto px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 text-xs font-bold rounded-xl border border-indigo-500/30 transition flex items-center justify-center gap-2"
              >
                <Clock className="w-4 h-4 text-indigo-400" />
                <span>{savingDraft ? "Saving Draft..." : "💾 Save Draft"}</span>
              </button>

              <button
                type="button"
                disabled={submittingAudit || savingDraft}
                onClick={() => handleExecuteAudit("SUBMIT_APPROVAL")}
                className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/20 transition flex items-center justify-center gap-2"
              >
                <span>📩 {submittingAudit ? "Submitting..." : "Submit for Admin Approval"}</span>
              </button>

              {isAdmin && (
                <button
                  type="button"
                  disabled={submittingAudit}
                  onClick={() => {
                    if (
                      confirm(
                        `Are you sure you want to DIRECTLY reconcile and update inventory for this branch?\n\nMissing items will be marked Sold and stock quantities will be updated.`
                      )
                    ) {
                      handleExecuteAudit("DIRECT_APPROVE");
                    }
                  }}
                  className="w-full sm:w-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/20 transition flex items-center justify-center gap-2"
                >
                  {submittingAudit ? (
                    <span>Processing Reconcile...</span>
                  ) : (
                    <span>⚡ Reconcile & Update Inventory Now</span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: AUDIT HISTORY */}
      {activeTab === "HISTORY" && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <h3 className="text-xs font-bold text-slate-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-400" />
              Past Shelf Stock Audit Runs
            </h3>
            <button
              onClick={fetchPastAudits}
              disabled={loadingPastAudits}
              className="text-xs text-indigo-400 hover:underline flex items-center gap-1"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingPastAudits ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {pastAudits.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              No audit sessions recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-850">
              {pastAudits.map((aud) => (
                <div key={aud._id} className="py-3.5 flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-slate-200">
                        #{aud.auditNumber}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          aud.status === "APPROVED"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : aud.status === "PENDING_APPROVAL"
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                            : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                        }`}
                      >
                        {aud.status}
                      </span>
                      <span className="text-xs font-semibold text-slate-300">
                        {aud.locationName}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span>By: <span className="text-slate-300">{aud.performedBy}</span></span>
                      <span>Created: {new Date(aud.createdAt).toLocaleDateString()} {new Date(aud.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {aud.updatedAt && (
                        <span className="text-cyan-400 font-medium">
                          Updated: {new Date(aud.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      )}
                      <span>
                        Missing: <span className="text-rose-400 font-bold">{aud.summary?.totalMissingUnits || 0}</span>
                      </span>
                      <span>
                        Surplus: <span className="text-emerald-400 font-bold">{aud.summary?.totalSurplusUnits || 0}</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-right">
                    <div>
                      <span className="font-mono font-bold text-xs text-slate-300 block">
                        Net: Rs. {Math.abs(aud.summary?.netCostDelta || 0).toLocaleString()}
                      </span>
                      {aud.approvedBy && (
                        <span className="text-[10px] text-emerald-400 block">
                          Approved by {aud.approvedBy}
                        </span>
                      )}
                    </div>

                    {aud.status === "DRAFT" && (
                      <button
                        onClick={() => handleResumeDraftFromHistory(aud)}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-md shadow-indigo-600/20 shrink-0"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                        <span>Resume Draft</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Camera Barcode Scanner Modal */}
      {cameraScannerOpen && (
        <CameraBarcodeScannerModal
          isOpen={cameraScannerOpen}
          onClose={() => setCameraScannerOpen(false)}
          onScanSuccess={(detectedCode) => {
            handleAddScannedSerial(detectedCode);
            setCameraScannerOpen(false);
          }}
        />
      )}
    </div>
  );
}
