"use client";

import React, { useState } from "react";
import { generateThermalLabel, printThermalLabel } from "@/lib/thermalLabelGenerator";

/**
 * Test page for barcode generation
 * This component allows testing the thermal label generation with various inputs
 */
export const BarcodeTestPage: React.FC = () => {
  const [testData, setTestData] = useState({
    productName: "PS5 Slim Disc Edition",
    barcode: "PS5-001",
    sellingPrice: 45000,
    condition: "USED",
  });

  const [generatedCanvas, setGeneratedCanvas] = useState<HTMLCanvasElement | null>(null);
  const [testResults, setTestResults] = useState<string[]>([]);

  const handleGenerate = async () => {
    try {
      const canvas = await generateThermalLabel({
        productName: testData.productName,
        barcode: testData.barcode,
        sellingPrice: testData.sellingPrice,
        condition: testData.condition,
      });
      
      setGeneratedCanvas(canvas);
      setTestResults(prev => [...prev, `✓ Generated label for ${testData.barcode}: ${canvas.width}x${canvas.height}px`]);
    } catch (error) {
      setTestResults(prev => [...prev, `✗ Failed to generate label for ${testData.barcode}: ${error}`]);
    }
  };

  const handlePrint = () => {
    if (generatedCanvas) {
      printThermalLabel(generatedCanvas, testData.productName);
    }
  };

  const runTestSuite = async () => {
    const testCases = [
      { productName: "PS5 Slim Disc Edition", barcode: "PS5-001", sellingPrice: 45000, condition: "USED" },
      { productName: "PS5 Slim Disc Edition", barcode: "PS5-002", sellingPrice: 45000, condition: "NEW" },
      { productName: "Grand Theft Auto V", barcode: "GTA5-001", sellingPrice: 2500, condition: "USED" },
      { productName: "Test Product Mixed123", barcode: "TEST-ABC123", sellingPrice: 1000, condition: "NEW" },
    ];

    setTestResults([]);
    for (const testCase of testCases) {
      try {
        const canvas = await generateThermalLabel({
          productName: testCase.productName,
          barcode: testCase.barcode,
          sellingPrice: testCase.sellingPrice,
          condition: testCase.condition,
        });
        setTestResults(prev => [...prev, `✓ Test passed (${testCase.barcode}): ${canvas.width}x${canvas.height}px`]);
      } catch (error) {
        setTestResults(prev => [...prev, `✗ Test failed (${testCase.barcode}): ${error}`]);
      }
    }
  };

  const handleSimpleTestPrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      console.error("Failed to open print window. Please check popup blocker settings.");
      return;
    }
    
    printWindow.document.write(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Simple Print Test</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    @page {
      size: 55mm 25mm;
      margin: 0;
    }
    
    body {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: #fff;
      font-family: Arial, sans-serif;
      font-size: 12px;
    }
  </style>
</head>
<body onload="window.print(); window.onafterprint = function() { window.close(); };">
  PGS TEST
</body>
</html>`);
    printWindow.document.close();
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-slate-900 min-h-screen">
      <h1 className="text-2xl font-bold text-white mb-6">Barcode Generator Test Page</h1>
      
      <div className="bg-slate-800 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4">Test Configuration</h2>
        
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">Product Name</label>
            <input
              type="text"
              value={testData.productName}
              onChange={(e) => setTestData({ ...testData, productName: e.target.value })}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Barcode</label>
            <input
              type="text"
              value={testData.barcode}
              onChange={(e) => setTestData({ ...testData, barcode: e.target.value })}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Selling Price</label>
            <input
              type="number"
              value={testData.sellingPrice}
              onChange={(e) => setTestData({ ...testData, sellingPrice: Number(e.target.value) })}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Condition</label>
            <select
              value={testData.condition}
              onChange={(e) => setTestData({ ...testData, condition: e.target.value })}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
            >
              <option value="NEW">NEW</option>
              <option value="USED">USED</option>
              <option value="">None</option>
            </select>
          </div>
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={handleGenerate}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium"
          >
            Generate Label
          </button>
          <button
            onClick={handlePrint}
            disabled={!generatedCanvas}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded font-medium disabled:opacity-50"
          >
            Print Label
          </button>
          <button
            onClick={runTestSuite}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded font-medium"
          >
            Run Test Suite
          </button>
          <button
            onClick={handleSimpleTestPrint}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded font-medium"
          >
            Simple Print Test
          </button>
        </div>
      </div>
      
      {generatedCanvas && (
        <div className="bg-slate-800 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">Generated Label Preview</h2>
          <div className="bg-white p-4 rounded inline-block">
            <img 
              src={generatedCanvas.toDataURL("image/png")} 
              alt="Generated Label"
              className="max-w-full h-auto"
            />
          </div>
          <p className="text-sm text-slate-300 mt-4">
            Canvas dimensions: {generatedCanvas.width}x{generatedCanvas.height}px
          </p>
        </div>
      )}
      
      {testResults.length > 0 && (
        <div className="bg-slate-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Test Results</h2>
          <div className="space-y-2">
            {testResults.map((result, index) => (
              <div key={index} className={`text-sm ${result.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>
                {result}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
