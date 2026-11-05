"use client";

import React, { useEffect, useState, useMemo } from "react";
import { HRSubNav } from "@/components/HRSubNav";
import {
  Banknote,
  Lock,
  Unlock,
  RefreshCw,
  Printer,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Clock,
  TrendingDown,
  TrendingUp,
  X,
  CalendarRange,
  Wallet,
  SlidersHorizontal,
  Plus,
} from "lucide-react";

export type CycleMode = "MONTHLY" | "10TH" | "12TH" | "CUSTOM";

export default function HRPayrollPage() {
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, "0")}`;

  const [cycleMode, setCycleMode] = useState<CycleMode>("MONTHLY");
  const [month, setMonth] = useState(currentMonthStr);
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any | null>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [calculating, setCalculating] = useState(false);

  // Release / Reopen modal
  const [showStatusModal, setShowStatusModal] = useState<
    "RELEASE" | "REOPEN" | null
  >(null);
  const [statusReason, setStatusReason] = useState("");
  const [statusSubmitting, setStatusSubmitting] = useState(false);

  // Payslip Modal
  const [selectedSlip, setSelectedSlip] = useState<any | null>(null);
  const [slipFormat, setSlipFormat] = useState<"THERMAL" | "A4">("THERMAL");

  // Row Adjustment Modal (Bonus / Card Fee / Notes)
  const [adjustRecord, setAdjustRecord] = useState<any | null>(null);
  const [adjBonus, setAdjBonus] = useState("0");
  const [adjCardFee, setAdjCardFee] = useState("0");
  const [adjNotes, setAdjNotes] = useState("");
  const [adjSaving, setAdjSaving] = useState(false);

  // Salary Advances Modal
  const [showAdvancesModal, setShowAdvancesModal] = useState(false);
  const [advancesList, setAdvancesList] = useState<any[]>([]);
  const [advEmpId, setAdvEmpId] = useState("");
  const [advAmount, setAdvAmount] = useState("");
  const [advMonthly, setAdvMonthly] = useState("");
  const [advDate, setAdvDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [advReason, setAdvReason] = useState("");
  const [advNotes, setAdvNotes] = useState("");
  const [advSubmitting, setAdvSubmitting] = useState(false);

  // Overtime Modal
  const [showOvertimeModal, setShowOvertimeModal] = useState(false);
  const [overtimeList, setOvertimeList] = useState<any[]>([]);
  const [otEmpId, setOtEmpId] = useState("");
  const [otDate, setOtDate] = useState(new Date().toISOString().split("T")[0]);
  const [otHours, setOtHours] = useState("2");
  const [otMultiplier, setOtMultiplier] = useState("1.0");
  const [otReason, setOtReason] = useState("");
  const [otSubmitting, setOtSubmitting] = useState(false);

  // Compute active date range and periodKey
  const activePeriod = useMemo(() => {
    const [y, m] = month.split("-").map(Number);

    if (cycleMode === "MONTHLY") {
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const startDate = `${month}-01`;
      const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;
      const periodLabel = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(
        "en-US",
        { month: "long", year: "numeric" }
      );
      return {
        periodKey: month,
        startDate,
        endDate,
        periodLabel: `${periodLabel} (1st → ${lastDay}th)`,
      };
    } else if (cycleMode === "10TH") {
      const prevDate = new Date(Date.UTC(y, m - 2, 11));
      const prevY = prevDate.getUTCFullYear();
      const prevM = String(prevDate.getUTCMonth() + 1).padStart(2, "0");
      const startDate = `${prevY}-${prevM}-11`;
      const endDate = `${y}-${String(m).padStart(2, "0")}-10`;
      const prevMonthName = prevDate.toLocaleDateString("en-US", {
        month: "short",
      });
      const currMonthName = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(
        "en-US",
        { month: "short", year: "numeric" }
      );
      return {
        periodKey: `${startDate}_to_${endDate}`,
        startDate,
        endDate,
        periodLabel: `11 ${prevMonthName} → 10 ${currMonthName} (10th Payout)`,
      };
    } else if (cycleMode === "12TH") {
      const prevDate = new Date(Date.UTC(y, m - 2, 13));
      const prevY = prevDate.getUTCFullYear();
      const prevM = String(prevDate.getUTCMonth() + 1).padStart(2, "0");
      const startDate = `${prevY}-${prevM}-13`;
      const endDate = `${y}-${String(m).padStart(2, "0")}-12`;
      const prevMonthName = prevDate.toLocaleDateString("en-US", {
        month: "short",
      });
      const currMonthName = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(
        "en-US",
        { month: "short", year: "numeric" }
      );
      return {
        periodKey: `${startDate}_to_${endDate}`,
        startDate,
        endDate,
        periodLabel: `13 ${prevMonthName} → 12 ${currMonthName} (12th Payout)`,
      };
    } else {
      const startDate = customStartDate || `${month}-01`;
      const endDate = customEndDate || `${month}-28`;
      return {
        periodKey: `${startDate}_to_${endDate}`,
        startDate,
        endDate,
        periodLabel: `Custom Range: ${startDate} → ${endDate}`,
      };
    }
  }, [cycleMode, month, customStartDate, customEndDate]);

  const fetchPayroll = async () => {
    try {
      setLoading(true);
      setError("");
      const params = new URLSearchParams();
      params.set("month", activePeriod.periodKey);
      params.set("startDate", activePeriod.startDate);
      params.set("endDate", activePeriod.endDate);

      const [res, empRes] = await Promise.all([
        fetch(`/api/hr/payroll?${params.toString()}`),
        employees.length === 0
          ? fetch("/api/hr/employees")
          : Promise.resolve(null),
      ]);

      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        setError(json.error || "Failed to load payroll.");
      }

      if (empRes) {
        const empJson = await empRes.json();
        if (empJson.success) setEmployees(empJson.data || []);
      }
    } catch (err: any) {
      setError(err.message || "Network error");
    } finally {
      setLoading(false);
    }
  };

  const fetchAdvances = async () => {
    try {
      const res = await fetch("/api/hr/advances");
      const json = await res.json();
      if (json.success) setAdvancesList(json.data || []);
    } catch {
      // ignore
    }
  };

  const fetchOvertimes = async () => {
    try {
      const params = new URLSearchParams({
        startDate: activePeriod.startDate,
        endDate: activePeriod.endDate,
      });
      const res = await fetch(`/api/hr/overtime?${params.toString()}`);
      const json = await res.json();
      if (json.success) setOvertimeList(json.data || []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchPayroll();
  }, [activePeriod.periodKey]);

  const handleCalculateDraft = async (customAdjustments?: any[]) => {
    try {
      setCalculating(true);
      setError("");
      setMessage("");
      const res = await fetch("/api/hr/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: activePeriod.periodKey,
          startDate: activePeriod.startDate,
          endDate: activePeriod.endDate,
          periodLabel: activePeriod.periodLabel,
          adjustments: customAdjustments,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage(json.message);
        fetchPayroll();
      } else {
        setError(json.error || "Calculation failed.");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCalculating(false);
    }
  };

  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustRecord) return;
    try {
      setAdjSaving(true);
      const empId = adjustRecord.employee?._id || adjustRecord.employee;
      await handleCalculateDraft([
        {
          employeeId: empId,
          bonus: Number(adjBonus) || 0,
          cardFee: Number(adjCardFee) || 0,
          notes: adjNotes.trim(),
        },
      ]);
      setAdjustRecord(null);
    } finally {
      setAdjSaving(false);
    }
  };

  const handleIssueAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!advEmpId || !advAmount || !advMonthly || !advReason.trim()) return;
    try {
      setAdvSubmitting(true);
      setError("");
      const res = await fetch("/api/hr/advances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: advEmpId,
          amount: Number(advAmount),
          monthlyDeduction: Number(advMonthly),
          issueDate: advDate,
          reason: advReason.trim(),
          notes: advNotes.trim(),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage("Salary advance issued. Click Calculate Draft to refresh deductions.");
        setAdvEmpId("");
        setAdvAmount("");
        setAdvMonthly("");
        setAdvReason("");
        setAdvNotes("");
        fetchAdvances();
      } else {
        setError(json.error || "Failed to issue advance.");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAdvSubmitting(false);
    }
  };

  const handleAddOvertime = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otEmpId || !otDate || !otHours || !otReason.trim()) return;
    try {
      setOtSubmitting(true);
      setError("");
      const mins = Math.round(Number(otHours) * 60);
      const res = await fetch("/api/hr/overtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: otEmpId,
          date: otDate,
          extraMinutes: mins,
          approvedMinutes: mins,
          rateMultiplier: Number(otMultiplier) || 1.0,
          reason: otReason.trim(),
          status: "APPROVED",
        }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage("Overtime approved. Click Calculate Draft to apply to payroll.");
        setOtEmpId("");
        setOtReason("");
        fetchOvertimes();
      } else {
        setError(json.error || "Failed to save overtime.");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setOtSubmitting(false);
    }
  };

  const handleStatusChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusReason.trim()) {
      setError("A written reason is required.");
      return;
    }

    try {
      setStatusSubmitting(true);
      setError("");
      setMessage("");
      const action =
        showStatusModal === "RELEASE" ? "RELEASE_AND_LOCK" : "REOPEN";

      const res = await fetch("/api/hr/payroll", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: activePeriod.periodKey,
          action,
          reason: statusReason.trim(),
        }),
      });

      const json = await res.json();
      if (json.success) {
        setMessage(json.message);
        setShowStatusModal(null);
        setStatusReason("");
        fetchPayroll();
      } else {
        setError(json.error || "Action failed.");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setStatusSubmitting(false);
    }
  };

  const handlePrintPayslip = () => {
    window.print();
  };

  const isLocked = data?.isMonthLocked;
  const records = data?.records || [];
  const totals = data?.totals || {};

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6">
      <HRSubNav />

      {/* Header and Controls */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Banknote className="w-5 h-5 text-emerald-500" />
            Monthly Payroll & Custom Cycles
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Calculate by Calendar Month, 10th/12th Salary Cutoff, or Custom Date Ranges with Method A & 3-Late penalty
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              fetchAdvances();
              setShowAdvancesModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700 rounded text-xs font-semibold transition"
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>Salary Advances</span>
          </button>

          <button
            onClick={() => {
              fetchOvertimes();
              setShowOvertimeModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-purple-300 border border-slate-700 rounded text-xs font-semibold transition"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Overtime</span>
          </button>

          {!isLocked ? (
            <>
              <button
                onClick={() => handleCalculateDraft()}
                disabled={calculating}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold disabled:opacity-50 transition shadow-sm"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${calculating ? "animate-spin" : ""}`}
                />
                <span>{calculating ? "Calculating..." : "Calculate Draft"}</span>
              </button>

              <button
                onClick={() => setShowStatusModal("RELEASE")}
                disabled={records.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold disabled:opacity-50 transition shadow-sm"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Release Payout & Lock</span>
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-xs font-bold">
                <Lock className="w-3.5 h-3.5" />
                <span>Period Locked</span>
              </span>

              <button
                onClick={() => setShowStatusModal("REOPEN")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-semibold transition"
              >
                <Unlock className="w-3.5 h-3.5" />
                <span>Reopen Period</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Salary Cycle & Date Range Selector Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 mb-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-400 mr-1 flex items-center gap-1">
              <CalendarRange className="w-3.5 h-3.5 text-blue-400" />
              <span>Salary Cycle:</span>
            </span>

            <button
              onClick={() => setCycleMode("MONTHLY")}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition border ${
                cycleMode === "MONTHLY"
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800"
              }`}
            >
              Calendar Month (1st → End)
            </button>

            <button
              onClick={() => setCycleMode("10TH")}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition border ${
                cycleMode === "10TH"
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800"
              }`}
            >
              10th Cutoff (11th → 10th)
            </button>

            <button
              onClick={() => setCycleMode("12TH")}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition border ${
                cycleMode === "12TH"
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800"
              }`}
            >
              12th Cutoff (13th → 12th)
            </button>

            <button
              onClick={() => {
                setCycleMode("CUSTOM");
                if (!customStartDate) setCustomStartDate(`${month}-01`);
                if (!customEndDate) setCustomEndDate(`${month}-28`);
              }}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition border ${
                cycleMode === "CUSTOM"
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800"
              }`}
            >
              Custom Dates (From → To)
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {cycleMode !== "CUSTOM" ? (
              <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-400 text-[11px]">Payout Month:</span>
                <input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="bg-transparent text-slate-200 focus:outline-none font-semibold cursor-pointer"
                />
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs">
                <span className="text-slate-400 text-[11px]">From:</span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
                />
                <span className="text-slate-400 text-[11px]">To:</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
                />
              </div>
            )}

            <div className="px-2.5 py-1 bg-slate-800/80 border border-slate-700/60 rounded text-[11px] font-mono text-emerald-400 flex items-center gap-1">
              <span>{activePeriod.periodLabel}</span>
            </div>
          </div>
        </div>
      </div>

      {message && (
        <div className="mb-4 p-3 bg-emerald-950/80 border border-emerald-800 text-emerald-200 text-xs rounded flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-rose-950/80 border border-rose-800 text-rose-200 text-xs rounded flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="text-[11px] text-slate-400">Total Base Salary</div>
          <div className="text-lg font-bold text-slate-100 mt-0.5">
            PKR {(totals.totalBaseSalary || 0).toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {records.length} Employees
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="text-[11px] text-slate-400">Additions (OT + Bonus)</div>
          <div className="text-lg font-bold text-emerald-400 mt-0.5 flex items-center gap-1">
            <TrendingUp className="w-4 h-4" />
            PKR {((totals.totalOvertimePay || 0) + (totals.totalBonus || 0)).toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            OT: PKR {(totals.totalOvertimePay || 0).toLocaleString()} · Bonus: PKR {(totals.totalBonus || 0).toLocaleString()}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="text-[11px] text-slate-400">Total Deductions</div>
          <div className="text-lg font-bold text-rose-400 mt-0.5 flex items-center gap-1">
            <TrendingDown className="w-4 h-4" />
            PKR {(
              (totals.totalShortDeductions || 0) +
              (totals.totalLateDeductions || 0) +
              (totals.totalUnpaidLeaveDeductions || 0) +
              (totals.totalAdvanceDeductions || 0) +
              (totals.totalCardFeeDeductions || 0)
            ).toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Advances: PKR {(totals.totalAdvanceDeductions || 0).toLocaleString()}
          </div>
        </div>

        <div className="bg-slate-900 border border-emerald-900/60 rounded-lg p-3 bg-emerald-950/20">
          <div className="text-[11px] text-emerald-300 font-semibold">Net Payout Release</div>
          <div className="text-xl font-bold text-emerald-400 mt-0.5">
            PKR {(totals.totalNetSalary || 0).toLocaleString()}
          </div>
          <div className="text-[10px] text-emerald-500/80 mt-0.5">
            {isLocked ? "Finalized & Released" : "Estimated Draft"}
          </div>
        </div>
      </div>

      {/* Staff Payroll Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 text-slate-400 uppercase font-semibold border-b border-slate-800">
              <tr>
                <th className="p-3">Staff</th>
                <th className="p-3 text-right">Base Salary</th>
                <th className="p-3 text-center">Clocked / Target</th>
                <th className="p-3 text-center">3-Late Penalty</th>
                <th className="p-3 text-right">Short / Leave Cut</th>
                <th className="p-3 text-right">Overtime</th>
                <th className="p-3 text-right">Advance / Fee</th>
                <th className="p-3 text-right">Bonus</th>
                <th className="p-3 text-right">Net Salary</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-500">
                    Loading payroll for {activePeriod.periodLabel}...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-500">
                    No payroll draft calculated yet for this period ({activePeriod.periodLabel}). Click &quot;Calculate Draft&quot; above.
                  </td>
                </tr>
              ) : (
                records.map((r: any) => {
                  const totalShortAndLeave =
                    (r.shortHoursDeduction || 0) + (r.unpaidLeaveDeduction || 0);
                  const totalAdvAndCard =
                    (r.advanceDeduction || 0) + (r.cardFeeDeduction || 0);
                  return (
                    <tr key={r._id} className="hover:bg-slate-800/40 transition">
                      <td className="p-3">
                        <div className="font-semibold text-slate-100">{r.employeeName}</div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {r.employeeCode} · {r.designation}
                        </div>
                        {r.paidOffsCount > 0 && (
                          <div className="text-[10px] text-blue-400">
                            {r.paidOffsCount} Paid Off(s) credited
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono">
                        PKR {r.baseSalary?.toLocaleString()}
                      </td>
                      <td className="p-3 text-center">
                        <div className="font-mono text-slate-200">
                          {r.clockedWorkedHours}h / {r.targetHours}h
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {r.shortHours === 0 ? (
                            <span className="text-emerald-400 font-bold">Compensated ✓</span>
                          ) : (
                            <span className="text-rose-400">-{r.shortHours}h short</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <div className="font-mono text-slate-200">
                          {r.lateArrivalsCount || 0} lates
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {r.latePenaltyDays > 0 ? (
                            <span className="text-rose-400 font-bold">
                              -{r.latePenaltyDays}d cut (PKR {r.lateDeduction?.toLocaleString()})
                            </span>
                          ) : (
                            <span className="text-slate-500">0 penalty</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-right font-mono text-rose-400">
                        {totalShortAndLeave > 0
                          ? `-PKR ${totalShortAndLeave.toLocaleString()}`
                          : "—"}
                      </td>
                      <td className="p-3 text-right font-mono text-emerald-400">
                        {r.overtimePay > 0 ? `+PKR ${r.overtimePay.toLocaleString()}` : "—"}
                      </td>
                      <td className="p-3 text-right font-mono text-amber-400">
                        {totalAdvAndCard > 0
                          ? `-PKR ${totalAdvAndCard.toLocaleString()}`
                          : "—"}
                      </td>
                      <td className="p-3 text-right font-mono text-emerald-400">
                        {r.bonus > 0 ? `+PKR ${r.bonus.toLocaleString()}` : "—"}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-slate-100 text-sm">
                        PKR {r.netSalary?.toLocaleString()}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {!isLocked && (
                            <button
                              onClick={() => {
                                setAdjustRecord(r);
                                setAdjBonus(String(r.bonus || 0));
                                setAdjCardFee(String(r.cardFeeDeduction || 0));
                                setAdjNotes(r.notes || "");
                              }}
                              title="Adjust Bonus / Card Fee / Notes"
                              className="p-1 px-2 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded text-xs font-semibold inline-flex items-center gap-1"
                            >
                              <SlidersHorizontal className="w-3 h-3" />
                              <span>Adjust</span>
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedSlip(r)}
                            className="p-1 px-2.5 bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700 rounded text-xs font-semibold inline-flex items-center gap-1"
                          >
                            <Printer className="w-3 h-3" />
                            <span>Slip</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Adjust Bonus / Card Fee Modal */}
      {adjustRecord && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-md w-full p-5 shadow-2xl">
            <h3 className="text-base font-bold text-slate-100 mb-3 flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-amber-400" />
              Adjust Payroll — {adjustRecord.employeeName}
            </h3>
            <form onSubmit={handleSaveAdjustment} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">
                  Bonus / Incentive Addition (PKR)
                </label>
                <input
                  type="number"
                  min="0"
                  value={adjBonus}
                  onChange={(e) => setAdjBonus(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">
                  Lost Card / Penalty Deduction (PKR)
                </label>
                <input
                  type="number"
                  min="0"
                  value={adjCardFee}
                  onChange={(e) => setAdjCardFee(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Payslip Notes</label>
                <input
                  type="text"
                  value={adjNotes}
                  onChange={(e) => setAdjNotes(e.target.value)}
                  placeholder="e.g. Sales target bonus included"
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setAdjustRecord(null)}
                  className="px-3 py-1.5 rounded text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjSaving}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded disabled:opacity-50"
                >
                  {adjSaving ? "Saving..." : "Save & Recalculate"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Salary Advances Modal */}
      {showAdvancesModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Wallet className="w-4 h-4 text-amber-400" />
                Staff Salary Advances & Installment Recovery
              </h3>
              <button
                onClick={() => setShowAdvancesModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleIssueAdvance}
              className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 mb-4 space-y-3 text-xs"
            >
              <div className="font-bold text-amber-300 flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                Issue New Salary Advance
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-slate-400 mb-1">Employee *</label>
                  <select
                    value={advEmpId}
                    onChange={(e) => setAdvEmpId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-slate-200"
                    required
                  >
                    <option value="">-- Select Staff --</option>
                    {employees.map((emp) => (
                      <option key={emp._id} value={emp._id}>
                        {emp.name} ({emp.employeeCode})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">
                    Total Advance (PKR) *
                  </label>
                  <input
                    type="number"
                    min="100"
                    value={advAmount}
                    onChange={(e) => {
                      setAdvAmount(e.target.value);
                      if (!advMonthly) setAdvMonthly(e.target.value);
                    }}
                    placeholder="e.g. 15000"
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-slate-200"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">
                    Monthly Deduction (PKR) *
                  </label>
                  <input
                    type="number"
                    min="100"
                    value={advMonthly}
                    onChange={(e) => setAdvMonthly(e.target.value)}
                    placeholder="e.g. 5000"
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-slate-200"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-slate-400 mb-1">Issue Date *</label>
                  <input
                    type="date"
                    value={advDate}
                    onChange={(e) => setAdvDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-slate-200"
                    required
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-slate-400 mb-1">Reason *</label>
                  <input
                    type="text"
                    value={advReason}
                    onChange={(e) => setAdvReason(e.target.value)}
                    placeholder="e.g. Personal emergency advance approved by Owner"
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-slate-200"
                    required
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={advSubmitting}
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded disabled:opacity-50"
                >
                  {advSubmitting ? "Recording..." : "Record Advance"}
                </button>
              </div>
            </form>

            <div className="overflow-x-auto border border-slate-800 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-2.5">Staff</th>
                    <th className="p-2.5">Date</th>
                    <th className="p-2.5 text-right">Amount</th>
                    <th className="p-2.5 text-right">Monthly Cut</th>
                    <th className="p-2.5 text-right">Remaining</th>
                    <th className="p-2.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {advancesList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-slate-500">
                        No salary advances recorded yet.
                      </td>
                    </tr>
                  ) : (
                    advancesList.map((a) => (
                      <tr key={a._id}>
                        <td className="p-2.5 font-semibold text-slate-200">
                          {a.employee?.name} ({a.employee?.employeeCode})
                        </td>
                        <td className="p-2.5 font-mono text-slate-400">
                          {a.issueDate}
                        </td>
                        <td className="p-2.5 text-right font-mono">
                          PKR {a.amount?.toLocaleString()}
                        </td>
                        <td className="p-2.5 text-right font-mono text-amber-400">
                          PKR {a.monthlyDeduction?.toLocaleString()}/mo
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-rose-400">
                          PKR {a.remainingBalance?.toLocaleString()}
                        </td>
                        <td className="p-2.5 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              a.status === "ACTIVE"
                                ? "bg-amber-950 text-amber-400 border border-amber-800"
                                : "bg-emerald-950 text-emerald-400 border border-emerald-800"
                            }`}
                          >
                            {a.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Overtime Approval Modal */}
      {showOvertimeModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-400" />
                Overtime Approvals ({activePeriod.periodLabel})
              </h3>
              <button
                onClick={() => setShowOvertimeModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!isLocked && (
              <form
                onSubmit={handleAddOvertime}
                className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 mb-4 space-y-3 text-xs"
              >
                <div className="font-bold text-purple-300 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  Approve Staff Overtime
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
                  <div className="md:col-span-2">
                    <label className="block text-slate-400 mb-1">Employee *</label>
                    <select
                      value={otEmpId}
                      onChange={(e) => setOtEmpId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-slate-200"
                      required
                    >
                      <option value="">-- Select Staff --</option>
                      {employees.map((emp) => (
                        <option key={emp._id} value={emp._id}>
                          {emp.name} ({emp.employeeCode})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Date *</label>
                    <input
                      type="date"
                      value={otDate}
                      onChange={(e) => setOtDate(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-slate-200"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">
                      Approved Hours *
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      value={otHours}
                      onChange={(e) => setOtHours(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-slate-200"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
                  <div>
                    <label className="block text-slate-400 mb-1">Rate Multiplier</label>
                    <select
                      value={otMultiplier}
                      onChange={(e) => setOtMultiplier(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-slate-200"
                    >
                      <option value="1.0">1.0x (Standard Hourly)</option>
                      <option value="1.5">1.5x (Time & Half)</option>
                      <option value="2.0">2.0x (Double Rate)</option>
                    </select>
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-slate-400 mb-1">Reason *</label>
                    <input
                      type="text"
                      value={otReason}
                      onChange={(e) => setOtReason(e.target.value)}
                      placeholder="e.g. Late night stock audit / tournament duty"
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-slate-200"
                      required
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={otSubmitting}
                    className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded disabled:opacity-50"
                  >
                    {otSubmitting ? "Saving..." : "Approve Overtime"}
                  </button>
                </div>
              </form>
            )}

            <div className="overflow-x-auto border border-slate-800 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-2.5">Staff</th>
                    <th className="p-2.5">Date</th>
                    <th className="p-2.5 text-center">Approved</th>
                    <th className="p-2.5 text-center">Multiplier</th>
                    <th className="p-2.5">Reason</th>
                    <th className="p-2.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {overtimeList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-slate-500">
                        No overtime records found for this period.
                      </td>
                    </tr>
                  ) : (
                    overtimeList.map((ot) => (
                      <tr key={ot._id}>
                        <td className="p-2.5 font-semibold text-slate-200">
                          {ot.employee?.name} ({ot.employee?.employeeCode})
                        </td>
                        <td className="p-2.5 font-mono text-slate-400">
                          {ot.date}
                        </td>
                        <td className="p-2.5 text-center font-mono text-emerald-400 font-bold">
                          {Math.round(((ot.approvedMinutes || 0) / 60) * 10) / 10}h
                        </td>
                        <td className="p-2.5 text-center font-mono">
                          {ot.rateMultiplier || 1}x
                        </td>
                        <td className="p-2.5 text-slate-300">{ot.reason}</td>
                        <td className="p-2.5 text-center">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                            {ot.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Release / Reopen Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-md w-full p-5 shadow-2xl">
            <h3 className="text-base font-bold text-slate-100 mb-2 flex items-center gap-2">
              {showStatusModal === "RELEASE" ? (
                <>
                  <Lock className="w-4 h-4 text-emerald-500" />
                  Release Payout & Lock Period ({activePeriod.periodLabel})
                </>
              ) : (
                <>
                  <Unlock className="w-4 h-4 text-amber-500" />
                  Reopen Locked Period ({activePeriod.periodLabel})
                </>
              )}
            </h3>

            <p className="text-xs text-slate-400 mb-3">
              {showStatusModal === "RELEASE"
                ? "Releasing will lock this salary period. Attendance, leaves, and overtime for this period cannot be edited. Advance salary recoveries will be deducted automatically."
                : "Reopening will revert the payroll status to DRAFT and restore any advance deductions from this period."}
            </p>

            <form onSubmit={handleStatusChange} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Written Reason (Mandatory for Audit) *
                </label>
                <textarea
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
                  placeholder={
                    showStatusModal === "RELEASE"
                      ? "Approved by Owner / Admin for staff disbursement"
                      : "Reopening to adjust missed biometric / approved leave"
                  }
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowStatusModal(null)}
                  className="px-3 py-1.5 rounded text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={statusSubmitting}
                  className={`px-4 py-1.5 font-semibold rounded text-white disabled:opacity-50 ${
                    showStatusModal === "RELEASE"
                      ? "bg-emerald-600 hover:bg-emerald-500"
                      : "bg-amber-600 hover:bg-amber-500"
                  }`}
                >
                  {statusSubmitting
                    ? "Processing..."
                    : showStatusModal === "RELEASE"
                    ? "Confirm & Lock"
                    : "Confirm Reopen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payslip Modal (Crisp High-Contrast 80mm Thermal & A4 Print Layout) */}
      {selectedSlip && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <style>{`
            @media print {
              @page {
                size: ${slipFormat === "THERMAL" ? "80mm auto" : "A4"};
                margin: ${slipFormat === "THERMAL" ? "0mm !important" : "10mm !important"};
              }
              html, body {
                margin: 0mm !important;
                padding: 0mm !important;
                height: auto !important;
                max-height: 100vh !important;
                overflow: hidden !important;
                background: #ffffff !important;
                color: #000000 !important;
                -webkit-font-smoothing: none !important;
              }
              body * {
                visibility: hidden !important;
              }
              #printable-payslip,
              #printable-payslip * {
                visibility: visible !important;
                color: #000000 !important;
              }
              #printable-payslip {
                position: absolute !important;
                left: 0mm !important;
                top: 0mm !important;
                width: ${slipFormat === "THERMAL" ? "78mm !important" : "100% !important"};
                max-width: ${slipFormat === "THERMAL" ? "78mm !important" : "190mm !important"};
                margin: 0mm !important;
                padding: ${slipFormat === "THERMAL" ? "2mm 2.5mm !important" : "8mm !important"};
                box-shadow: none !important;
                border: none !important;
                page-break-after: avoid !important;
                break-after: avoid !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }
              #printable-payslip img {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                image-rendering: -webkit-optimize-contrast !important;
              }
            }
          `}</style>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full max-h-[92vh] overflow-y-auto p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Printer className="w-4 h-4 text-indigo-400" />
                <h3 className="font-bold text-slate-100 text-sm">
                  Salary Slip Preview ({slipFormat === "THERMAL" ? "80mm Thermal" : "A4 Sheet"})
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-0.5 flex text-xs">
                  <button
                    onClick={() => setSlipFormat("THERMAL")}
                    className={`px-2.5 py-1 rounded-md font-bold transition ${
                      slipFormat === "THERMAL"
                        ? "bg-indigo-600 text-white"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    80mm Roll
                  </button>
                  <button
                    onClick={() => setSlipFormat("A4")}
                    className={`px-2.5 py-1 rounded-md font-bold transition ${
                      slipFormat === "A4"
                        ? "bg-indigo-600 text-white"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    A4 Sheet
                  </button>
                </div>

                <button
                  onClick={() => setSelectedSlip(null)}
                  className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Crisp Pure-Black Printable Container */}
            <div
              id="printable-payslip"
              className="bg-white text-black p-6 rounded-lg font-mono text-xs space-y-3.5 shadow-inner"
            >
              {/* Header */}
              <div className="text-center space-y-1 border-b-2 border-dashed border-black pb-3">
                <div className="flex justify-center pb-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/logo.png"
                    alt="PGS Game Shop"
                    className="h-24 w-auto max-w-[210px] object-contain mx-auto"
                    style={{ imageRendering: "auto" }}
                  />
                </div>
                <h2 className="text-lg font-black uppercase tracking-wider text-black">
                  PGS GAME SHOP
                </h2>
                <p className="text-xs font-bold text-black">
                  Multi-Branch Retail & Wholesale Gaming Hub
                </p>
                <div className="text-center bg-gray-200 text-black font-black text-xs py-1 my-1 uppercase tracking-wider border-2 border-black">
                  *** OFFICIAL STAFF SALARY SLIP ***
                </div>
              </div>

              {/* Staff & Period Details */}
              <div className="space-y-1.5 text-xs border-b-2 border-dashed border-black pb-3 text-black">
                <div className="flex justify-between">
                  <span className="font-bold">Salary Cycle:</span>
                  <span className="font-black text-right">
                    {selectedSlip.periodLabel || selectedSlip.month}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold">Staff Name:</span>
                  <span className="font-black uppercase">
                    {selectedSlip.employeeName}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold">Staff Code:</span>
                  <span className="font-black">{selectedSlip.employeeCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold">Designation:</span>
                  <span className="font-bold">{selectedSlip.designation}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold">Slip Date:</span>
                  <span className="font-bold">
                    {new Date().toLocaleDateString("en-PK", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    })}
                  </span>
                </div>
              </div>

              {/* Attendance & Hours Summary */}
              <div className="space-y-1.5 text-xs border-b-2 border-dashed border-black pb-3 text-black">
                <div className="text-xs font-black border-b-2 border-black pb-1 uppercase">
                  DUTY & ATTENDANCE SUMMARY
                </div>
                <div className="flex justify-between font-bold">
                  <span>Clocked / Target Hours:</span>
                  <span className="font-black">
                    {selectedSlip.clockedWorkedHours}h / {selectedSlip.targetHours}h
                  </span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Present / Half Days:</span>
                  <span className="font-black">
                    {selectedSlip.presentDays || 0}d / {selectedSlip.halfDays || 0}d
                  </span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Late Arrivals (3 = 1 Cut):</span>
                  <span className="font-black">
                    {selectedSlip.lateArrivalsCount || 0} Lates ({selectedSlip.latePenaltyDays || 0}d Cut)
                  </span>
                </div>
                {(selectedSlip.paidOffsCount || 0) > 0 && (
                  <div className="flex justify-between font-bold">
                    <span>Paid Leaves / Offs:</span>
                    <span className="font-black">{selectedSlip.paidOffsCount}d</span>
                  </div>
                )}
              </div>

              {/* Earnings & Deductions Breakdown */}
              <div className="space-y-2 border-b-2 border-dashed border-black pb-3 text-black">
                <div className="flex justify-between text-xs font-black border-b-2 border-black pb-1 uppercase">
                  <span>DESCRIPTION</span>
                  <span>AMOUNT (PKR)</span>
                </div>

                <div className="flex justify-between text-xs font-black">
                  <span>Basic Monthly Salary</span>
                  <span>Rs. {(selectedSlip.baseSalary || 0).toLocaleString()}</span>
                </div>

                {selectedSlip.overtimePay > 0 && (
                  <div className="flex justify-between text-xs font-bold">
                    <span>+ Overtime Pay ({selectedSlip.overtimeHours}h)</span>
                    <span className="font-black">
                      + Rs. {selectedSlip.overtimePay.toLocaleString()}
                    </span>
                  </div>
                )}

                {selectedSlip.bonus > 0 && (
                  <div className="flex justify-between text-xs font-bold">
                    <span>+ Bonus / Incentive</span>
                    <span className="font-black">
                      + Rs. {selectedSlip.bonus.toLocaleString()}
                    </span>
                  </div>
                )}

                {selectedSlip.shortHoursDeduction > 0 && (
                  <div className="flex justify-between text-xs font-bold">
                    <span>- Short Hours Cut ({selectedSlip.shortHours}h)</span>
                    <span className="font-black">
                      - Rs. {selectedSlip.shortHoursDeduction.toLocaleString()}
                    </span>
                  </div>
                )}

                {selectedSlip.unpaidLeaveDeduction > 0 && (
                  <div className="flex justify-between text-xs font-bold">
                    <span>- Unpaid Leave Deduction</span>
                    <span className="font-black">
                      - Rs. {selectedSlip.unpaidLeaveDeduction.toLocaleString()}
                    </span>
                  </div>
                )}

                {selectedSlip.lateDeduction > 0 && (
                  <div className="flex justify-between text-xs font-bold">
                    <span>- 3-Late Penalty ({selectedSlip.latePenaltyDays}d)</span>
                    <span className="font-black">
                      - Rs. {selectedSlip.lateDeduction.toLocaleString()}
                    </span>
                  </div>
                )}

                {selectedSlip.advanceDeduction > 0 && (
                  <div className="flex justify-between text-xs font-bold">
                    <span>- Salary Advance Recovery</span>
                    <span className="font-black">
                      - Rs. {selectedSlip.advanceDeduction.toLocaleString()}
                    </span>
                  </div>
                )}

                {selectedSlip.cardFeeDeduction > 0 && (
                  <div className="flex justify-between text-xs font-bold">
                    <span>- Card / Penalty Deduction</span>
                    <span className="font-black">
                      - Rs. {selectedSlip.cardFeeDeduction.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              {/* Net Payable Banner */}
              <div className="space-y-2 text-black">
                <div className="flex justify-between text-sm font-black border-t-2 border-b-2 border-black py-2 uppercase bg-gray-100 px-1">
                  <span>NET PAYABLE SALARY:</span>
                  <span>RS. {(selectedSlip.netSalary || 0).toLocaleString()}</span>
                </div>

                {selectedSlip.notes && (
                  <div className="pt-1 text-xs font-bold text-black break-words">
                    <span className="font-black uppercase">NOTE: </span>
                    <span>{selectedSlip.notes}</span>
                  </div>
                )}
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-2 gap-4 pt-6 pb-1 text-xs font-bold text-black">
                <div className="border-t-2 border-black pt-1 text-center">
                  Staff Signature
                </div>
                <div className="border-t-2 border-black pt-1 text-center">
                  Authorized Sign
                </div>
              </div>

              {/* Footer */}
              <div className="text-center pt-2 border-t-2 border-dashed border-black space-y-0.5 text-xs font-bold text-black">
                <p className="font-black uppercase">PGS GAME SHOP — HR & PAYROLL</p>
                <p className="font-bold">Official Computer Generated Salary Slip</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setSelectedSlip(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                Close
              </button>
              <button
                onClick={handlePrintPayslip}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 transition"
              >
                <Printer className="w-4 h-4" />
                <span>Print Salary Slip</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
