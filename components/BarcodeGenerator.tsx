"use client";

import React, { useEffect, useRef, useState } from "react";
import { Barcode, Copy, Check, Printer } from "lucide-react";
import JsBarcode from "jsbarcode";
import { generateThermalLabel, printThermalLabel } from "@/lib/thermalLabelGenerator";

interface BarcodeGeneratorProps {
  value: string | null | undefined;
  productName?: string;
  sellingPrice?: number | null;
  showPrint?: boolean;
  condition?: string;
}

export const BarcodeGenerator: React.FC<BarcodeGeneratorProps> = ({
  value,
  productName,
  sellingPrice,
  showPrint = true,
  condition,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [copied, setCopied] = useState(false);
  const [barcodeError, setBarcodeError] = useState(false);

  // Render barcode into SVG using JsBarcode
  useEffect(() => {
    if (!svgRef.current || !value) return;
    setBarcodeError(false);
    try {
      JsBarcode(svgRef.current, value, {
        format: "CODE128",
        width: 2,
        height: 50,
        displayValue: false,
        margin: 10,
        background: "#ffffff",
        lineColor: "#000000",
      });
    } catch {
      setBarcodeError(true);
    }
  }, [value]);

  if (!value) {
    return (
      <div className="flex items-center gap-2 p-3 bg-slate-800/60 border border-slate-700/60 rounded-lg text-slate-400 text-xs italic">
        <Barcode className="w-4 h-4 text-slate-500" />
        No barcode assigned to this product
      </div>
    );
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formattedPrice =
    sellingPrice != null
      ? `Rs. ${sellingPrice.toLocaleString("en-PK")}`
      : null;

  const handlePrint = async () => {
    try {
      // Generate high-resolution thermal label
      const canvas = await generateThermalLabel({
        productName: productName || "Product",
        barcode: value,
        sellingPrice: sellingPrice,
        condition: condition,
      });
      
      // Print the thermal label
      printThermalLabel(canvas, productName || value);
    } catch (error) {
      console.error("Failed to generate thermal label:", error);
      alert("Failed to generate label for printing. Please try again.");
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col items-center gap-3">

      {/* On-screen preview matching print layout */}
      <div className="bg-white border border-slate-700 rounded-lg shadow-inner flex w-full max-w-[350px] h-[160px] overflow-hidden">
        {/* Main content */}
        <div className="flex-1 h-full flex flex-col p-2 justify-center">
          {/* Barcode section */}
          <div className="flex flex-col items-center">
            {barcodeError ? (
              <div className="text-red-500 text-xs py-2 text-center">
                Could not render barcode for: <span className="font-mono">{value}</span>
              </div>
            ) : (
              <>
                <svg ref={svgRef} className="w-full h-auto max-h-[50px]" />
                <div className="text-[12px] font-mono font-semibold text-slate-700 mt-0.5">
                  {value}
                </div>
              </>
            )}
          </div>
          
          {/* Product name */}
          <div className="text-[11px] font-semibold text-slate-800 text-center leading-tight mt-1 overflow-hidden text-ellipsis" style={{ 
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            maxHeight: '2.4em'
          }}>
            {productName || 'Product'}
          </div>
          
          {/* Condition */}
          {condition && (
            <div className="text-[9px] font-bold text-slate-500 text-center uppercase mt-0.5">
              — {condition}
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 w-full justify-center">
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-medium text-slate-200 transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" /> Copy Code
            </>
          )}
        </button>

        {showPrint && (
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 border border-indigo-500 rounded-lg text-xs font-medium text-white transition-colors"
          >
            <Printer className="w-3.5 h-3.5" /> Print Label
          </button>
        )}
      </div>
    </div>
  );
};
