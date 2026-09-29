"use client";

import React, { useRef } from "react";
import { Printer, X, UserCheck, ShieldCheck } from "lucide-react";

export interface StaffHandoverData {
  salesmanName: string;
  dateStr: string;
  locationName: string;
  ordersClosed: number;
  realizedSales: number;
  cogs: number;
  realizedProfit: number;
  accruedSales: number;
  accruedProfit: number;
  attributedInvoices: Array<{
    invoiceNumber: string;
    totalAmount: number;
    isAccrued: boolean;
    customerName?: string;
  }>;
}

interface ThermalStaffHandoverModalProps {
  handoverData: StaffHandoverData;
  onClose: () => void;
}

export const ThermalStaffHandoverModal: React.FC<ThermalStaffHandoverModalProps> = ({
  handoverData,
  onClose,
}) => {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  const printTime = new Date().toLocaleString();

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      {/* 80mm Thermal Print Styles */}
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
          #printable-staff-handover,
          #printable-staff-handover * {
            visibility: visible !important;
          }
          #printable-staff-handover {
            position: absolute !important;
            left: 0mm !important;
            top: 0mm !important;
            width: 78mm !important;
            margin: 0mm !important;
            padding: 2mm 3mm !important;
            box-shadow: none !important;
            background: #ffffff !important;
            color: #000000 !important;
            font-family: 'Courier New', Courier, monospace !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Screen Card Wrapper */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full overflow-hidden shadow-2xl space-y-4 p-6 relative">
        {/* Screen Header Controls */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 no-print">
          <div className="flex items-center gap-2 text-emerald-400">
            <UserCheck className="w-5 h-5" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-100">
              Staff Shift Handover Slip
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Thermal Receipt (80mm Target Container) */}
        <div
          id="printable-staff-handover"
          ref={printRef}
          className="bg-white text-black p-4 rounded-xl font-mono text-xs space-y-3 leading-tight border border-slate-200"
        >
          {/* Slip Header */}
          <div className="text-center space-y-1 pb-2 border-b border-dashed border-black">
            <h1 className="text-sm font-black tracking-widest uppercase">PGS GAMESHOP</h1>
            <p className="text-[10px] font-bold uppercase">STAFF DAILY HANDOVER SLIP</p>
            <p className="text-[9px]">Location: {handoverData.locationName}</p>
            <p className="text-[9px]">Report Date: {handoverData.dateStr}</p>
          </div>

          {/* Staff Identification */}
          <div className="py-1 border-b border-dashed border-black space-y-0.5 text-[11px]">
            <div className="flex justify-between font-bold">
              <span>STAFF NAME:</span>
              <span>{handoverData.salesmanName.toUpperCase()}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span>Orders Closed:</span>
              <span>{handoverData.ordersClosed} Orders</span>
            </div>
          </div>

          {/* Financial Metrics Summary */}
          <div className="space-y-1 py-1 border-b border-dashed border-black">
            <p className="text-[10px] font-bold uppercase underline text-center">
              FINANCIAL SUMMARY
            </p>
            <div className="flex justify-between font-bold text-[11px]">
              <span>REALIZED SALES (CASH):</span>
              <span>Rs. {handoverData.realizedSales.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span>COGS (Cost Value):</span>
              <span>Rs. {handoverData.cogs.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span>REALIZED PROFIT:</span>
              <span>Rs. {handoverData.realizedProfit.toLocaleString()}</span>
            </div>

            {handoverData.accruedSales > 0 && (
              <>
                <div className="flex justify-between text-[10px] pt-1">
                  <span>Accrued Sales (Hold):</span>
                  <span>Rs. {handoverData.accruedSales.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span>Accrued Profit:</span>
                  <span>Rs. {handoverData.accruedProfit.toLocaleString()}</span>
                </div>
              </>
            )}
          </div>

          {/* Attributed Invoice Details */}
          {handoverData.attributedInvoices && handoverData.attributedInvoices.length > 0 && (
            <div className="py-1 border-b border-dashed border-black space-y-1">
              <p className="text-[9px] font-bold uppercase text-center">INVOICE BREAKDOWN</p>
              <div className="space-y-0.5 text-[9px]">
                {handoverData.attributedInvoices.map((inv, i) => (
                  <div key={i} className="flex justify-between">
                    <span>
                      {inv.invoiceNumber} {inv.isAccrued ? "(ACCRUED)" : ""}
                    </span>
                    <span>Rs. {inv.totalAmount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Signatures & Audit Footer */}
          <div className="pt-4 space-y-4 text-[9px]">
            <div className="flex justify-between pt-2">
              <div className="border-t border-black w-28 text-center pt-0.5">
                Staff Signature
              </div>
              <div className="border-t border-black w-28 text-center pt-0.5">
                Cashier / HR Sign
              </div>
            </div>

            <div className="text-center text-[8px] space-y-0.5 pt-2 border-t border-dotted border-black">
              <p>Printed: {printTime}</p>
              <p className="font-bold">*** END OF STAFF HANDOVER SLIP ***</p>
            </div>
          </div>
        </div>

        {/* Modal Action Controls */}
        <div className="flex gap-3 pt-2 no-print">
          <button
            onClick={handlePrint}
            className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 transition-all"
          >
            <Printer className="w-4 h-4" />
            <span>Print Thermal Handover Slip</span>
          </button>
          <button
            onClick={onClose}
            className="py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-xs transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
