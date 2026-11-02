"use client";

import React, { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

export interface PremiumCardData {
  cardUid: string;
  issueDate?: string | Date;
  expiryDate?: string | Date | null;
  status?: string;
  employee?: {
    _id?: string;
    name: string;
    employeeCode: string;
    designation: string;
    photoUrl?: string;
    bloodGroup?: string;
    emergencyContactPhone?: string;
    emergencyContactName?: string;
    phone?: string;
    location?: {
      name: string;
      code?: string;
    } | string;
  };
}

interface PremiumCR80CardProps {
  card: PremiumCardData;
  side: "FRONT" | "BACK" | "BOTH";
  className?: string;
  signatureUrl?: string;
  signatoryTitle?: string;
}

export function PremiumCR80Card({
  card,
  side,
  className = "",
  signatureUrl,
  signatoryTitle = "AUTHORIZED SIGN",
}: PremiumCR80CardProps) {
  const barcodeRefBack = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!card.cardUid) return;
    if (barcodeRefBack.current && (side === "BACK" || side === "BOTH")) {
      try {
        JsBarcode(barcodeRefBack.current, card.cardUid, {
          format: "CODE128",
          width: 1.4,
          height: 14,
          displayValue: false,
          margin: 0,
          background: "#ffffff",
          lineColor: "#000000",
        });
      } catch (e) {
        console.error("Barcode render error:", e);
      }
    }
  }, [card.cardUid, side]);

  const emp = card.employee;

  const issueDateObj = card.issueDate ? new Date(card.issueDate) : new Date("2026-10-29");
  const issueDateFormatted = issueDateObj.toLocaleDateString("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  // Valid Till: card expiry or Issue Date + 1 Year
  const expiryDateObj = card.expiryDate
    ? new Date(card.expiryDate)
    : new Date(issueDateObj.getTime() + 365 * 24 * 60 * 60 * 1000);
  const validTillFormatted = expiryDateObj.toLocaleDateString("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  // Role Color Band Logic (Esports theme)
  const designationUpper = (emp?.designation || "STAFF").toUpperCase();
  const isRoleAdmin = designationUpper.includes("ADMIN");
  const isRoleManager = designationUpper.includes("MANAGER");

  const roleBandBg = isRoleAdmin
    ? "#7B2FF7" // Brand Purple
    : isRoleManager
    ? "#2563EB" // Electric Blue
    : "#FFD400"; // Brand Yellow

  const roleTextColor = isRoleAdmin || isRoleManager ? "#ffffff" : "#0a0a0a";

  return (
    <div className={`space-y-4 print:space-y-0 ${className}`}>
      {/* Strict CR80 85.6mm x 54mm Print Styles & Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@600;700;800&family=Inter:wght@400;600;700;900&family=JetBrains+Mono:wght@700;800&display=swap');

        .cr80-card-frame {
          width: 85.6mm;
          height: 54mm;
          min-width: 85.6mm;
          min-height: 54mm;
          max-width: 85.6mm;
          max-height: 54mm;
          box-sizing: border-box;
          position: relative;
          overflow: hidden;
          border-radius: 3.18mm;
        }

        .angled-frame-outer {
          clip-path: polygon(0 0, 100% 0, 100% calc(100% - 6mm), calc(100% - 6mm) 100%, 0 100%);
          background: linear-gradient(135deg, #7B2FF7 0%, #00F0FF 45%, #FFD400 100%);
          padding: 0.6mm;
          box-sizing: border-box;
        }

        .angled-frame-inner {
          clip-path: polygon(0 0, 100% 0, 100% calc(100% - 5.7mm), calc(100% - 5.7mm) 100%, 0 100%);
          width: 100%;
          height: 100%;
          background: #070a16;
          overflow: hidden;
          position: relative;
        }

        .name-esports-text {
          font-family: 'Rajdhani', sans-serif;
          text-transform: uppercase;
          font-weight: 800;
          line-height: 0.9;
          letter-spacing: 0.02em;
        }

        @media print {
          @page {
            size: 85.6mm 54mm;
            margin: 0mm !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }
          .no-print {
            display: none !important;
          }
          .cr80-print-card {
            width: 85.6mm !important;
            height: 54mm !important;
            min-width: 85.6mm !important;
            min-height: 54mm !important;
            max-width: 85.6mm !important;
            max-height: 54mm !important;
            margin: 0 auto !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: always !important;
            break-after: page !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      {/* ===================== FRONT SIDE ===================== */}
      {(side === "FRONT" || side === "BOTH") && (
        <div
          className="cr80-print-card cr80-card-frame relative mx-auto text-white shadow-xl"
          style={{
            background: "linear-gradient(135deg, #050814 0%, #0a0f26 50%, #050712 100%)",
            boxShadow: "0 15px 35px -8px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(123, 47, 247, 0.35)",
            WebkitPrintColorAdjust: "exact",
            printColorAdjust: "exact",
          }}
        >
          {/* Angled Neon Accent Stripes across background */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "linear-gradient(125deg, transparent 36%, rgba(123, 47, 247, 0.15) 40%, rgba(0, 240, 255, 0.35) 44%, rgba(255, 212, 0, 0.22) 47%, transparent 50%)",
            }}
          />

          {/* Corner Cyber Wave Artwork (30% Opacity) */}
          <div
            className="absolute right-0 bottom-0 w-[52mm] h-[42mm] pointer-events-none opacity-30 bg-contain bg-no-repeat bg-right-bottom"
            style={{ backgroundImage: "url('/card/front-bg.png')" }}
          />

          {/* 3.2mm Safe Margin Inner Container */}
          <div
            className="relative z-10 w-full h-full flex items-center justify-between"
            style={{ padding: "3.2mm" }}
          >
            {/* 1. LEFT: Big Photo (~34x46.8mm) with 0.6mm Purple+Yellow Neon Gradient Angled Cut Frame */}
            <div className="angled-frame-outer shrink-0" style={{ width: "34mm", height: "46.8mm" }}>
              <div className="angled-frame-inner">
                {emp?.photoUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={emp.photoUrl}
                    alt={emp.name}
                    className="w-full h-full object-cover block"
                  />
                ) : (
                  <div className="w-full h-full bg-rose-950/85 border border-rose-500/70 flex flex-col items-center justify-center p-1 text-center">
                    <span className="text-[4.5pt] font-black uppercase text-rose-300 leading-tight">
                      NO PHOTO
                    </span>
                    <span className="text-[3.8pt] font-black uppercase text-rose-400 leading-none mt-0.5">
                      PRINT BLOCKED
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* 2, 3, 4. RIGHT COLUMN: Logo Top-Right, Big Name, Role Solid Band, EMP Code (SIRF YEH 4 CHEEZEIN) */}
            <div className="flex-1 h-full pl-3.5 flex flex-col justify-between items-start text-left py-0.5">
              {/* Top-Right: Logo (~24x15mm, transparent, crisp) */}
              <div className="w-full flex justify-end">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/card/logo-trimmed.png"
                  alt="PGS Game Shop"
                  style={{
                    width: "24mm",
                    height: "15mm",
                    objectFit: "contain",
                    objectPosition: "right top",
                  }}
                  className="block filter drop-shadow-md"
                />
              </div>

              {/* Middle/Bottom Right: Massive Name + Role Band + Staff Code */}
              <div className="w-full space-y-1.5 pb-0.5">
                {/* Name: BOHOT BARA (Uppercase, Bold, 16-17pt, White) */}
                <div className="name-esports-text text-white text-[17pt] tracking-tight leading-none drop-shadow-lg truncate max-w-[42mm]">
                  {emp?.name || "STAFF MEMBER"}
                </div>

                {/* Role: Solid Color Band (Admin = Purple #7B2FF7, Manager = Blue #2563EB, Staff = Yellow #FFD400) */}
                <div>
                  <span
                    className="inline-block px-2.5 py-0.8 rounded-xs text-[6.8pt] font-black uppercase shadow-xs truncate max-w-[42mm]"
                    style={{
                      background: roleBandBg,
                      color: roleTextColor,
                      fontFamily: "'Rajdhani', sans-serif",
                      letterSpacing: "0.08em",
                    }}
                  >
                    {emp?.designation || "STAFF"}
                  </span>
                </div>

                {/* EMP Code: Chhota, Monospace */}
                <div className="flex items-center gap-1 pt-0.5">
                  <span className="text-[5pt] font-bold text-slate-400 font-mono">STAFF CODE:</span>
                  <span className="font-mono text-[7pt] font-black text-cyan-300 tracking-wider">
                    {emp?.employeeCode || "EMP-000"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== BACK SIDE ===================== */}
      {(side === "BACK" || side === "BOTH") && (
        <div
          className="cr80-print-card cr80-card-frame relative mx-auto text-white shadow-xl flex flex-col justify-between"
          style={{
            background: "linear-gradient(135deg, #050814 0%, #0a0f26 50%, #050712 100%)",
            padding: "2.8mm",
            boxShadow: "0 15px 35px -8px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(123, 47, 247, 0.35)",
            WebkitPrintColorAdjust: "exact",
            printColorAdjust: "exact",
          }}
        >
          {/* Cyber grid corner art 25% opacity */}
          <div
            className="absolute inset-0 pointer-events-none opacity-25 bg-cover bg-center"
            style={{ backgroundImage: "url('/card/back-bg.png')" }}
          />

          {/* 1. Center-Top: Big Logo (Centered) */}
          <div className="relative z-10 w-full flex flex-col items-center justify-center border-b border-purple-500/30 pb-0.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/card/logo-trimmed.png"
              alt="PGS Logo"
              style={{ width: "20mm", height: "9.5mm", objectFit: "contain" }}
              className="block filter drop-shadow-sm"
            />
            <span
              className="text-[4.8pt] font-black uppercase tracking-widest text-slate-300 mt-0.5"
              style={{ fontFamily: "'Rajdhani', sans-serif" }}
            >
              OFFICIAL IDENTIFICATION & GATE ACCESS CREDENTIAL
            </span>
          </div>

          {/* 2. Terms: 2 Short Lines (Min 5.5pt) */}
          <div className="relative z-10 bg-black/70 border border-white/10 rounded px-2 py-0.8 space-y-0.5 text-[5.4pt] text-slate-200 leading-snug">
            <p>
              1. Property of <strong>PGS Game Shop</strong>. Scan at gate on entry & exit.
            </p>
            <p>
              2. Non-transferable. If found, return to nearest branch or helpline.
            </p>
          </div>

          {/* 3. Head Office, Helpline, Web (Clean 2-row layout with ZERO overlap) */}
          <div className="relative z-10 rounded bg-slate-950/95 border border-cyan-400/40 px-2 py-0.8 text-[5.2pt]">
            <div className="flex items-center justify-between border-b border-white/10 pb-0.5">
              <span className="text-slate-300">
                <strong>Head Office:</strong> Karachi, Pakistan
              </span>
              <span className="text-slate-200">
                Web: <strong className="text-[#00F0FF] font-bold">www.pgsgameshop.online</strong>
              </span>
            </div>
            <div className="flex items-center justify-between pt-0.5">
              <span className="whitespace-nowrap text-slate-200">
                Helpline: <strong className="text-cyan-300 font-mono font-black">+92 312 2319157</strong>
              </span>
              <span className="text-slate-400 font-mono text-[4.8pt]">PGS GAME SHOP</span>
            </div>
          </div>

          {/* 4. Footer: Issued/Valid Till + Authorized Sign (15x7mm solid 0.3mm border) */}
          <div className="relative z-10 flex items-end justify-between">
            {/* Semi-transparent Dark Panel for Dates */}
            <div className="bg-black/80 border border-white/15 rounded px-2 py-0.8 text-[5.2pt] space-y-0.5">
              <div>
                Issued: <strong className="font-mono text-cyan-300">{issueDateFormatted}</strong>
              </div>
              <div>
                Valid Till: <strong className="font-mono text-emerald-300">{validTillFormatted}</strong>
              </div>
            </div>

            {/* Authorized Sign Box (15x7.5mm, solid 0.3mm border) */}
            <div className="flex flex-col items-center">
              <div
                className="bg-white/5 rounded-xs flex items-center justify-center p-0.5"
                style={{
                  width: "15mm",
                  height: "7.2mm",
                  border: "0.3mm solid rgba(255, 255, 255, 0.45)",
                  overflow: "hidden",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={signatureUrl || "/card/admin-signature.png"}
                  alt="Admin Signature"
                  className="w-full h-full object-contain"
                />
              </div>
              <span className="text-[4.5pt] font-black uppercase tracking-wider text-slate-300 mt-0.5">
                {signatoryTitle}
              </span>
            </div>
          </div>

          {/* 5. Barcode Bay: Solid White Strip with Quiet Zones & Clear Safe Margin from Card Bottom */}
          <div
            className="relative z-10 bg-white rounded flex flex-col items-center justify-center shadow-xs"
            style={{
              paddingTop: "0.8mm",
              paddingBottom: "1mm",
              paddingLeft: "2.5mm",
              paddingRight: "2.5mm",
            }}
          >
            <div className="w-full text-center text-[4.2pt] font-mono font-black text-slate-500 leading-none mb-0.5 tracking-wider">
              ┌ GATE ATTENDANCE SCAN ┐
            </div>
            <svg
              ref={barcodeRefBack}
              style={{ shapeRendering: "crispEdges" }}
              className="w-full max-h-[4.5mm] overflow-visible"
            />
            <div className="font-mono text-[5.5pt] font-black tracking-widest text-slate-950 leading-none mt-0.5">
              {card.cardUid}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
