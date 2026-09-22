"use client";

import React, { useState, useEffect } from "react";
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Lock,
  Unlock,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  MapPin,
  Calendar,
  FileText,
  MinusCircle,
  Plus,
} from "lucide-react";

interface CashSessionDoc {
  _id: string;
  sessionNumber: string;
  locationName: string;
  cashier: string;
  openingCash: number;
  expectedCash: number;
  actualCash?: number;
  variance?: number;
  varianceReason?: string;
  totalCashSales: number;
  totalCardSales: number;
  totalOnlineSales: number;
  totalRefunds: number;
  totalExpenses: number;
  status: "OPEN" | "CLOSED";
  openedAt: string;
  closedAt?: string;
  notes?: string;
}

export default function CashSessionsPage() {
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [activeSession, setActiveSession] = useState<CashSessionDoc | null>(null);
  const [sessionHistory, setSessionHistory] = useState<CashSessionDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Open Shift Form State
  const [openingCash, setOpeningCash] = useState<number>(5000);

  // Close Shift Modal State
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [actualCashCount, setActualCashCount] = useState<number>(0);
  const [varianceReason, setVarianceReason] = useState("");

  // Petty Cash Expense Modal State
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseCategory, setExpenseCategory] = useState("Rider Expense");
  const [expenseAmount, setExpenseAmount] = useState<number>(0);
  const [expenseRecipient, setExpenseRecipient] = useState("");
  const [expenseReason, setExpenseReason] = useState("");

  useEffect(() => {
    fetchLocations();
  }, []);

  useEffect(() => {
    if (selectedLocation) {
      fetchSessionData();
    }
  }, [selectedLocation]);

  const fetchLocations = async () => {
    try {
      const res = await fetch("/api/locations");
      const data = await res.json();
      if (data.success && data.data.length > 0) {
        setLocations(data.data);
        setSelectedLocation(data.data[0]._id);
      }
    } catch {
      setError("Failed to load locations.");
    }
  };

  const fetchSessionData = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/cash-sessions?locationId=${selectedLocation}`);
      const data = await res.json();
      if (data.success) {
        setActiveSession(data.data.activeSession || null);
        setSessionHistory(data.data.history || []);
        if (data.data.activeSession) {
          setActualCashCount(data.data.activeSession.expectedCash || 0);
        }
      }
    } catch {
      setError("Failed to load session details.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccessMsg("");

    try {
      const res = await fetch("/api/cash-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "OPEN",
          locationId: selectedLocation,
          openingCash: Number(openingCash),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Failed to open cash shift.");
        return;
      }

      setSuccessMsg("Cash register shift opened successfully!");
      fetchSessionData();
    } catch (err: any) {
      setError(err.message || "Network error opening session.");
    } finally {
      setLoading(false);
    }
  };

  const handleRecordPettyExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession || expenseAmount <= 0) return;

    setLoading(true);
    setError("");
    setSuccessMsg("");

    try {
      const res = await fetch("/api/cash-sessions/expense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: activeSession._id,
          locationId: selectedLocation,
          category: expenseCategory,
          amount: Number(expenseAmount),
          recipient: expenseRecipient,
          reason: expenseReason,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Failed to record expense.");
        setLoading(false);
        return;
      }

      setShowExpenseModal(false);
      setSuccessMsg(`Petty cash expense of Rs. ${expenseAmount.toLocaleString()} recorded cleanly!`);
      setExpenseAmount(0);
      setExpenseRecipient("");
      setExpenseReason("");
      fetchSessionData();
    } catch (err: any) {
      setError(err.message || "Network error.");
    } finally {
      setLoading(false);
    }
  };

  const handleCloseSession = async () => {
    if (!activeSession) return;
    setLoading(true);
    setError("");
    setSuccessMsg("");

    try {
      const res = await fetch("/api/cash-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CLOSE",
          sessionId: activeSession._id,
          actualCashCount: Number(actualCashCount),
          varianceReason,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Failed to close cash shift.");
        setLoading(false);
        return;
      }

      setShowCloseModal(false);
      setSuccessMsg("Cash register shift closed cleanly!");
      fetchSessionData();
    } catch (err: any) {
      setError(err.message || "Network error closing session.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 lg:p-6 space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100">Cash Register & Shift Closing</h1>
            <p className="text-xs text-slate-400">
              Drawer Balance Reconciliation & Strict Physical Cash Verification
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs">
            <MapPin className="w-3.5 h-3.5 text-indigo-400" />
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="bg-transparent text-slate-200 font-semibold focus:outline-none"
            >
              {locations.map((loc) => (
                <option key={loc._id} value={loc._id} className="bg-slate-900 text-slate-200">
                  {loc.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={fetchSessionData}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Active Shift Dashboard OR Open Shift Form */}
      {activeSession ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
              <div>
                <h2 className="text-base font-bold text-slate-100">
                  Active Shift ({activeSession.sessionNumber})
                </h2>
                <p className="text-xs text-slate-400 font-mono">
                  Cashier: {activeSession.cashier} • Opened at:{" "}
                  {new Date(activeSession.openedAt).toLocaleTimeString()}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Record Petty Cash Expense Button */}
              <button
                onClick={() => setShowExpenseModal(true)}
                className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-lg shadow-amber-600/20 transition flex items-center gap-1.5"
              >
                <MinusCircle className="w-4 h-4" />
                Record Petty Cash Payout
              </button>

              <button
                onClick={() => {
                  setActualCashCount(activeSession.expectedCash);
                  setShowCloseModal(true);
                }}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-600/20 transition flex items-center gap-1.5"
              >
                <Lock className="w-4 h-4" />
                Close Shift
              </button>
            </div>
          </div>

          {/* Running Balance Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Opening Drawer Cash</span>
              <p className="text-base font-mono font-bold text-slate-100">
                Rs. {activeSession.openingCash.toLocaleString()}
              </p>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
              <span className="text-[10px] font-bold text-emerald-400 uppercase flex items-center gap-1">
                <ArrowDownLeft className="w-3 h-3" />
                Cash Collected
              </span>
              <p className="text-base font-mono font-bold text-emerald-400">
                Rs. {activeSession.totalCashSales.toLocaleString()}
              </p>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
              <span className="text-[10px] font-bold text-rose-400 uppercase">Petty Expenses</span>
              <p className="text-base font-mono font-bold text-rose-400">
                Rs. {activeSession.totalExpenses.toLocaleString()}
              </p>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
              <span className="text-[10px] font-bold text-indigo-400 uppercase">Card & Bank</span>
              <p className="text-base font-mono font-bold text-indigo-400">
                Rs. {(activeSession.totalCardSales + activeSession.totalOnlineSales).toLocaleString()}
              </p>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
              <span className="text-[10px] font-bold text-amber-400 uppercase">Expected Drawer Cash</span>
              <p className="text-lg font-mono font-extrabold text-amber-400">
                Rs. {activeSession.expectedCash.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg space-y-4 shadow-xl">
          <div className="flex items-center gap-2 text-slate-100 font-bold text-sm">
            <Unlock className="w-4 h-4 text-emerald-400" />
            <span>Open New Register Shift</span>
          </div>

          <form onSubmit={handleOpenSession} className="space-y-4 text-xs">
            <div className="space-y-1">
              <label className="text-slate-300 font-semibold">Opening Cash in Register (PKR):</label>
              <input
                type="number"
                min="0"
                value={openingCash}
                onChange={(e) => setOpeningCash(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 text-slate-100 font-mono rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/20 transition flex items-center justify-center gap-2"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Open Register Shift"}
            </button>
          </form>
        </div>
      )}

      {/* Record Petty Cash Expense Modal */}
      {showExpenseModal && activeSession && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <MinusCircle className="w-4 h-4 text-amber-400" />
                Record Petty Cash Payout
              </h3>
              <button onClick={() => setShowExpenseModal(false)} className="text-slate-400 hover:text-slate-200">
                ✖
              </button>
            </div>

            <form onSubmit={handleRecordPettyExpense} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Expense Category:</label>
                <select
                  value={expenseCategory}
                  onChange={(e) => setExpenseCategory(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl px-3 py-2"
                >
                  <option value="Rider Expense">Rider / Delivery Expense</option>
                  <option value="Petrol">Petrol</option>
                  <option value="Packaging">Packaging Material</option>
                  <option value="Utility">Tea / Refreshments</option>
                  <option value="Other">Other Miscellaneous</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Payout Amount (PKR):</label>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 500"
                  value={expenseAmount || ""}
                  onChange={(e) => setExpenseAmount(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-amber-500/40 text-amber-400 font-mono text-base font-bold rounded-xl px-3 py-2"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Recipient Name / Paid To:</label>
                <input
                  type="text"
                  placeholder="e.g. TCS Rider / Ali"
                  value={expenseRecipient}
                  onChange={(e) => setExpenseRecipient(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-3 py-2"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Reason / Description:</label>
                <input
                  type="text"
                  placeholder="e.g. Bike petrol for urgent delivery"
                  value={expenseReason}
                  onChange={(e) => setExpenseReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-3 py-2"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowExpenseModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 font-semibold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-lg shadow-amber-600/20 transition flex items-center justify-center gap-2"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Record Cash Payout"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Shift Closing Reconciliation Modal */}
      {showCloseModal && activeSession && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Lock className="w-4 h-4 text-rose-400" />
                Shift End Physical Cash Reconciliation
              </h3>
              <button onClick={() => setShowCloseModal(false)} className="text-slate-400 hover:text-slate-200">
                ✖
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <div className="flex justify-between text-slate-400">
                  <span>Opening Cash:</span>
                  <span className="font-mono">Rs. {activeSession.openingCash.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-emerald-400">
                  <span>Physical Cash Collected:</span>
                  <span className="font-mono">+ Rs. {activeSession.totalCashSales.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-rose-400">
                  <span>Petty Cash Expenses & Refunds:</span>
                  <span className="font-mono">- Rs. {(activeSession.totalExpenses + activeSession.totalRefunds).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-slate-100 font-bold pt-2 border-t border-slate-800">
                  <span>Expected Drawer Cash:</span>
                  <span className="font-mono text-amber-400">Rs. {activeSession.expectedCash.toLocaleString()}</span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-200">Actual Physical Cash Counted in Drawer (PKR):</label>
                <input
                  type="number"
                  value={actualCashCount}
                  onChange={(e) => setActualCashCount(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 font-mono text-base rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {actualCashCount !== activeSession.expectedCash && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 space-y-2">
                  <div className="flex justify-between items-center font-bold">
                    <span>Variance Detected:</span>
                    <span className="font-mono">
                      Rs. {(actualCashCount - activeSession.expectedCash).toLocaleString()}
                    </span>
                  </div>
                  <input
                    type="text"
                    placeholder="Provide mandatory variance explanation reason..."
                    value={varianceReason}
                    onChange={(e) => setVarianceReason(e.target.value)}
                    className="w-full bg-slate-950 border border-amber-800/60 text-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
                    required
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowCloseModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 font-semibold text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleCloseSession}
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-600/20 transition flex items-center justify-center gap-2"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Confirm Shift Lock"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session History Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-xl">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Shift Closing Audit History
        </span>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="p-3">Session #</th>
                <th className="p-3">Cashier</th>
                <th className="p-3 text-right">Opening</th>
                <th className="p-3 text-right">Cash Collected</th>
                <th className="p-3 text-right">Expected Cash</th>
                <th className="p-3 text-right">Actual Cash</th>
                <th className="p-3 text-right">Variance</th>
                <th className="p-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {sessionHistory.map((s) => (
                <tr key={s._id} className="hover:bg-slate-950/50">
                  <td className="p-3 font-bold text-indigo-400">{s.sessionNumber}</td>
                  <td className="p-3 font-sans text-slate-300">{s.cashier}</td>
                  <td className="p-3 text-right text-slate-400">Rs. {s.openingCash.toLocaleString()}</td>
                  <td className="p-3 text-right text-emerald-400">Rs. {s.totalCashSales.toLocaleString()}</td>
                  <td className="p-3 text-right text-amber-400">Rs. {s.expectedCash.toLocaleString()}</td>
                  <td className="p-3 text-right text-slate-100 font-bold">
                    {s.actualCash ? `Rs. ${s.actualCash.toLocaleString()}` : "-"}
                  </td>
                  <td className={`p-3 text-right font-bold ${
                    (s.variance || 0) < 0 ? "text-rose-400" : (s.variance || 0) > 0 ? "text-emerald-400" : "text-slate-500"
                  }`}>
                    {s.variance ? `Rs. ${s.variance.toLocaleString()}` : "0"}
                  </td>
                  <td className="p-3 text-center font-sans">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      s.status === "OPEN" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-slate-800 text-slate-400"
                    }`}>
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
