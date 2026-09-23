"use client";

import React, { useRef, useEffect } from "react";
import { Printer, X } from "lucide-react";
import JsBarcode from "jsbarcode";

export interface PurchaseReceiptData {
  invoiceNumber: string;
  receivingType?: "SUPPLIER_PURCHASE" | "CUSTOMER_BUYBACK" | "CUSTOMER_RETURN";
  date: string | Date;
  status: string;
  createdBy: string;
  supplier?: {
    name: string;
    code?: string;
    contactPerson?: string;
    phone?: string;
    address?: string;
  };
  customerName?: string;
  customerPhone?: string;
  items: Array<{
    productName: string;
    condition: string;
    quantity: number;
    unitCost: number;
    amount: number;
    serialNumbers?: string[];
  }>;
  subtotal: number;
  total: number;
  notes?: string;
}

interface PurchaseReceiptModalProps {
  receiptData: PurchaseReceiptData;
  onClose: () => void;
}

export const PurchaseReceiptModal: React.FC<PurchaseReceiptModalProps> = ({
  receiptData,
  onClose,
}) => {
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

  const isBuyback = receiptData.receivingType === "CUSTOMER_BUYBACK";
  const isReturn = receiptData.receivingType === "CUSTOMER_RETURN";
  const voucherTitle = isBuyback
    ? "CUSTOMER BUYBACK VOUCHER"
    : isReturn
    ? "CUSTOMER RETURN VOUCHER"
    : "SUPPLIER PURCHASE INVOICE";

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      {/* Print-specific style for 80mm Thermal / A4 Roll Printable Voucher */}
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
          #printable-purchase-receipt,
          #printable-purchase-receipt * {
            visibility: visible !important;
          }
          #printable-purchase-receipt {
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
            <span>Print Purchase Voucher (80mm / A4)</span>
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
          id="printable-purchase-receipt"
          className="bg-white text-black p-6 rounded-lg font-mono text-xs space-y-4 shadow-inner"
        >
          {/* Header */}
          <div className="text-center space-y-1 border-b-2 border-dashed border-black pb-3">
            <h2 className="text-lg font-black uppercase tracking-wider text-black">PGS GAME SHOP</h2>
            <p className="text-xs font-bold text-black">{voucherTitle}</p>
            <p className="text-[10px] font-semibold text-black">Inventory Receiving & Accounts Ledger</p>
          </div>

          {/* Invoice Meta */}
          <div className="space-y-1.5 text-xs border-b-2 border-dashed border-black pb-3 text-black">
            <div className="flex justify-between">
              <span className="font-bold">Purchase Ref #:</span>
              <span className="font-black">{receiptData.invoiceNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-bold">Date:</span>
              <span className="font-semibold">
                {new Date(receiptData.date).toLocaleString("en-PK")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-bold">Status:</span>
              <span className="font-bold uppercase">{receiptData.status}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-bold">Processed By:</span>
              <span className="font-semibold">{receiptData.createdBy || "System"}</span>
            </div>

            {/* Vendor / Supplier details for SUPPLIER_PURCHASE */}
            {!isBuyback && !isReturn && receiptData.supplier && (
              <div className="pt-1 border-t border-black/20 space-y-1">
                <div className="flex justify-between">
                  <span className="font-bold">Supplier / Vendor:</span>
                  <span className="font-bold">
                    {receiptData.supplier.name}{" "}
                    {receiptData.supplier.code ? `(${receiptData.supplier.code})` : ""}
                  </span>
                </div>
                {receiptData.supplier.phone && (
                  <div className="flex justify-between">
                    <span className="font-bold">Contact Phone:</span>
                    <span>{receiptData.supplier.phone}</span>
                  </div>
                )}
              </div>
            )}

            {/* Customer details for CUSTOMER_BUYBACK or CUSTOMER_RETURN */}
            {(isBuyback || isReturn || receiptData.customerName) && (
              <div className="pt-1 border-t border-black/20 space-y-1">
                <div className="flex justify-between">
                  <span className="font-bold">Customer:</span>
                  <span className="font-bold">
                    {receiptData.customerName || "Walk-in Customer"}
                  </span>
                </div>
                {receiptData.customerPhone && (
                  <div className="flex justify-between">
                    <span className="font-bold">Phone:</span>
                    <span>{receiptData.customerPhone}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Line Items Table */}
          <div className="space-y-3 border-b-2 border-dashed border-black pb-3 text-black">
            <div className="flex justify-between text-xs font-black border-b-2 border-black pb-1 uppercase">
              <span>ITEM</span>
              <span>QTY x COST = TOTAL</span>
            </div>

            {receiptData.items.map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between font-black text-xs">
                  <span>
                    {item.productName} ({item.condition || "New"})
                  </span>
                  <span>Rs. {item.amount.toLocaleString()}</span>
                </div>
                <div className="text-xs font-bold text-black flex justify-between pl-1">
                  <span>
                    {item.quantity} x Rs. {item.unitCost.toLocaleString()}
                  </span>
                </div>

                {/* Serials if available */}
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
              <span>Subtotal Intake:</span>
              <span>Rs. {receiptData.subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm text-black font-black border-t-2 border-b-2 border-black py-1.5 uppercase">
              <span>TOTAL PURCHASE COST:</span>
              <span>Rs. {receiptData.total.toLocaleString()}</span>
            </div>
          </div>

          {/* Notes */}
          {receiptData.notes && (
            <div className="text-xs border-t border-dashed border-black pt-2 text-black">
              <span className="font-bold">Notes / Ref:</span> {receiptData.notes}
            </div>
          )}

          {/* Document Code128 Barcode */}
          <div className="flex flex-col items-center justify-center pt-3 border-t-2 border-dashed border-black">
            <svg ref={barcodeRef} className="max-w-full h-auto text-black"></svg>
          </div>

          {/* Footer */}
          <div className="text-center pt-3 border-t-2 border-dashed border-black space-y-1 text-xs font-bold text-black">
            <p className="font-black text-black uppercase">Official Stock Purchase Voucher</p>
            <p className="font-bold text-black">PGS Game Shop Inventory & Financial Audit System</p>
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
            Print Voucher
          </button>
        </div>
      </div>
    </div>
  );
};
