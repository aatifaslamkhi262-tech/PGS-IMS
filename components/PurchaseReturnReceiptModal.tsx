"use client";

import React, { useRef, useEffect } from "react";
import { Printer, X } from "lucide-react";
import JsBarcode from "jsbarcode";

export interface PurchaseReturnReceiptData {
  returnTxNumber: string;
  invoiceNumber: string;
  date: string | Date;
  locationName: string;
  processedBy: string;
  supplierName: string;
  supplierCode?: string;
  items: Array<{
    productName: string;
    condition: string;
    quantity: number;
    unitCost: number;
    lineTotal: number;
    serialNumbers?: string[];
    reason?: string;
  }>;
  totalReturnedQty: number;
  totalReturnedCost: number;
  returnReason?: string;
  notes?: string;
}

interface PurchaseReturnReceiptModalProps {
  receiptData: PurchaseReturnReceiptData;
  onClose: () => void;
}

export const PurchaseReturnReceiptModal: React.FC<PurchaseReturnReceiptModalProps> = ({
  receiptData,
  onClose,
}) => {
  const barcodeRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (barcodeRef.current && receiptData.returnTxNumber) {
      try {
        JsBarcode(barcodeRef.current, receiptData.returnTxNumber, {
          format: "CODE128",
          width: 1.8,
          height: 38,
          displayValue: true,
          fontSize: 12,
          fontOptions: "bold",
          font: "monospace",
          margin: 4,
          background: "#ffffff",
          lineColor: "#000000",
        });
      } catch {
        // Fallback catch
      }
    }
  }, [receiptData.returnTxNumber]);

  const handlePrint = () => {
    window.print();
  };

  const formattedDate = new Date(receiptData.date).toLocaleString("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
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
            overflow: hidden !important;
            background: #ffffff !important;
            color: #000000 !important;
          }
          body * {
            visibility: hidden !important;
          }
          #printable-return-receipt,
          #printable-return-receipt * {
            visibility: visible !important;
          }
          #printable-return-receipt {
            position: absolute !important;
            left: 0mm !important;
            top: 0mm !important;
            width: 78mm !important;
            margin: 0mm !important;
            padding: 1mm 2mm !important;
            box-shadow: none !important;
            background: #ffffff !important;
            color: #000000 !important;
          }
        }
      `}</style>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Printer className="w-4 h-4 text-amber-400" />
            Supplier Purchase Return Slip
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 80mm Printable Receipt Container */}
        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-center overflow-x-auto">
          <div
            id="printable-return-receipt"
            className="w-[78mm] bg-white text-black p-3 font-mono text-[11px] leading-tight space-y-2 shadow-inner"
          >
            {/* Store Header */}
            <div className="text-center border-b border-black/30 pb-2">
              <h2 className="text-sm font-extrabold uppercase tracking-wide">PGS GAMING STORE</h2>
              <p className="text-[10px] font-bold text-gray-700 uppercase mt-0.5">
                SUPPLIER DEBIT / RETURN SLIP
              </p>
              <p className="text-[9px] text-gray-600 font-semibold">{receiptData.locationName}</p>
            </div>

            {/* Receipt Metadata */}
            <div className="space-y-0.5 text-[10px] border-b border-black/20 pb-2">
              <div className="flex justify-between">
                <span className="font-bold">Return Ref #:</span>
                <span>{receiptData.returnTxNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold">Orig Inv #:</span>
                <span>{receiptData.invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold">Date:</span>
                <span>{formattedDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold">Supplier:</span>
                <span className="font-bold">{receiptData.supplierName}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold">Staff:</span>
                <span>{receiptData.processedBy}</span>
              </div>
            </div>

            {/* Items Table */}
            <div className="space-y-1 py-1 border-b border-black/20">
              <div className="grid grid-cols-12 font-bold text-[9px] uppercase border-b border-black/20 pb-1">
                <span className="col-span-6">Item</span>
                <span className="col-span-2 text-center">Qty</span>
                <span className="col-span-4 text-right">Cost</span>
              </div>

              {receiptData.items.map((item, idx) => (
                <div key={idx} className="space-y-0.5 py-0.5 border-b border-dashed border-black/10 last:border-0">
                  <div className="grid grid-cols-12 text-[10px]">
                    <span className="col-span-6 font-bold leading-tight truncate">
                      {item.productName} ({item.condition})
                    </span>
                    <span className="col-span-2 text-center font-bold">{item.quantity}</span>
                    <span className="col-span-4 text-right font-bold">
                      Rs. {item.lineTotal.toLocaleString()}
                    </span>
                  </div>

                  {item.serialNumbers && item.serialNumbers.length > 0 && (
                    <div className="text-[9px] text-gray-800 font-mono">
                      S/N: {item.serialNumbers.join(", ")}
                    </div>
                  )}
                  {item.reason && (
                    <div className="text-[9px] text-gray-600 italic">
                      Reason: {item.reason}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="space-y-1 text-[11px] pt-1 border-b border-black/30 pb-2">
              <div className="flex justify-between font-bold">
                <span>Total Items Returned:</span>
                <span>{receiptData.totalReturnedQty} Unit(s)</span>
              </div>
              <div className="flex justify-between text-xs font-extrabold pt-0.5">
                <span>TOTAL REVERTED VALUE:</span>
                <span>Rs. {receiptData.totalReturnedCost.toLocaleString()}</span>
              </div>
            </div>

            {/* Barcode Footer */}
            <div className="text-center pt-1 space-y-1">
              <svg ref={barcodeRef} className="mx-auto max-w-full" />
              <div className="flex justify-between text-[8px] text-gray-600 pt-3 border-t border-dashed border-black/30">
                <span>Staff Sign: ___________</span>
                <span>Supplier Sign: ___________</span>
              </div>
              <p className="text-[8px] font-bold text-gray-500 pt-1">Inventory Stock Minus & Serials Removed</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 font-semibold text-xs hover:bg-slate-750 transition"
          >
            Close
          </button>
          <button
            onClick={handlePrint}
            className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-lg shadow-amber-600/20 transition flex items-center justify-center gap-2"
          >
            <Printer className="w-4 h-4" />
            Print Return Voucher
          </button>
        </div>
      </div>
    </div>
  );
};
