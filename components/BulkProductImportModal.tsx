"use client";

import React, { useState, useRef } from "react";
import {
  FileSpreadsheet,
  Upload,
  Download,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  X,
  FileText,
  RefreshCw,
  Info,
  Check,
} from "lucide-react";
import type { ValidatedRow, ImportReportItem } from "@/lib/productBulkImport";

interface BulkProductImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function BulkProductImportModal({
  isOpen,
  onClose,
  onSuccess,
}: BulkProductImportModalProps) {
  const [step, setStep] = useState<"upload" | "preview" | "result">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState("");

  // Preview Data
  const [previewSummary, setPreviewSummary] = useState<{
    totalRows: number;
    readyCount: number;
    duplicateCount: number;
    actionRequiredCount: number;
    invalidCount: number;
  } | null>(null);
  const [rows, setRows] = useState<ValidatedRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "Ready" | "SuggestedGroup" | "Duplicate" | "ActionRequired" | "Invalid"
  >("ALL");

  // Result Data
  const [importResult, setImportResult] = useState<{
    importedCount: number;
    skippedCount: number;
    invalidCount: number;
    reports: ImportReportItem[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleReset = () => {
    setStep("upload");
    setFile(null);
    setLoading(false);
    setExecuting(false);
    setError("");
    setPreviewSummary(null);
    setRows([]);
    setImportResult(null);
    setStatusFilter("ALL");
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  // Download Excel Template
  const handleDownloadTemplate = () => {
    window.open("/api/products/template", "_blank");
  };

  // Process File Select
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      const name = selected.name.toLowerCase();
      if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
        setError("Only .xlsx and .xls files are allowed.");
        return;
      }
      setError("");
      setFile(selected);
      uploadAndPreview(selected);
    }
  };

  // Upload and Parse Preview
  const uploadAndPreview = async (fileToUpload: File) => {
    setLoading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", fileToUpload);
      formData.append("action", "preview");

      const res = await fetch("/api/products/bulk-import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to parse Excel spreadsheet.");
      }

      const rowsData: ValidatedRow[] = data.rows || [];
      setRows(rowsData);

      setPreviewSummary({
        totalRows: rowsData.length,
        readyCount: rowsData.filter((r) => r.status === "Ready").length,
        duplicateCount: rowsData.filter((r) => r.status === "Duplicate").length,
        actionRequiredCount: rowsData.filter(
          (r) => r.status === "ActionRequired" || r.status === "SuggestedGroup"
        ).length,
        invalidCount: rowsData.filter((r) => r.status === "Invalid").length,
      });

      setStep("preview");
    } catch (err: any) {
      setError(err.message || "Failed to process Excel file.");
    } fontally: {
      setLoading(false);
    }
  };

  // Accept Suggested Group mapping across all matching Excel rows
  const handleAcceptSuggestedGroup = (
    excelGroup: string,
    suggestedId: string,
    suggestedName: string
  ) => {
    const updatedRows = rows.map((r) => {
      if (
        r.productGroupName &&
        r.productGroupName.trim().toLowerCase() === excelGroup.trim().toLowerCase()
      ) {
        const isReadyNow = r.status === "SuggestedGroup" || r.status === "Ready";
        return {
          ...r,
          productGroupId: suggestedId,
          productGroupName: suggestedName,
          suggestedGroupId: undefined,
          suggestedGroupName: undefined,
          status: isReadyNow ? ("Ready" as const) : r.status,
          reason: isReadyNow ? "Linked to existing Product Group" : r.reason,
        };
      }
      return r;
    });

    setRows(updatedRows);

    setPreviewSummary({
      totalRows: updatedRows.length,
      readyCount: updatedRows.filter((r) => r.status === "Ready").length,
      duplicateCount: updatedRows.filter((r) => r.status === "Duplicate").length,
      actionRequiredCount: updatedRows.filter(
        (r) => r.status === "ActionRequired" || r.status === "SuggestedGroup"
      ).length,
      invalidCount: updatedRows.filter((r) => r.status === "Invalid").length,
    });
  };

  // Execute Import
  const handleExecuteImport = async () => {
    if (!rows || rows.length === 0) return;
    setExecuting(true);
    setError("");

    try {
      const readyRows = rows.filter((r) => r.status === "Ready");
      const res = await fetch("/api/products/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "execute",
          rows: readyRows,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to execute bulk import.");
      }

      setImportResult(data.data);
      setStep("result");
      onSuccess();
    } catch (err: any) {
      setError(err.message || "Bulk import execution failed.");
    } finally {
      setExecuting(false);
    }
  };

  // Download Import Report
  const handleDownloadReport = async () => {
    if (!importResult || !importResult.reports) return;

    try {
      const res = await fetch("/api/products/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "export-report",
          reports: importResult.reports,
        }),
      });

      if (!res.ok) throw new Error("Failed to export report.");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Import_Report_${new Date().toISOString().substring(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err: any) {
      alert(err.message || "Error downloading report.");
    }
  };

  const filteredRows = rows.filter((r) => {
    if (statusFilter === "ALL") return true;
    return r.status === statusFilter;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">
                Bulk Product Import from Excel
              </h2>
              <p className="text-xs text-slate-400">
                Upload `.xlsx` or `.xls` spreadsheet to create multiple product variants safely.
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {error && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-3">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: Upload File */}
          {step === "upload" && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-950/60 border border-slate-800 rounded-xl">
                <div>
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Need the Excel Template?
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Download our formatted spreadsheet template with sample product entries.
                  </p>
                </div>
                <button
                  onClick={handleDownloadTemplate}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-indigo-300 text-xs font-bold rounded-lg border border-slate-700 flex items-center gap-2 transition-colors cursor-pointer shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Excel Template</span>
                </button>
              </div>

              {/* Upload Dropzone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-indigo-500 bg-slate-950/40 hover:bg-slate-950/80 rounded-2xl p-10 text-center transition-all cursor-pointer space-y-3"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="w-12 h-12 bg-indigo-500/10 text-indigo-400 rounded-2xl flex items-center justify-center mx-auto border border-indigo-500/20">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-200">
                    Click or Drag Excel File to Upload
                  </h4>
                  <p className="text-xs text-slate-400 mt-1">
                    Supports Microsoft Excel `.xlsx` and `.xls` formats
                  </p>
                </div>
              </div>

              {loading && (
                <div className="p-6 text-center space-y-2 bg-slate-950/60 border border-slate-800 rounded-xl">
                  <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin mx-auto" />
                  <p className="text-xs text-slate-300 font-medium">
                    Parsing spreadsheet and validating product variants...
                  </p>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Preview & Validation Table */}
          {step === "preview" && previewSummary && (
            <div className="space-y-5">
              {/* Stat Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Total Rows
                  </span>
                  <span className="text-lg font-bold text-slate-100 mt-0.5 block">
                    {previewSummary.totalRows}
                  </span>
                </div>
                <div className="bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20 text-center">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                    Ready to Import
                  </span>
                  <span className="text-lg font-bold text-emerald-300 mt-0.5 block">
                    {previewSummary.readyCount}
                  </span>
                </div>
                <div className="bg-amber-500/10 p-3 rounded-xl border border-amber-500/20 text-center">
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                    Duplicates (Skipped)
                  </span>
                  <span className="text-lg font-bold text-amber-300 mt-0.5 block">
                    {previewSummary.duplicateCount}
                  </span>
                </div>
                <div className="bg-orange-500/10 p-3 rounded-xl border border-orange-500/20 text-center">
                  <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wider block">
                    Action Required
                  </span>
                  <span className="text-lg font-bold text-orange-300 mt-0.5 block">
                    {previewSummary.actionRequiredCount}
                  </span>
                </div>
                <div className="bg-rose-500/10 p-3 rounded-xl border border-rose-500/20 text-center">
                  <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block">
                    Invalid Rows
                  </span>
                  <span className="text-lg font-bold text-rose-300 mt-0.5 block">
                    {previewSummary.invalidCount}
                  </span>
                </div>
              </div>

              {/* Status Filter Tabs */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                <div className="flex flex-wrap items-center gap-1">
                  {(
                    [
                      "ALL",
                      "Ready",
                      "SuggestedGroup",
                      "Duplicate",
                      "ActionRequired",
                      "Invalid",
                    ] as const
                  ).map((st) => (
                    <button
                      key={st}
                      onClick={() => setStatusFilter(st)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        statusFilter === st
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-800 text-slate-300 hover:bg-slate-750"
                      }`}
                    >
                      {st === "ALL"
                        ? `All Rows (${rows.length})`
                        : st === "SuggestedGroup"
                        ? `Suggested Groups (${rows.filter((r) => r.status === "SuggestedGroup").length})`
                        : st === "ActionRequired"
                        ? `Action Required (${rows.filter((r) => r.status === "ActionRequired").length})`
                        : `${st} (${rows.filter((r) => r.status === st).length})`}
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleReset}
                  className="text-xs text-slate-400 hover:text-slate-200 underline cursor-pointer"
                >
                  Upload Different File
                </button>
              </div>

              {/* Preview Table */}
              <div className="overflow-x-auto border border-slate-800 rounded-xl max-h-72">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider sticky top-0">
                    <tr>
                      <th className="p-3">Row</th>
                      <th className="p-3">Product Name</th>
                      <th className="p-3">Category</th>
                      <th className="p-3 text-center">Condition</th>
                      <th className="p-3 text-center">Product Status</th>
                      <th className="p-3 text-center">Import Status</th>
                      <th className="p-3">Validation & Resolution</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300 font-medium bg-slate-900/60">
                    {filteredRows.map((r) => (
                      <tr key={r.rowNumber} className="hover:bg-slate-850/40">
                        <td className="p-3 font-mono font-bold text-slate-400">{r.rowNumber}</td>
                        <td className="p-3 font-bold text-slate-200">{r.name}</td>
                        <td className="p-3">{r.categoryName}</td>
                        <td className="p-3 text-center">
                          <span className="px-2 py-0.5 text-[9px] font-bold uppercase rounded bg-slate-800 text-slate-300">
                            {r.condition}
                          </span>
                        </td>

                        {/* PRODUCT STATUS (Active/Inactive from Excel) */}
                        <td className="p-3 text-center">
                          <span
                            className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded ${
                              r.productStatus === "Active"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : "bg-slate-800 text-slate-400 border border-slate-700"
                            }`}
                          >
                            {r.productStatus}
                          </span>
                        </td>

                        {/* IMPORT STATUS */}
                        <td className="p-3 text-center">
                          <span
                            className={`px-2 py-0.5 text-[9px] font-extrabold uppercase rounded-full border ${
                              r.status === "Ready"
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : r.status === "SuggestedGroup"
                                ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/20"
                                : r.status === "ActionRequired"
                                ? "bg-orange-500/10 text-orange-400 border-orange-500/20"
                                : r.status === "Duplicate"
                                ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                            }`}
                          >
                            {r.status === "Ready"
                              ? "READY"
                              : r.status === "SuggestedGroup"
                              ? "⚠️ SUGGESTED GROUP"
                              : r.status === "ActionRequired"
                              ? "ACTION REQUIRED"
                              : r.status === "Duplicate"
                              ? "DUPLICATE"
                              : "INVALID"}
                          </span>
                        </td>

                        {/* Validation Reason & Resolution */}
                        <td className="p-3 text-xs text-slate-400">
                          {r.status === "SuggestedGroup" && r.suggestedGroupId ? (
                            <div className="space-y-1 bg-indigo-950/40 p-2 rounded-lg border border-indigo-800/40">
                              <div className="flex items-center gap-1.5 text-amber-300 font-bold text-[11px]">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                <span>Possible Product Group Match</span>
                              </div>
                              <div className="text-[11px] text-slate-300">
                                Excel Group: <span className="font-mono text-amber-200">{r.productGroupName}</span>
                              </div>
                              <div className="text-[11px] text-emerald-300">
                                Suggested: <span className="font-mono font-bold">{r.suggestedGroupName}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  handleAcceptSuggestedGroup(
                                    r.productGroupName || "",
                                    r.suggestedGroupId!,
                                    r.suggestedGroupName!
                                  )
                                }
                                className="mt-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                              >
                                <Check className="w-3 h-3" />
                                <span>Use Existing Group</span>
                              </button>
                            </div>
                          ) : r.status === "ActionRequired" ? (
                            <div className="space-y-1 text-orange-300">
                              <div className="font-medium text-slate-300">{r.reason}</div>
                              <div className="text-[10px] text-slate-450">
                                Create this Product Group in the system first, then re-import.
                              </div>
                            </div>
                          ) : (
                            <span>{r.reason || "Valid product entry"}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* STEP 3: Final Import Summary */}
          {step === "result" && importResult && (
            <div className="space-y-6">
              <div className="p-5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400 space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                  <h3 className="text-base font-bold">Bulk Import Execution Complete</h3>
                </div>
                <p className="text-xs text-slate-300 pl-8">
                  Import operation completed. Valid products were created with unique system SKUs and Barcodes.
                </p>
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-center">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                    Successfully Imported
                  </span>
                  <span className="text-xl font-extrabold text-emerald-300 mt-1 block">
                    {importResult.importedCount}
                  </span>
                </div>
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-center">
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                    Skipped Duplicates
                  </span>
                  <span className="text-xl font-extrabold text-amber-300 mt-1 block">
                    {importResult.skippedCount}
                  </span>
                </div>
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-center">
                  <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block">
                    Invalid / Skipped Rows
                  </span>
                  <span className="text-xl font-extrabold text-rose-300 mt-1 block">
                    {importResult.invalidCount}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <button
                  onClick={handleDownloadReport}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 text-xs font-bold rounded-xl border border-slate-700 flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Import Report (.xlsx)</span>
                </button>
                <button
                  onClick={handleClose}
                  className="px-6 py-2.5 bg-indigo-650 hover:bg-indigo-600 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Done & View Products
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer (Preview Step Only) */}
        {step === "preview" && previewSummary && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-950/60">
            <span className="text-xs text-slate-400">
              {previewSummary.readyCount} product(s) ready for creation.
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={handleClose}
                className="px-4 py-2 rounded-xl border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteImport}
                disabled={executing || previewSummary.readyCount === 0}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-emerald-900/30"
              >
                {executing ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                <span>Import {previewSummary.readyCount} Valid Product(s)</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
