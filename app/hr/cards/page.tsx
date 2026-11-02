"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { HRSubNav } from "@/components/HRSubNav";
import { PremiumCR80Card } from "@/components/PremiumCR80Card";
import JsBarcode from "jsbarcode";
import {
  CreditCard,
  Plus,
  Ban,
  Printer,
  Copy,
  Check,
  RefreshCw,
  ShoppingBag,
  Camera,
  UserPlus,
  FileDown,
  PenTool,
  Upload,
  Eraser,
  Sparkles,
} from "lucide-react";

function resizeCardPhotoToDataUrl(
  file: File,
  maxSize: number = 280
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width;
        let h = img.height;
        if (w > h) {
          if (w > maxSize) {
            h = Math.round((h * maxSize) / w);
            w = maxSize;
          }
        } else {
          if (h > maxSize) {
            w = Math.round((w * maxSize) / h);
            h = maxSize;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        } else {
          reject(new Error("Canvas context unavailable"));
        }
      };
      img.onerror = reject;
      img.src = ev.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function HRCardsPage() {
  const [cards, setCards] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copiedUid, setCopiedUid] = useState<string | null>(null);

  // Issue / Replace Modal
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [replacementReason, setReplacementReason] = useState("INITIAL");
  const [replacementNotes, setReplacementNotes] = useState("");
  const [replacementFee, setReplacementFee] = useState("0");
  const [feeSettlementMode, setFeeSettlementMode] = useState("NONE");
  const [expiryDate, setExpiryDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Block Card Modal
  const [blockingCard, setBlockingCard] = useState<any | null>(null);
  const [blockReason, setBlockReason] = useState("Reported Lost by Employee");

  // Card Print Preview Modal (CR80)
  const [previewCard, setPreviewCard] = useState<any | null>(null);
  const [cardSide, setCardSide] = useState<"FRONT" | "BACK" | "BOTH">("FRONT");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const barcodeSvgRef = useRef<SVGSVGElement>(null);

  // Authorized Signature Modal State
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState<string>("");
  const [signatoryTitle, setSignatoryTitle] = useState<string>("AUTHORIZED SIGN");
  const [signatureMode, setSignatureMode] = useState<"DRAW" | "UPLOAD">("DRAW");
  const [strokeColor, setStrokeColor] = useState<string>("#FFFFFF");
  const [savingSignature, setSavingSignature] = useState(false);
  const [uploadedSignatureUrl, setUploadedSignatureUrl] = useState<string | null>(null);
  const [signatureMeta, setSignatureMeta] = useState<{ updatedBy?: string; updatedAt?: string } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawing = useRef<boolean>(false);
  const hasDrawn = useRef<boolean>(false);

  const fetchSignature = async () => {
    try {
      const res = await fetch("/api/hr/cards/signature");
      const json = await res.json();
      if (json.success) {
        if (json.signatureDataUrl) setSignatureUrl(json.signatureDataUrl);
        if (json.signatoryTitle) setSignatoryTitle(json.signatoryTitle);
        if (json.updatedAt) {
          setSignatureMeta({
            updatedBy: json.updatedBy || "Admin",
            updatedAt: new Date(json.updatedAt).toLocaleDateString("en-PK", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            }),
          });
        }
      }
    } catch (err) {
      console.warn("Could not load signature:", err);
    }
  };

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      const touch = e.touches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    isDrawing.current = true;
    hasDrawn.current = true;
    const { x, y } = getCanvasCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = strokeColor;
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getCanvasCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    isDrawing.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawn.current = false;
  };

  const handleUploadSignatureFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setUploadedSignatureUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveSignature = async () => {
    try {
      setSavingSignature(true);
      setError("");
      setMessage("");

      let finalDataUrl = "";
      if (signatureMode === "DRAW") {
        const canvas = canvasRef.current;
        if (!canvas || !hasDrawn.current) {
          setError("Please draw your signature first or switch to upload tab.");
          setSavingSignature(false);
          return;
        }
        finalDataUrl = canvas.toDataURL("image/png");
      } else {
        if (!uploadedSignatureUrl) {
          setError("Please select an image file for signature.");
          setSavingSignature(false);
          return;
        }
        finalDataUrl = uploadedSignatureUrl;
      }

      const res = await fetch("/api/hr/cards/signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signatureDataUrl: finalDataUrl,
          signatoryTitle: signatoryTitle.trim() || "AUTHORIZED SIGN",
        }),
      });

      const json = await res.json();
      if (json.success) {
        setSignatureUrl(finalDataUrl);
        setMessage("Official signature updated successfully!");
        setShowSignatureModal(false);
        setUploadedSignatureUrl(null);
        clearCanvas();
        fetchSignature();
      } else {
        setError(json.error || "Failed to save signature");
      }
    } catch (err: any) {
      setError(err.message || "Failed to save signature");
    } finally {
      setSavingSignature(false);
    }
  };

  const fetchCards = async () => {
    try {
      setLoading(true);
      setError("");
      const url = statusFilter
        ? `/api/hr/cards?status=${encodeURIComponent(statusFilter)}`
        : "/api/hr/cards";
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setCards(json.data.cards || []);
        setEmployees(json.data.employees || []);
      } else {
        setError(json.error || "Failed to load cards");
      }
    } catch (err: any) {
      setError(err.message || "Network error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCards();
    fetchSignature();
  }, [statusFilter]);

  useEffect(() => {
    if (!previewCard?.cardUid) return;

    const renderBarcode = () => {
      if (barcodeSvgRef.current) {
        try {
          JsBarcode(barcodeSvgRef.current, previewCard.cardUid, {
            format: "CODE128",
            width: 2,
            height: 46,
            displayValue: false,
            margin: 4,
            background: "#ffffff",
            lineColor: "#000000",
          });
        } catch (e) {
          console.error("Barcode rendering error:", e);
        }
      }
    };

    renderBarcode();
    const timer = setTimeout(renderBarcode, 50);
    return () => clearTimeout(timer);
  }, [previewCard, cardSide]);

  const handleCopyUid = (uid: string) => {
    navigator.clipboard.writeText(uid);
    setCopiedUid(uid);
    setTimeout(() => setCopiedUid(null), 1800);
  };

  const handlePhotoUploadOnCard = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    const empId = previewCard?.employee?._id;
    if (!file || !empId) return;

    try {
      setUploadingPhoto(true);
      const dataUrl = await resizeCardPhotoToDataUrl(file, 280);
      const res = await fetch(`/api/hr/employees/${empId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photoUrl: dataUrl,
          reason: "Updated employee photo for ID card",
        }),
      });
      const json = await res.json();
      if (json.success) {
        setPreviewCard((prev: any) =>
          prev
            ? {
                ...prev,
                employee: { ...prev.employee, photoUrl: dataUrl },
              }
            : null
        );
        fetchCards();
      }
    } catch (err) {
      console.error("Failed to update card photo:", err);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleIssueOrReplace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeId) return;

    try {
      setSubmitting(true);
      setError("");
      setMessage("");
      const res = await fetch("/api/hr/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ISSUE",
          employeeId: selectedEmployeeId,
          replacementReason,
          replacementNotes,
          replacementFee: Number(replacementFee) || 0,
          feeSettlementMode,
          expiryDate: expiryDate || null,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage(json.message);
        setShowIssueModal(false);
        fetchCards();
      } else {
        setError(json.error || "Failed to issue card");
      }
    } catch (err: any) {
      setError(err.message || "Failed to issue card");
    } finally {
      setSubmitting(false);
    }
  };

  const handleBlockCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blockingCard) return;

    try {
      setSubmitting(true);
      setError("");
      setMessage("");
      const res = await fetch("/api/hr/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "BLOCK",
          cardId: blockingCard._id,
          blockReason: blockReason.trim() || "Blocked by HR",
        }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage(json.message);
        setBlockingCard(null);
        fetchCards();
      } else {
        setError(json.error || "Failed to block card");
      }
    } catch (err: any) {
      setError(err.message || "Failed to block card");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`space-y-5 ${previewCard ? "print:hidden" : ""}`}>
      <HRSubNav />

      {/* Top Action Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-300">
            Filter Card Status:
          </span>
          {["", "ACTIVE", "BLOCKED", "REPLACED_LOST", "EXPIRED"].map((st) => (
            <button
              key={st || "ALL"}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded text-xs font-semibold border ${
                statusFilter === st
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800"
              }`}
            >
              {st ? st.replace("_", " ") : "All Cards"}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setShowSignatureModal(true);
              setTimeout(() => clearCanvas(), 100);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shrink-0 shadow-sm transition"
            title="Configure Admin / Authorized Signature on all employee cards"
          >
            <PenTool className="w-4 h-4" />
            <span>Authorized Signature</span>
          </button>

          <Link
            href="/hr/cards/batch-print"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shrink-0 shadow-sm transition"
          >
            <Printer className="w-4 h-4" />
            <span>Batch Print Cards (Single PDF)</span>
          </Link>

          <button
            onClick={() => {
              setSelectedEmployeeId(employees[0]?._id || "");
              setReplacementReason("INITIAL");
              setReplacementNotes("");
              setReplacementFee("0");
              setFeeSettlementMode("NONE");
              setExpiryDate("");
              setShowIssueModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Issue / Replace Employee Card</span>
          </button>
        </div>
      </div>

      {employees.length === 0 && !loading && (
        <div className="bg-slate-900 border border-indigo-700/70 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-bold text-indigo-400 uppercase">
              No HR Employees Registered Yet
            </h3>
            <p className="text-xs text-slate-300 mt-0.5">
              Go to Staff & Duty Rules to import your existing Salesmen / Users in 1 click or add a new staff member. Cards are automatically issued upon import!
            </p>
          </div>
          <Link
            href="/hr/employees"
            className="px-3.5 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shrink-0 inline-flex items-center gap-1.5"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Go to Staff & Import Users →</span>
          </Link>
        </div>
      )}

      {message && (
        <div className="p-3 rounded bg-emerald-950 border border-emerald-800 text-emerald-200 text-xs font-medium">
          ✓ {message}
        </div>
      )}

      {error && (
        <div className="p-3 rounded bg-rose-950 border border-rose-800 text-rose-200 text-xs font-medium">
          ✕ {error}
        </div>
      )}

      {/* Cards Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-xs text-slate-400">
            Loading employee cards...
          </div>
        ) : cards.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-400">
            No cards found for the selected filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-3">Card UID (Barcode)</th>
                  <th className="py-3 px-3">Employee</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Issued On / By</th>
                  <th className="py-3 px-3">Reason / Replacement Info</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {cards.map((c) => {
                  const emp = c.employee;
                  return (
                    <tr key={c._id} className="hover:bg-slate-800/40">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-100 text-xs">
                            {c.cardUid}
                          </span>
                          <button
                            onClick={() => handleCopyUid(c.cardUid)}
                            title="Copy Card UID for Kiosk scan test"
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                          >
                            {copiedUid === c.cardUid ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2.5">
                          {emp?.photoUrl ? (
                            <img
                              src={emp.photoUrl}
                              alt={emp.name}
                              className="w-8 h-8 rounded-lg object-cover border border-slate-700 shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">
                              {(emp?.name || "S").charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="font-bold text-slate-100">
                              {emp?.name || "Unknown"}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {emp?.employeeCode} · {emp?.designation}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            c.status === "ACTIVE"
                              ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                              : c.status === "REPLACED_LOST" ||
                                c.status === "BLOCKED"
                              ? "bg-rose-950 text-rose-300 border-rose-800"
                              : "bg-amber-950 text-amber-300 border-amber-800"
                          }`}
                        >
                          {c.status}
                        </span>
                        {c.blockedAt && (
                          <div className="text-[10px] text-rose-400 mt-0.5">
                            Blocked:{" "}
                            {new Date(c.blockedAt).toLocaleDateString("en-PK")}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        <div>
                          {new Date(c.issueDate).toLocaleDateString("en-PK", {
                            year: "numeric",
                            month: "short",
                            day: "2-digit",
                          })}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          By: {c.issuedByName || "HR"}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-medium text-slate-200">
                          {c.replacementReason}
                          {c.replacementFee > 0 &&
                            ` · Fee: Rs. ${c.replacementFee} (${c.feeSettlementMode})`}
                        </div>
                        {c.blockReason && (
                          <div className="text-[11px] text-rose-400">
                            {c.blockReason}
                          </div>
                        )}
                        {c.replacedByCardUid && (
                          <div className="text-[11px] text-slate-400 font-mono">
                            Replaced by: {c.replacedByCardUid}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => setPreviewCard(c)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
                          >
                            <Printer className="w-3 h-3" />
                            <span>View / Print Card</span>
                          </button>

                          {c.status === "ACTIVE" && (
                            <>
                              <button
                                onClick={() => {
                                  setSelectedEmployeeId(emp?._id || "");
                                  setReplacementReason("LOST");
                                  setReplacementNotes(
                                    `Replaced ${c.cardUid}`
                                  );
                                  setReplacementFee("200");
                                  setFeeSettlementMode("CASH");
                                  setShowIssueModal(true);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-xs font-semibold"
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span>Replace</span>
                              </button>

                              <button
                                onClick={() => {
                                  setBlockingCard(c);
                                  setBlockReason("Lost card reported by staff");
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 text-xs font-semibold"
                              >
                                <Ban className="w-3 h-3" />
                                <span>Block</span>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Issue / Replace Card Modal */}
      {showIssueModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-md w-full p-5 space-y-4">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-blue-400" />
              <span>Issue or Replace Employee Card</span>
            </h3>
            <p className="text-xs text-slate-400">
              Rule: Issuing a new card automatically blocks any previous active card for this employee in the same transaction.
            </p>

            {employees.length === 0 ? (
              <div className="p-4 rounded bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-3">
                <p>
                  No employees found yet. Please import your existing Users or register a staff member first.
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowIssueModal(false)}
                    className="px-3 py-1.5 rounded bg-slate-800 text-slate-300"
                  >
                    Close
                  </button>
                  <Link
                    href="/hr/employees"
                    className="px-3.5 py-1.5 rounded bg-indigo-600 text-white font-bold"
                  >
                    Go to Staff & Import Users →
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleIssueOrReplace} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Select Employee *
                  </label>
                  <select
                    required
                    value={selectedEmployeeId}
                    onChange={(e) => setSelectedEmployeeId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-100"
                  >
                    <option value="">-- Choose Employee --</option>
                    {employees.map((emp) => (
                      <option key={emp._id} value={emp._id}>
                        {emp.name} ({emp.employeeCode}){" "}
                        {emp.activeCardUid
                          ? `— Current: ${emp.activeCardUid}`
                          : "— No Active Card"}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Issue / Replacement Reason
                  </label>
                  <select
                    value={replacementReason}
                    onChange={(e) => setReplacementReason(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-100"
                  >
                    <option value="INITIAL">Initial Card Issue</option>
                    <option value="LOST">Lost Card Replacement</option>
                    <option value="DAMAGED">Damaged Card Replacement</option>
                    <option value="NAME_CHANGE">Designation / Name Change</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Replacement Fee (PKR)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={replacementFee}
                      onChange={(e) => setReplacementFee(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Fee Mode
                    </label>
                    <select
                      value={feeSettlementMode}
                      onChange={(e) => setFeeSettlementMode(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-100"
                    >
                      <option value="NONE">No Fee</option>
                      <option value="CASH">Cash Receipt</option>
                      <option value="PAYROLL_DEDUCTION">
                        Payroll Deduction
                      </option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Expiry Date (Optional — blank means no expiry)
                  </label>
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Audit Note / Reason
                  </label>
                  <input
                    type="text"
                    value={replacementNotes}
                    onChange={(e) => setReplacementNotes(e.target.value)}
                    placeholder="e.g. Old card lost in market"
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-100"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowIssueModal(false)}
                    className="px-4 py-2 rounded bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold"
                  >
                    {submitting ? "Issuing..." : "Generate & Issue Card"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Block Card Modal */}
      {blockingCard && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-md w-full p-5 space-y-4">
            <h3 className="text-base font-bold text-rose-400">
              Block Card — {blockingCard.cardUid}
            </h3>
            <p className="text-xs text-slate-300">
              If this card is scanned at the gate kiosk after blocking, the guard will see a solid RED alarm screen to confiscate the card.
            </p>
            <form onSubmit={handleBlockCard} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Block Reason *
                </label>
                <input
                  type="text"
                  required
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-100"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setBlockingCard(null)}
                  className="px-4 py-2 rounded bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
                >
                  {submitting ? "Blocking..." : "Confirm Block Card"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CR80 PVC Card Preview Modal with Navbar Logo, Color Header & Employee Photo */}
      {previewCard && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 card-print-modal-backdrop">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-5 space-y-4 card-print-modal-content">
            <div className="no-print flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div>
                <h3 className="text-sm font-bold text-slate-100">
                  Employee ID Card (CR80 PVC · 85.6mm × 53.98mm)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Official branded PVC card with photo, emergency info & barcode
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded border border-slate-700 overflow-hidden bg-slate-950">
                  <button
                    type="button"
                    onClick={() => setCardSide("FRONT")}
                    className={`px-2.5 py-1 text-xs font-semibold ${
                      cardSide === "FRONT"
                        ? "bg-indigo-600 text-white"
                        : "text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    Front
                  </button>
                  <button
                    type="button"
                    onClick={() => setCardSide("BACK")}
                    className={`px-2.5 py-1 text-xs font-semibold ${
                      cardSide === "BACK"
                        ? "bg-indigo-600 text-white"
                        : "text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => setCardSide("BOTH")}
                    className={`px-2.5 py-1 text-xs font-semibold ${
                      cardSide === "BOTH"
                        ? "bg-indigo-600 text-white"
                        : "text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    Both Sides
                  </button>
                </div>

                <button
                  onClick={() => setPreviewCard(null)}
                  className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1"
                >
                  ✕ Close
                </button>
              </div>
            </div>

            {/* Print Stylesheet for Single CR80 PVC Card */}
            <style>{`
              @media print {
                html, body {
                  background: transparent !important;
                  margin: 0 !important;
                  padding: 0 !important;
                  width: 85.6mm !important;
                  height: auto !important;
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }
                .no-print,
                .print\\:hidden {
                  display: none !important;
                }
                .card-print-modal-backdrop {
                  position: static !important;
                  background: transparent !important;
                  padding: 0 !important;
                  margin: 0 !important;
                  inset: auto !important;
                  display: block !important;
                }
                .card-print-modal-content {
                  background: transparent !important;
                  border: none !important;
                  box-shadow: none !important;
                  padding: 0 !important;
                  margin: 0 !important;
                  max-width: 100% !important;
                  display: block !important;
                }
                #printable-cr80-card {
                  display: block !important;
                  width: 85.6mm !important;
                  max-width: 85.6mm !important;
                  margin: 0 auto !important;
                  box-shadow: none !important;
                  page-break-inside: avoid !important;
                  break-inside: avoid !important;
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }
                @page {
                  size: 85.6mm 54mm;
                  margin: 0mm !important;
                }
              }
            `}</style>

            {/* Cards Container */}
            <div id="printable-cr80-card" className="mx-auto w-full max-w-[380px]">
              <PremiumCR80Card
                card={previewCard}
                side={cardSide}
                signatureUrl={signatureUrl}
                signatoryTitle={signatoryTitle}
              />
            </div>

            {/* Photo Missing Warning */}
            {!previewCard.employee?.photoUrl && (
              <div className="no-print p-2.5 rounded bg-rose-950/90 border border-rose-500/60 text-rose-200 text-xs flex items-center justify-between gap-2 shadow-xs">
                <span>⚠️ Employee photo is required. Card print is blocked until photo is uploaded.</span>
                <label className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] cursor-pointer inline-flex items-center gap-1 shrink-0">
                  <Camera className="w-3 h-3" />
                  <span>Upload Now</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUploadOnCard}
                    className="hidden"
                  />
                </label>
              </div>
            )}

            {/* Bottom Controls: Upload Photo on the Spot, Copy UID, or Print */}
            <div className="no-print flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
              <div className="flex items-center gap-2">
                <label className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 cursor-pointer inline-flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-indigo-400" />
                  <span>
                    {uploadingPhoto
                      ? "Saving..."
                      : previewCard.employee?.photoUrl
                      ? "Change Photo"
                      : "Upload Photo"}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUploadOnCard}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => handleCopyUid(previewCard.cardUid)}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700"
                >
                  {copiedUid === previewCard.cardUid
                    ? "✓ UID Copied"
                    : "Copy UID"}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={`/api/hr/cards/pdf?cardUid=${encodeURIComponent(previewCard.cardUid)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`px-3.5 py-1.5 rounded text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
                    previewCard.employee?.photoUrl
                      ? "bg-emerald-600 hover:bg-emerald-500 cursor-pointer shadow-sm"
                      : "bg-slate-700 opacity-50 pointer-events-none"
                  }`}
                  title="Download clean production PDF to share on WhatsApp or with print shop"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </a>

                <button
                  type="button"
                  disabled={!previewCard.employee?.photoUrl}
                  onClick={() => {
                    if (!previewCard.employee?.photoUrl) return;
                    window.print();
                  }}
                  className={`px-4 py-1.5 rounded text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
                    previewCard.employee?.photoUrl
                      ? "bg-indigo-600 hover:bg-indigo-500 cursor-pointer"
                      : "bg-slate-700 opacity-50 cursor-not-allowed"
                  }`}
                  title={
                    !previewCard.employee?.photoUrl
                      ? "Photo required before card can be printed"
                      : "Print CR80 Card"
                  }
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>
                    {previewCard.employee?.photoUrl
                      ? "Print Dialog"
                      : "Photo Required"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Authorized Signature Management Modal */}
      {showSignatureModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-purple-500/50 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl relative">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
                  <PenTool className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    Authorized Card Signature
                    <span className="text-[10px] bg-purple-950 border border-purple-500/50 text-purple-300 px-1.5 py-0.5 rounded font-mono">
                      CR80 15x7.2mm
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    This official signature appears on the back of all employee ID cards.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSignatureModal(false)}
                className="text-slate-400 hover:text-white text-sm p-1"
              >
                ✕
              </button>
            </div>

            {/* Current Active Signature Preview Box */}
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-cyan-400" />
                  Currently Active Signature
                </span>
                {signatureMeta && (
                  <span className="text-[10px] text-slate-400 font-mono">
                    Updated: {signatureMeta.updatedAt} by {signatureMeta.updatedBy}
                  </span>
                )}
              </div>
              <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-dashed border-slate-700 rounded p-2 flex items-center justify-center min-h-[50px]">
                {signatureUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={signatureUrl}
                    alt="Active Signature"
                    className="max-h-[46px] max-w-[180px] object-contain drop-shadow"
                  />
                ) : (
                  <span className="text-xs text-slate-400 italic">
                    No custom signature set yet (Using default)
                  </span>
                )}
              </div>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setSignatureMode("DRAW")}
                className={`flex-1 py-1.5 rounded text-center transition flex items-center justify-center gap-1.5 ${
                  signatureMode === "DRAW"
                    ? "bg-purple-600 text-white shadow-xs"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <PenTool className="w-3.5 h-3.5" />
                <span>✍️ Draw on Screen (Touch / Mouse)</span>
              </button>
              <button
                type="button"
                onClick={() => setSignatureMode("UPLOAD")}
                className={`flex-1 py-1.5 rounded text-center transition flex items-center justify-center gap-1.5 ${
                  signatureMode === "UPLOAD"
                    ? "bg-purple-600 text-white shadow-xs"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>📁 Upload Image File</span>
              </button>
            </div>

            {/* TAB 1: DRAW CANVAS */}
            {signatureMode === "DRAW" ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">Ink Color:</span>
                    <button
                      type="button"
                      onClick={() => setStrokeColor("#FFFFFF")}
                      className={`w-5 h-5 rounded-full bg-white border-2 transition ${
                        strokeColor === "#FFFFFF" ? "border-cyan-400 scale-110" : "border-slate-600"
                      }`}
                      title="Crisp White"
                    />
                    <button
                      type="button"
                      onClick={() => setStrokeColor("#00F0FF")}
                      className={`w-5 h-5 rounded-full bg-[#00F0FF] border-2 transition ${
                        strokeColor === "#00F0FF" ? "border-white scale-110" : "border-slate-600"
                      }`}
                      title="Neon Cyan"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={clearCanvas}
                    className="text-[11px] text-rose-400 hover:text-rose-300 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950/40 border border-rose-800/60"
                  >
                    <Eraser className="w-3 h-3" />
                    <span>Clear Canvas</span>
                  </button>
                </div>

                <div className="relative border-2 border-dashed border-purple-500/50 rounded-lg bg-slate-950 overflow-hidden cursor-crosshair">
                  <canvas
                    ref={canvasRef}
                    width={440}
                    height={140}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    className="w-full h-[140px] block touch-none"
                  />
                  <div className="pointer-events-none absolute bottom-1 right-2 text-[9px] text-slate-400 font-mono">
                    Touch & Draw Signature Here
                  </div>
                </div>
              </div>
            ) : (
              /* TAB 2: UPLOAD IMAGE */
              <div className="space-y-2">
                <div className="border-2 border-dashed border-slate-700 hover:border-purple-500 rounded-lg p-5 text-center bg-slate-950 transition">
                  <input
                    type="file"
                    id="signatureFileInput"
                    accept="image/png,image/jpeg,image/svg+xml"
                    onChange={handleUploadSignatureFile}
                    className="hidden"
                  />
                  <label
                    htmlFor="signatureFileInput"
                    className="cursor-pointer flex flex-col items-center justify-center space-y-2"
                  >
                    <div className="w-10 h-10 rounded-full bg-purple-950/70 border border-purple-500/40 flex items-center justify-center text-purple-300">
                      <Upload className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-semibold text-slate-200">
                      Click to choose signature image (PNG, JPG, SVG)
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Recommended: Transparent background PNG with dark ink or white ink
                    </span>
                  </label>
                </div>

                {uploadedSignatureUrl && (
                  <div className="p-2.5 rounded bg-slate-950 border border-emerald-500/40 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-emerald-400 font-bold uppercase">Image Selected:</span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={uploadedSignatureUrl}
                        alt="Selected signature"
                        className="max-h-[36px] max-w-[120px] object-contain bg-slate-900 px-2 py-0.5 rounded"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setUploadedSignatureUrl(null)}
                      className="text-rose-400 hover:text-rose-300 text-xs px-2"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Signatory Title Field */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Signatory Label Under Box
              </label>
              <input
                type="text"
                value={signatoryTitle}
                onChange={(e) => setSignatoryTitle(e.target.value.toUpperCase())}
                placeholder="AUTHORIZED SIGN"
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-100 font-mono uppercase focus:border-purple-500 focus:outline-none"
              />
              <span className="text-[10px] text-slate-400">
                Printed right underneath the signature box (e.g. AUTHORIZED SIGN, CEO SIGN, HR MANAGER)
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowSignatureModal(false)}
                className="px-3.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingSignature}
                onClick={handleSaveSignature}
                className="px-4 py-1.5 rounded bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{savingSignature ? "Saving..." : "Save Signature"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
