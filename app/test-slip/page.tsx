"use client";

import React, { useState } from "react";
import { ThermalReceiptModal } from "@/components/ThermalReceipt";
import { Printer, RefreshCw, Trash2, CheckCircle, Info } from "lucide-react";

export default function TestSlipPage() {
  const [paperSize, setPaperSize] = useState<"80mm" | "58mm">("80mm");
  const [showModal, setShowModal] = useState(false);

  // Sample Receipt Data
  const [storeName, setStoreName] = useState("PGS GAME SHOP");
  const [invoiceNumber, setInvoiceNumber] = useState("INV-20260916-8801");
  const [customerName, setCustomerName] = useState("Ali Raza");
  const [customerPhone, setCustomerPhone] = useState("03001234567");
  const [cashierName, setCashierName] = useState("Ayan (Cashier)");
  const [salesmanName, setSalesmanName] = useState("Hamza");
  const [isSplitPayment, setIsSplitPayment] = useState(true);

  const sampleReceiptData = {
    invoiceNumber,
    date: new Date(),
    locationName: "G-14 Retail Store",
    cashierName,
    salesmanName,
    customerName,
    customerPhone,
    items: [
      {
        productName: "Sony PlayStation 5 Slim Digital",
        condition: "New",
        quantity: 1,
        unitPrice: 155000,
        lineTotal: 155000,
        serialNumbers: ["PS5-998812-US"],
      },
      {
        productName: "DualSense Wireless Controller (Midnight Black)",
        condition: "New",
        quantity: 1,
        unitPrice: 22000,
        lineTotal: 22000,
        serialNumbers: ["DS5-110293"],
      },
    ],
    subtotal: 177000,
    discountAmount: 2000,
    deliveryCharges: 500,
    totalAmount: 175500,
    paidAmount: 175500,
    changeDue: 0,
    payments: isSplitPayment
      ? [
          { method: "CASH", amount: 75500 },
          { method: "CARD", amount: 50000, referenceNumber: "CARD-9821" },
          { method: "BANK_TRANSFER", amount: 50000, referenceNumber: "IBFT-7712" },
        ]
      : [{ method: "CASH", amount: 175500 }],
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Banner */}
        <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-2xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
              <Info className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-amber-300">
                Temporary POS Slip Testing Page
              </h2>
              <p className="text-xs text-amber-200/80">
                Test 80mm & 58mm thermal receipt generation & printer calibration. Delete this page when done.
              </p>
            </div>
          </div>
          <span className="text-[10px] uppercase font-mono font-bold bg-amber-500/20 text-amber-300 px-2.5 py-1 rounded-full border border-amber-500/30">
            Route: /test-slip
          </span>
        </div>

        {/* Paper Size Dimensions Table */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            📏 POS Thermal Receipt Dimensions (in Millimeters & Inches)
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-indigo-400">80mm Standard POS Thermal Roll</span>
                <span className="text-xs font-mono bg-indigo-950 text-indigo-300 px-2 py-0.5 rounded border border-indigo-800">
                  Most Common (3-inch)
                </span>
              </div>
              <ul className="text-xs text-slate-300 space-y-1 list-disc list-inside">
                <li><strong>Width (Total Paper):</strong> <span className="text-emerald-400 font-bold">80 mm</span> (3.15 inches / 302 px at 96 DPI)</li>
                <li><strong>Printable Area Width:</strong> <span className="text-emerald-400 font-bold">72 mm - 76 mm</span> (2.83 inches)</li>
                <li><strong>Height:</strong> <span className="text-cyan-400 font-bold">Auto / Variable</span> (Continuous paper roll based on items length)</li>
                <li><strong>Common Printers:</strong> Epson TM-T88, Xprinter XP-N160II, Sunmi T2, Rongta 80mm</li>
              </ul>
            </div>

            <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-cyan-400">58mm Compact Mobile POS Thermal Roll</span>
                <span className="text-xs font-mono bg-cyan-950 text-cyan-300 px-2 py-0.5 rounded border border-cyan-800">
                  Mobile/Bluetooth (2-inch)
                </span>
              </div>
              <ul className="text-xs text-slate-300 space-y-1 list-disc list-inside">
                <li><strong>Width (Total Paper):</strong> <span className="text-emerald-400 font-bold">58 mm</span> (2.28 inches / 219 px at 96 DPI)</li>
                <li><strong>Printable Area Width:</strong> <span className="text-emerald-400 font-bold">48 mm - 52 mm</span> (1.89 inches)</li>
                <li><strong>Height:</strong> <span className="text-cyan-400 font-bold">Auto / Variable</span> (Continuous paper roll based on items length)</li>
                <li><strong>Common Printers:</strong> Mobile Bluetooth Handheld, GOOJPRT 58mm, PT-210, ZJ-5809</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Test Control Panel */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-6">
          <h3 className="text-base font-bold text-slate-100">
            🧪 POS Slip Generator & Test Controls
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Target Paper Width</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPaperSize("80mm")}
                  className={`flex-1 py-2 rounded-xl font-bold border transition ${
                    paperSize === "80mm"
                      ? "bg-indigo-600 border-indigo-500 text-white"
                      : "bg-slate-950 border-slate-800 text-slate-400"
                  }`}
                >
                  80 mm (3-inch Standard)
                </button>
                <button
                  type="button"
                  onClick={() => setPaperSize("58mm")}
                  className={`flex-1 py-2 rounded-xl font-bold border transition ${
                    paperSize === "58mm"
                      ? "bg-cyan-600 border-cyan-500 text-white"
                      : "bg-slate-950 border-slate-800 text-slate-400"
                  }`}
                >
                  58 mm (2-inch Mobile)
                </button>
              </div>
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">Payment Mode for Testing</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsSplitPayment(false)}
                  className={`flex-1 py-2 rounded-xl font-bold border transition ${
                    !isSplitPayment
                      ? "bg-slate-800 border-slate-700 text-white"
                      : "bg-slate-950 border-slate-800 text-slate-400"
                  }`}
                >
                  Single Cash Payment
                </button>
                <button
                  type="button"
                  onClick={() => setIsSplitPayment(true)}
                  className={`flex-1 py-2 rounded-xl font-bold border transition ${
                    isSplitPayment
                      ? "bg-cyan-600 border-cyan-500 text-white"
                      : "bg-slate-950 border-slate-800 text-slate-400"
                  }`}
                >
                  🔀 Split Payment (Cash+Card+Bank)
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 py-3 rounded-xl text-sm transition shadow-lg shadow-emerald-600/30 flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              Generate & Test Print Thermal Receipt ({paperSize})
            </button>
          </div>
        </div>

        {/* Live Thermal Receipt Canvas Preview */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
          <h3 className="text-sm font-bold text-slate-300">
            Real-Time Receipt Render ({paperSize} scale)
          </h3>

          <div className="flex justify-center bg-slate-950 p-6 rounded-xl overflow-x-auto">
            <div
              style={{
                width: paperSize === "80mm" ? "320px" : "240px",
              }}
              className="bg-white text-black p-4 font-mono text-xs shadow-2xl rounded space-y-3 transition-all duration-300 border border-gray-300"
            >
              <div className="text-center border-b border-dashed border-gray-400 pb-2">
                <h2 className="text-sm font-black uppercase tracking-wider">{storeName}</h2>
                <p className="text-[9px] text-gray-600">Multi-Branch Retail & Wholesale Gaming Hub</p>
                <p className="text-[9px] text-gray-600">Location: {sampleReceiptData.locationName}</p>
              </div>

              <div className="space-y-0.5 text-[10px] border-b border-dashed border-gray-400 pb-2">
                <div className="flex justify-between">
                  <span>Invoice #:</span>
                  <span className="font-bold">{sampleReceiptData.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span>Customer:</span>
                  <span>{sampleReceiptData.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span>Salesman:</span>
                  <span>{sampleReceiptData.salesmanName}</span>
                </div>
              </div>

              <div className="space-y-1 border-b border-dashed border-gray-400 pb-2 text-[10px]">
                {sampleReceiptData.items.map((it, idx) => (
                  <div key={idx} className="space-y-0.5">
                    <div className="flex justify-between font-bold">
                      <span>{it.productName} ({it.condition})</span>
                      <span>Rs. {it.lineTotal.toLocaleString()}</span>
                    </div>
                    {it.serialNumbers && it.serialNumbers.length > 0 && (
                      <div className="text-[9px] bg-gray-100 p-0.5 rounded font-bold">
                        S/N: {it.serialNumbers.join(", ")}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="space-y-1 text-[10px] font-bold">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal:</span>
                  <span>Rs. {sampleReceiptData.subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm text-black border-t border-b border-black py-0.5">
                  <span>TOTAL:</span>
                  <span>Rs. {sampleReceiptData.totalAmount.toLocaleString()}</span>
                </div>

                {sampleReceiptData.payments.map((p, idx) => (
                  <div key={idx} className="flex justify-between text-gray-700 text-[10px]">
                    <span>Paid ({p.method}):</span>
                    <span>Rs. {p.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>

              <div className="text-center pt-2 border-t border-dashed border-gray-400 text-[9px] text-gray-500">
                Thank you for shopping at PGS Game Shop!
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Live Printable Modal */}
      {showModal && (
        <ThermalReceiptModal
          receiptData={sampleReceiptData}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
