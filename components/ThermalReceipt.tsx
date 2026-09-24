"use client";

import React, { useRef, useEffect } from "react";
import { Printer, X } from "lucide-react";
import JsBarcode from "jsbarcode";

interface ThermalReceiptProps {
  receiptData: {
    invoiceNumber: string;
    date: string | Date;
    locationName: string;
    cashierName: string;
    salesmanName?: string;
    customerName?: string;
    customerPhone?: string;
    items: Array<{
      productName: string;
      condition: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
      serialNumbers?: string[];
    }>;
    subtotal: number;
    discountAmount: number;
    deliveryCharges: number;
    totalAmount: number;
    paidAmount: number;
    changeDue: number;
    payments: Array<{
      method: string;
      amount: number;
      referenceNumber?: string;
    }>;
  };
  onClose: () => void;
}

export const ThermalReceiptModal: React.FC<ThermalReceiptProps> = ({ receiptData, onClose }) => {
  const receiptRef = useRef<HTMLDivElement>(null);
  const barcodeRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (barcodeRef.current && receiptData.invoiceNumber) {
      try {
        JsBarcode(barcodeRef.current, receiptData.invoiceNumber, {
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
  }, [receiptData.invoiceNumber]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      {/* Print-specific style for 80mm Dynamic Height Thermal Roll */}
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
          #printable-thermal-receipt,
          #printable-thermal-receipt * {
            visibility: visible !important;
          }
          #printable-thermal-receipt {
            position: absolute !important;
            left: 0mm !important;
            top: 0mm !important;
            width: 78mm !important;
            margin: 0mm !important;
            padding: 1mm 2mm !important;
            box-shadow: none !important;
            border: none !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Printer className="w-4 h-4 text-indigo-400" />
            Thermal Receipt Preview (80mm Dynamic Roll)
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Receipt Container - Printable */}
        <div
          ref={receiptRef}
          id="printable-thermal-receipt"
          className="bg-white text-black p-6 rounded-lg font-mono text-xs space-y-4 shadow-inner"
        >
          {/* Header */}
          <div className="text-center space-y-1 border-b-2 border-dashed border-black pb-3">
            <h2 className="text-lg font-black uppercase tracking-wider text-black">PGS GAME SHOP</h2>
            <p className="text-xs font-bold text-black">Multi-Branch Retail & Wholesale Gaming Hub</p>
            <p className="text-xs font-bold text-black">Location: {receiptData.locationName}</p>
          </div>

          {/* Details */}
          <div className="space-y-1.5 text-xs border-b-2 border-dashed border-black pb-3 text-black">
            <div className="flex justify-between">
              <span className="font-bold">Invoice #:</span>
              <span className="font-black">{receiptData.invoiceNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-bold">Date:</span>
              <span className="font-semibold">
                {(() => {
                  try {
                    const d = new Date(receiptData.date);
                    if (isNaN(d.getTime())) return String(receiptData.date || "");
                    return d.toLocaleString("en-PK", {
                      timeZone: "Asia/Karachi",
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    });
                  } catch {
                    return String(receiptData.date || "");
                  }
                })()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-bold">Billed By:</span>
              <span className="font-semibold">{receiptData.cashierName}</span>
            </div>
            {receiptData.salesmanName && (
              <div className="flex justify-between">
                <span className="font-bold">Salesman:</span>
                <span className="font-semibold">{receiptData.salesmanName}</span>
              </div>
            )}
            {receiptData.customerName && (
              <div className="flex justify-between">
                <span className="font-bold">Customer:</span>
                <span className="font-bold">{receiptData.customerName} ({receiptData.customerPhone || "N/A"})</span>
              </div>
            )}
          </div>

          {/* Line Items */}
          <div className="space-y-3 border-b-2 border-dashed border-black pb-3 text-black">
            <div className="flex justify-between text-xs font-black border-b-2 border-black pb-1 uppercase">
              <span>ITEM</span>
              <span>QTY x PRICE = TOTAL</span>
            </div>

            {receiptData.items.map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between font-black text-xs">
                  <span>{item.productName} ({item.condition})</span>
                  <span>Rs. {item.lineTotal.toLocaleString()}</span>
                </div>
                <div className="text-xs font-bold text-black flex justify-between pl-1">
                  <span>{item.quantity} x Rs. {item.unitPrice.toLocaleString()}</span>
                </div>

                {/* Serials printed bold for Warranty */}
                {item.serialNumbers && item.serialNumbers.length > 0 && (
                  <div className="text-xs bg-gray-200 p-1 rounded font-black border border-black text-black">
                    <span>S/N: </span>
                    {item.serialNumbers.join(", ")}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="space-y-1.5 text-xs font-bold pt-1 text-black">
            <div className="flex justify-between text-black font-bold">
              <span>Subtotal:</span>
              <span>Rs. {receiptData.subtotal.toLocaleString()}</span>
            </div>
            {receiptData.discountAmount > 0 && (
              <div className="flex justify-between text-black font-bold">
                <span>Discount:</span>
                <span>- Rs. {receiptData.discountAmount.toLocaleString()}</span>
              </div>
            )}
            {receiptData.deliveryCharges > 0 && (
              <div className="flex justify-between text-black font-bold">
                <span>Delivery Charges:</span>
                <span>+ Rs. {receiptData.deliveryCharges.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-sm text-black font-black border-t-2 border-b-2 border-black py-1.5 uppercase">
              <span>TOTAL AMOUNT:</span>
              <span>Rs. {receiptData.totalAmount.toLocaleString()}</span>
            </div>

            <div className="pt-2 space-y-1 text-xs text-black font-bold">
              {receiptData.payments.map((p, idx) => (
                <div key={idx} className="flex justify-between text-black font-bold">
                  <span>Paid ({p.method}):</span>
                  <span>Rs. {p.amount.toLocaleString()}</span>
                </div>
              ))}
              {receiptData.changeDue > 0 && (
                <div className="flex justify-between text-black font-black">
                  <span>Change Returned:</span>
                  <span>Rs. {receiptData.changeDue.toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>

          {/* Invoice Barcode Section */}
          <div className="flex flex-col items-center justify-center pt-3 border-t-2 border-dashed border-black">
            <svg ref={barcodeRef} className="max-w-full h-auto text-black"></svg>
          </div>

          {/* Footer */}
          <div className="text-center pt-3 border-t-2 border-dashed border-black space-y-1 text-xs font-bold text-black">
            <p className="font-black text-black uppercase">Thank you for shopping at PGS Game Shop!</p>
            <p className="font-bold text-black">Please keep this invoice receipt for warranty claims & returns.</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
          >
            Close
          </button>
          <button
            onClick={handlePrint}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 transition"
          >
            <Printer className="w-4 h-4" />
            Print Receipt
          </button>
        </div>
      </div>
    </div>
  );
};
