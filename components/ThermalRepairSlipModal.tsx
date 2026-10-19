"use client";

import React, { useRef, useEffect } from "react";
import { Printer, X, Wrench } from "lucide-react";
import JsBarcode from "jsbarcode";

export interface RepairSlipData {
  repairNumber: string;
  createdAt: string | Date;
  locationName: string;
  repairedBy: string;
  customerName: string;
  customerPhone: string;
  productName: string;
  serialNumber?: string;
  faultReason: string;
  parts: Array<{
    productName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  laborCost: number;
  partsTotal: number;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  paymentMethod: string;
  status: string;
}

interface ThermalRepairSlipModalProps {
  repairData: RepairSlipData;
  onClose: () => void;
}

export const ThermalRepairSlipModal: React.FC<ThermalRepairSlipModalProps> = ({
  repairData,
  onClose,
}) => {
  const receiptRef = useRef<HTMLDivElement>(null);
  const barcodeRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (barcodeRef.current && repairData.repairNumber) {
      try {
        JsBarcode(barcodeRef.current, repairData.repairNumber, {
          format: "CODE128",
          width: 2,
          height: 44,
          displayValue: true,
          fontSize: 13,
          fontOptions: "bold",
          font: "monospace",
          margin: 4,
          background: "#ffffff",
          lineColor: "#000000",
        });
      } catch (err) {
        console.error("Failed to render barcode:", err);
      }
    }
  }, [repairData.repairNumber]);

  const handlePrint = () => {
    window.print();
  };

  const formattedDate = new Date(repairData.createdAt).toLocaleDateString("en-PK", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Modal Top Bar */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-sm text-slate-100">Thermal Repair Slip</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Slip</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Receipt Preview (Printable Area) */}
        <div className="p-4 overflow-y-auto flex-1 bg-slate-950 flex justify-center">
          <div
            ref={receiptRef}
            id="thermal-repair-slip"
            className="w-[80mm] max-w-full bg-white text-black p-4 font-mono text-xs leading-normal shadow-md select-text space-y-3"
            style={{ minHeight: "120mm" }}
          >
            {/* Store Header */}
            <div className="text-center pb-2 border-b-2 border-dashed border-black">
              <div className="flex justify-center pb-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo.png"
                  alt="PGS Game Shop"
                  className="h-20 w-auto max-w-[190px] object-contain mx-auto"
                />
              </div>
              <h2 className="font-black text-lg tracking-wider uppercase text-black">PGS GAME SHOP</h2>
              <p className="text-xs font-bold text-black uppercase">Official Gaming & Console Repair Center</p>
              <p className="text-xs font-bold text-black">Location: {repairData.locationName}</p>
              <div className="inline-block mt-1 px-3 py-1 bg-black text-white font-black text-xs tracking-widest rounded uppercase">
                REPAIR JOB TICKET
              </div>
            </div>

            {/* Barcode & Job Number */}
            <div className="text-center my-2">
              <svg ref={barcodeRef} className="mx-auto max-w-full"></svg>
            </div>

            {/* Job Metadata */}
            <div className="py-2 border-b-2 border-dashed border-black space-y-1.5 text-xs text-black">
              <div className="flex justify-between">
                <span className="font-bold">Date:</span>
                <span className="font-black">{formattedDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold">Technician:</span>
                <span className="font-black uppercase">{repairData.repairedBy}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold">Status:</span>
                <span className="font-black uppercase">{repairData.status}</span>
              </div>
            </div>

            {/* Customer & Device Information */}
            <div className="py-2 border-b-2 border-dashed border-black space-y-1.5 text-xs text-black">
              <div className="flex justify-between">
                <span className="font-bold">Customer:</span>
                <span className="font-black">{repairData.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold">Contact:</span>
                <span className="font-black">{repairData.customerPhone}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold">Device / Model:</span>
                <span className="font-black uppercase">{repairData.productName}</span>
              </div>
              {repairData.serialNumber && (
                <div className="flex justify-between border-2 border-black p-1 rounded bg-white">
                  <span className="font-bold">Device S/N:</span>
                  <span className="font-black tracking-wider">{repairData.serialNumber}</span>
                </div>
              )}
              <div className="mt-1 pt-1.5 border-t border-dashed border-black">
                <span className="font-bold">Fault / Issue: </span>
                <span className="font-black">{repairData.faultReason}</span>
              </div>
            </div>

            {/* Used Parts Table (if any) */}
            {repairData.parts && repairData.parts.length > 0 && (
              <div className="py-2 border-b-2 border-dashed border-black text-xs text-black space-y-1">
                <p className="font-black uppercase text-xs text-black">Spare Parts Installed:</p>
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b-2 border-black text-xs font-black uppercase text-black">
                      <th className="pb-1">Part</th>
                      <th className="pb-1 text-center">Qty</th>
                      <th className="pb-1 text-right">Price</th>
                      <th className="pb-1 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/20">
                    {repairData.parts.map((p, i) => (
                      <tr key={i} className="text-xs font-bold text-black">
                        <td className="py-1 font-black">{p.productName}</td>
                        <td className="py-1 text-center font-bold">{p.quantity}</td>
                        <td className="py-1 text-right font-bold">Rs. {p.unitPrice.toLocaleString()}</td>
                        <td className="py-1 text-right font-black">Rs. {p.lineTotal.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Financial Summary */}
            <div className="py-2.5 border-b-2 border-black space-y-1.5 text-xs text-black">
              <div className="flex justify-between">
                <span className="font-bold">Labor / Repair Fee:</span>
                <span className="font-black">Rs. {repairData.laborCost.toLocaleString()}</span>
              </div>
              {repairData.partsTotal > 0 && (
                <div className="flex justify-between">
                  <span className="font-bold">Parts Total:</span>
                  <span className="font-black">Rs. {repairData.partsTotal.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-black pt-1 border-t-2 border-black">
                <span>TOTAL CHARGES:</span>
                <span>Rs. {repairData.totalAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between pt-0.5 font-bold">
                <span>Paid ({repairData.paymentMethod}):</span>
                <span className="font-black">Rs. {repairData.paidAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-xs font-black p-1.5 bg-black text-white rounded">
                <span>BALANCE DUE:</span>
                <span className="font-mono text-sm font-black">Rs. {repairData.balanceDue.toLocaleString()}</span>
              </div>
            </div>

            {/* Terms & Conditions */}
            <div className="pt-2 text-center text-xs text-black font-bold space-y-1">
              <p className="font-black text-xs uppercase tracking-wide">*** PLEASE PRESENT THIS SLIP TO CLAIM YOUR DEVICE ***</p>
              <p className="text-[11px] font-bold">7-Days testing warranty on replaced components only.</p>
              <p className="text-[11px] font-bold">Devices not collected within 30 days are subject to shop storage policy.</p>
              <p className="pt-1 font-black text-xs uppercase tracking-wider">Thank you for trusting PGS Game Shop!</p>
            </div>
          </div>
        </div>

        {/* Modal Bottom Actions */}
        <div className="p-3 border-t border-slate-800 flex justify-end gap-2 bg-slate-950">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
          >
            Close
          </button>
          <button
            onClick={handlePrint}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-2 transition"
          >
            <Printer className="w-4 h-4" />
            <span>Print Thermal Slip</span>
          </button>
        </div>
      </div>

      {/* Print Specific CSS */}
      <style>{`
        @media print {
          @page {
            size: 80mm auto;
            margin: 0mm !important;
          }
          html, body {
            margin: 0mm !important;
            padding: 0mm !important;
            height: auto !important;
            max-height: 100vh !important;
            overflow: hidden !important;
            background: #ffffff !important;
            color: #000000 !important;
          }
          body * {
            visibility: hidden !important;
          }
          #thermal-repair-slip,
          #thermal-repair-slip * {
            visibility: visible !important;
            color: #000000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #thermal-repair-slip {
            position: absolute !important;
            left: 0mm !important;
            top: 0mm !important;
            width: 78mm !important;
            margin: 0mm !important;
            padding: 1mm 2mm !important;
            box-shadow: none !important;
            border: none !important;
            background: #ffffff !important;
            color: #000000 !important;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
            -webkit-font-smoothing: antialiased !important;
            -moz-osx-font-smoothing: grayscale !important;
            text-rendering: optimizeLegibility !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          #thermal-repair-slip .bg-black {
            background-color: #000000 !important;
            color: #ffffff !important;
          }
          #thermal-repair-slip .bg-black * {
            color: #ffffff !important;
          }
          #thermal-repair-slip img {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            filter: grayscale(100%) contrast(140%) !important;
            image-rendering: -webkit-optimize-contrast !important;
            image-rendering: crisp-edges !important;
          }
        }
      `}</style>
    </div>
  );
};
