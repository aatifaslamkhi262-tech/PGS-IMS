"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { PremiumCR80Card } from "@/components/PremiumCR80Card";
import {
  Printer,
  ArrowLeft,
  CheckSquare,
  Square,
  Layers,
  FileText,
  CreditCard,
} from "lucide-react";

interface Employee {
  _id: string;
  name: string;
  employeeCode: string;
  designation: string;
  photoUrl?: string;
  bloodGroup?: string;
  emergencyContactPhone?: string;
  phone?: string;
  location?: {
    name: string;
    code: string;
  };
}

interface CardItem {
  _id: string;
  cardUid: string;
  status: string;
  issueDate: string;
  employee?: Employee;
}

export default function BatchPrintCardsPage() {
  const [cards, setCards] = useState<CardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [cardSide, setCardSide] = useState<"BOTH" | "FRONT" | "BACK">("BOTH");
  const [layoutMode, setLayoutMode] = useState<"A4_GRID" | "CR80_PAGES">("A4_GRID");
  const [signatureUrl, setSignatureUrl] = useState<string>("");
  const [signatoryTitle, setSignatoryTitle] = useState<string>("AUTHORIZED SIGN");

  const fetchCards = async () => {
    try {
      setLoading(true);
      setError("");

      // Fetch dynamic signature
      try {
        const signRes = await fetch("/api/hr/cards/signature");
        const signJson = await signRes.json();
        if (signJson.success) {
          if (signJson.signatureDataUrl) setSignatureUrl(signJson.signatureDataUrl);
          if (signJson.signatoryTitle) setSignatoryTitle(signJson.signatoryTitle);
        }
      } catch {}

      const res = await fetch("/api/hr/cards?status=ACTIVE");
      const json = await res.json();
      if (json.success && json.data?.cards) {
        // Only keep cards that have a valid employee
        const validCards = (json.data.cards as CardItem[]).filter(
          (c) => c.employee && c.employee.name
        );
        // Sort by employeeCode
        validCards.sort((a, b) =>
          (a.employee?.employeeCode || "").localeCompare(
            b.employee?.employeeCode || ""
          )
        );
        setCards(validCards);
        // Default select cards with photos only (block cards missing photos)
        const printableUids = validCards
          .filter((c) => Boolean(c.employee?.photoUrl && c.employee.photoUrl.trim() !== ""))
          .map((c) => c.cardUid);
        setSelectedUids(printableUids);
      } else {
        setError(json.error || "Failed to load cards");
      }
    } catch (err: any) {
      setError(err.message || "Network error loading cards");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCards();
  }, []);

  const toggleSelect = (uid: string) => {
    const card = cards.find((c) => c.cardUid === uid);
    if (!card?.employee?.photoUrl) {
      alert("Print Blocked: Employee photo is missing. Official cards require a photo before printing.");
      return;
    }
    setSelectedUids((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const selectAll = () =>
    setSelectedUids(
      cards
        .filter((c) => Boolean(c.employee?.photoUrl && c.employee.photoUrl.trim() !== ""))
        .map((c) => c.cardUid)
    );
  const deselectAll = () => setSelectedUids([]);

  const handlePrint = () => {
    window.print();
  };

  const selectedCards = cards.filter((c) => selectedUids.includes(c.cardUid));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20">
      {/* Print CSS Rules */}
      <style>{`
        @media print {
          body {
            background: #ffffff !important;
            color: #000000 !important;
          }
          .no-print {
            display: none !important;
          }
          .print-container {
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
            background: #ffffff !important;
          }
          .card-box {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            box-shadow: none !important;
          }
          .page-break {
            page-break-after: always !important;
            break-after: page !important;
          }
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
        }
      `}</style>

      {/* Toolbar (Hidden on Print) */}
      <div className="no-print bg-slate-900 border-b border-slate-800 sticky top-0 z-40 shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Link
                href="/hr/cards"
                className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
                title="Back to Card Management"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div>
                <h1 className="text-base font-bold text-white flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-indigo-400" />
                  <span>Batch Employee Card Printing & Single PDF Export</span>
                </h1>
                <p className="text-xs text-slate-400">
                  Ek single PDF file mein tamam staff ke ID cards print karein (Printer wale ke liye).
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handlePrint}
                disabled={selectedCards.length === 0}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg transition"
              >
                <Printer className="w-4 h-4" />
                <span>Save Single PDF / Print ({selectedCards.length})</span>
              </button>
            </div>
          </div>

          {/* Controls Bar: Sides, Layout, & Selection */}
          <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            {/* Card Sides Switcher */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-semibold mr-1">Sides:</span>
              <div className="inline-flex rounded border border-slate-700 bg-slate-950 p-0.5">
                <button
                  type="button"
                  onClick={() => setCardSide("BOTH")}
                  className={`px-3 py-1 rounded text-xs font-semibold ${
                    cardSide === "BOTH"
                      ? "bg-indigo-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Both Sides (Front & Back)
                </button>
                <button
                  type="button"
                  onClick={() => setCardSide("FRONT")}
                  className={`px-3 py-1 rounded text-xs font-semibold ${
                    cardSide === "FRONT"
                      ? "bg-indigo-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Front Only
                </button>
                <button
                  type="button"
                  onClick={() => setCardSide("BACK")}
                  className={`px-3 py-1 rounded text-xs font-semibold ${
                    cardSide === "BACK"
                      ? "bg-indigo-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Back Only
                </button>
              </div>
            </div>

            {/* Layout Mode */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-semibold mr-1">Layout:</span>
              <div className="inline-flex rounded border border-slate-700 bg-slate-950 p-0.5">
                <button
                  type="button"
                  onClick={() => setLayoutMode("A4_GRID")}
                  className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1.5 ${
                    layoutMode === "A4_GRID"
                      ? "bg-indigo-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                  title="A4 Sheet grid with cut marks (Recommended for PVC sheet print shops)"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>A4 Sheet Grid (Cut Marks)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutMode("CR80_PAGES")}
                  className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1.5 ${
                    layoutMode === "CR80_PAGES"
                      ? "bg-indigo-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                  title="1 Card per page (For direct card printers)"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>1 Card Per Page</span>
                </button>
              </div>
            </div>

            {/* Selection Toggles */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
              >
                <CheckSquare className="w-3.5 h-3.5 text-indigo-400" />
                <span>Select All ({cards.length})</span>
              </button>
              <button
                type="button"
                onClick={deselectAll}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
              >
                <Square className="w-3.5 h-3.5 text-slate-400" />
                <span>Deselect All</span>
              </button>
            </div>
          </div>

          {/* Quick Staff Checklist Chips */}
          <div className="pt-2 border-t border-slate-800/80 flex flex-wrap gap-1.5">
            {cards.map((c) => {
              const isSelected = selectedUids.includes(c.cardUid);
              return (
                <button
                  key={c.cardUid}
                  type="button"
                  onClick={() => toggleSelect(c.cardUid)}
                  className={`px-2 py-1 rounded text-[11px] font-medium flex items-center gap-1.5 border transition ${
                    isSelected
                      ? "bg-indigo-950/80 border-indigo-600 text-indigo-200"
                      : "bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isSelected ? "bg-indigo-400" : "bg-slate-700"
                    }`}
                  />
                  <span>{c.employee?.name}</span>
                  <span className="text-[9px] font-mono opacity-70">
                    ({c.employee?.employeeCode})
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Printable Cards Container */}
      <div className="print-container max-w-6xl mx-auto px-4 py-8">
        {loading ? (
          <div className="text-center py-20 text-slate-400 text-sm">
            Loading active employee cards...
          </div>
        ) : error ? (
          <div className="p-4 rounded bg-rose-950 border border-rose-800 text-rose-200 text-sm text-center">
            ✕ {error}
          </div>
        ) : selectedCards.length === 0 ? (
          <div className="text-center py-20 text-slate-400 text-sm">
            Koi employee card select nahi kiya gaya. Upar se employee select karein.
          </div>
        ) : layoutMode === "A4_GRID" ? (
          /* A4 Sheet Grid Layout (With Cutting Lines) */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:grid-cols-2 print:gap-4">
            {selectedCards.map((c) => (
              <div
                key={c.cardUid}
                className="card-box p-3 bg-slate-900 print:bg-white rounded-2xl border-2 border-dashed border-slate-700 print:border-slate-300 relative"
                style={{ breakInside: "avoid", pageBreakInside: "avoid" }}
              >
                {/* Cutting Line Badge */}
                <div className="no-print absolute top-1 right-2 text-[9px] font-mono text-slate-400 uppercase">
                  ✂ Cut Guide · {c.employee?.employeeCode}
                </div>
                <PremiumCR80Card
                  card={c}
                  side={cardSide}
                  signatureUrl={signatureUrl}
                  signatoryTitle={signatoryTitle}
                />
              </div>
            ))}
          </div>
        ) : (
          /* Continuous CR80 Mode: 1 Card / 1 Pair per Page */
          <div className="space-y-8">
            {selectedCards.map((c, idx) => (
              <div
                key={c.cardUid}
                className={`card-box max-w-[380px] mx-auto ${
                  idx < selectedCards.length - 1 ? "page-break" : ""
                }`}
              >
                <PremiumCR80Card
                  card={c}
                  side={cardSide}
                  signatureUrl={signatureUrl}
                  signatoryTitle={signatoryTitle}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

