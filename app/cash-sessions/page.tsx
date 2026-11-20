"use client";

import React, { useState, useEffect } from "react";
import {
  Wallet,
  Lock,
  Unlock,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  MapPin,
  Calendar,
  Plus,
  Camera,
  Eye,
  Trash2,
  X,
} from "lucide-react";

interface CashSessionDoc {
  _id: string;
  sessionNumber: string;
  locationName: string;
  cashier: string;
  openingCash: number;
  expectedCash: number;
  actualCash?: number;
  openingOnline?: number;
  expectedOnline?: number;
  actualOnline?: number;
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

interface DiaryEntryRow {
  _id: string;
  expenseNumber?: string;
  seq: string;
  time: string;
  description: string;
  category?: string;
  shopTag: string;
  paymentMethod?: string;
  cashIn: number;
  cashOut: number;
  onlineIn: number;
  onlineOut: number;
  runningBalance: number;
  runningOnlineBalance: number;
  attachmentUrl?: string;
  entryType: string;
}

export default function CashSessionsPage() {
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>("ALL");
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10)
  );
  const [activeSession, setActiveSession] = useState<CashSessionDoc | null>(null);
  const [diarySummary, setDiarySummary] = useState<any>({
    openingBalance: 0,
    openingOnline: 0,
    todayCashSales: 0,
    todayOnlineSales: 0,
    todayCardSales: 0,
    todayExpenses: 0,
    todayCashExpenses: 0,
    todayOnlineExpenses: 0,
    expenseCount: 0,
    purchasingAndAtifNet: 0,
    purchasingAndAtifCashNet: 0,
    purchasingAndAtifOnlineNet: 0,
    closingCashBalance: 0,
    closingOnlineBalance: 0,
  });
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Quick Diary Entry Form State
  const [entryType, setEntryType] = useState<
    "EXPENSE" | "ATIF_WITHDRAW" | "ATIF_DEPOSIT" | "CASH_PURCHASING"
  >("EXPENSE");
  const [paymentMethod, setPaymentMethod] = useState<
    "CASH" | "ONLINE" | "CARD" | "SPLIT"
  >("CASH");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Tea");
  const [shopTag, setShopTag] = useState("P.G.S");
  const [amount, setAmount] = useState<string>("");
  const [splitCashAmount, setSplitCashAmount] = useState<string>("");
  const [splitOnlineAmount, setSplitOnlineAmount] = useState<string>("");
  const [attachmentUrl, setAttachmentUrl] = useState<string>("");
  const [previewSlipUrl, setPreviewSlipUrl] = useState<string | null>(null);

  // Open / Set Opening Balance Modal State (Cash O.B & Online O.B)
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [openingCash, setOpeningCash] = useState<number>(0);
  const [openingOnline, setOpeningOnline] = useState<number>(0);

  // Close Shift Modal State
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [actualCashCount, setActualCashCount] = useState<number>(0);
  const [actualOnlineCount, setActualOnlineCount] = useState<number>(0);
  const [varianceReason, setVarianceReason] = useState("");

  useEffect(() => {
    fetchLocations();
  }, []);

  useEffect(() => {
    fetchSessionData();
  }, [selectedLocation, selectedDate]);

  const fetchLocations = async () => {
    try {
      const res = await fetch("/api/locations");
      const data = await res.json();
      if (data.success && data.data.length > 0) {
        setLocations(data.data);
      }
    } catch {
      setError("Failed to load locations.");
    }
  };

  const fetchSessionData = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/cash-sessions?locationId=${selectedLocation}&date=${selectedDate}`
      );
      const data = await res.json();
      if (data.success) {
        setActiveSession(data.data.activeSession || null);
        if (data.data.diarySummary) {
          setDiarySummary(data.data.diarySummary);
          setActualCashCount(data.data.diarySummary.closingCashBalance || 0);
          setActualOnlineCount(data.data.diarySummary.closingOnlineBalance || 0);
          setOpeningCash(data.data.diarySummary.openingBalance || 0);
          setOpeningOnline(data.data.diarySummary.openingOnline || 0);
        }
        setDiaryEntries(data.data.diaryEntries || []);
      }
    } catch {
      setError("Failed to load diary details.");
    } finally {
      setLoading(false);
    }
  };

  const handleSlipUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setAttachmentUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAddDiaryEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    const isSplit = paymentMethod === "SPLIT";
    const cVal = Number(splitCashAmount || 0);
    const oVal = Number(splitOnlineAmount || 0);
    const numAmount = isSplit ? cVal + oVal : Number(amount || 0);

    if (!numAmount || numAmount <= 0) {
      setError("Please enter a valid amount greater than 0.");
      return;
    }
    if (!description.trim()) {
      setError("Please enter a short description (e.g. Tea, Fuel, Atif Withdraw).");
      return;
    }

    setLoading(true);
    setError("");
    setSuccessMsg("");

    try {
      const res = await fetch("/api/cash-sessions/expense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: activeSession?._id,
          locationId: selectedLocation,
          shopTag,
          entryType,
          paymentMethod,
          category,
          description: description.trim(),
          reason: description.trim(),
          recipient: description.trim(),
          amount: numAmount,
          cashAmount: isSplit ? cVal : undefined,
          onlineAmount: isSplit ? oVal : undefined,
          attachmentUrl: attachmentUrl || undefined,
          date: selectedDate,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Failed to add diary entry.");
        setLoading(false);
        return;
      }

      const createdEntry = data.data?.expense;
      if (createdEntry) {
        setDiaryEntries((prev) => [createdEntry, ...prev]);
        const cAdd = isSplit ? cVal : paymentMethod === "CASH" ? numAmount : 0;
        const oAdd = isSplit ? oVal : paymentMethod === "ONLINE" || paymentMethod === "CARD" ? numAmount : 0;
        setDiarySummary((prev: any) => {
          let {
            cashExpenses,
            onlineExpenses,
            cashPurchases,
            onlinePurchases,
            atifCashWithdraw,
            atifOnlineWithdraw,
            atifCashDeposit,
            atifOnlineDeposit,
            closingCashBalance,
            closingOnlineBalance,
          } = prev;
          if (entryType === "ATIF_WITHDRAW") {
            atifCashWithdraw += cAdd;
            atifOnlineWithdraw += oAdd;
            closingCashBalance -= cAdd;
            closingOnlineBalance -= oAdd;
          } else if (entryType === "ATIF_DEPOSIT") {
            atifCashDeposit += cAdd;
            atifOnlineDeposit += oAdd;
            closingCashBalance += cAdd;
            closingOnlineBalance += oAdd;
          } else if (entryType === "CASH_PURCHASING") {
            cashPurchases += cAdd;
            onlinePurchases += oAdd;
            closingCashBalance -= cAdd;
            closingOnlineBalance -= oAdd;
          } else {
            cashExpenses += cAdd;
            onlineExpenses += oAdd;
            closingCashBalance -= cAdd;
            closingOnlineBalance -= oAdd;
          }
          return {
            ...prev,
            cashExpenses,
            onlineExpenses,
            cashPurchases,
            onlinePurchases,
            atifCashWithdraw,
            atifOnlineWithdraw,
            atifCashDeposit,
            atifOnlineDeposit,
            closingCashBalance,
            closingOnlineBalance,
            combinedClosingBalance: closingCashBalance + closingOnlineBalance,
          };
        });
      }

      setSuccessMsg(
        `Added "${description.trim()}" (Rs. ${numAmount.toLocaleString()} via ${paymentMethod}) to Today's Diary!`
      );
      setDescription("");
      setAmount("");
      setSplitCashAmount("");
      setSplitOnlineAmount("");
      setAttachmentUrl("");
      fetchSessionData();
    } catch (err: any) {
      setError(err.message || "Network error.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!confirm("Remove this diary entry?")) return;
    const prevEntries = diaryEntries;
    setDiaryEntries((prev) => prev.filter((item) => item._id !== entryId));
    try {
      const res = await fetch(`/api/cash-sessions/expense?id=${entryId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg("Diary entry removed.");
        fetchSessionData();
      } else {
        setDiaryEntries(prevEntries);
        setError(data.error || "Failed to delete entry.");
      }
    } catch {
      setDiaryEntries(prevEntries);
      setError("Failed to delete entry.");
    }
  };

  const handleOpenSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccessMsg("");

    try {
      const targetLoc =
        selectedLocation && selectedLocation !== "ALL"
          ? selectedLocation
          : locations[0]?._id;
      const res = await fetch("/api/cash-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "OPEN",
          locationId: targetLoc,
          openingCash: Number(openingCash || 0),
          openingOnline: Number(openingOnline || 0),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Failed to set opening balance.");
        return;
      }

      setShowOpenModal(false);
      setSuccessMsg("Starting Opening Balances (Cash O.B & Online O.B) updated!");
      fetchSessionData();
    } catch (err: any) {
      setError(err.message || "Network error opening session.");
    } finally {
      setLoading(false);
    }
  };

  const handleCloseSession = async () => {
    const variance = Number(actualCashCount) - Number(diarySummary.closingCashBalance || 0);
    if (Math.abs(variance) > 0.01 && !varianceReason.trim()) {
      setError("Cash variance detected! Please enter a mandatory reason before locking today's diary.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccessMsg("");

    try {
      const res = await fetch("/api/cash-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CLOSE",
          sessionId: activeSession?._id,
          locationId: selectedLocation,
          date: selectedDate,
          actualCashCount: Number(actualCashCount || 0),
          actualOnlineCount: Number(actualOnlineCount || 0),
          varianceReason,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Failed to close diary.");
        setLoading(false);
        return;
      }

      setShowCloseModal(false);
      setSuccessMsg("Today's Diary locked & closed! Cash & Online Closing Balances carried forward to tomorrow's O.B.");
      fetchSessionData();
    } catch (err: any) {
      setError(err.message || "Network error closing session.");
    } finally {
      setLoading(false);
    }
  };

  const shopOptions = ["P.G.S", ...locations.map((l) => l.name)];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 lg:p-6 space-y-6">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">
              Daily Petty Cash & Online Diary
            </h1>
            <p className="text-xs text-slate-400">
              Live Cash Drawer & Online Bank Tracking (O.B + POS Sales - Expenses - Purchasing - Atif Withdraw = Closing)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs">
            <Calendar className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-slate-400">Date:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-slate-100 font-bold focus:outline-none cursor-pointer"
            />
          </div>

          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs">
            <MapPin className="w-3.5 h-3.5 text-indigo-400" />
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="bg-transparent text-slate-100 font-bold focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900 text-slate-100">
                All Shops Combined
              </option>
              {locations.map((loc) => (
                <option key={loc._id} value={loc._id} className="bg-slate-900 text-slate-100">
                  {loc.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => setShowOpenModal(true)}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
          >
            <Unlock className="w-3.5 h-3.5 text-indigo-400" />
            Set Cash & Online O.B
          </button>

          <button
            type="button"
            onClick={() => {
              setActualCashCount(diarySummary.closingCashBalance || 0);
              setActualOnlineCount(diarySummary.closingOnlineBalance || 0);
              setShowCloseModal(true);
            }}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/25 transition flex items-center gap-1.5 cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5" />
            Close & Lock Today&apos;s Diary
          </button>

          <button
            type="button"
            onClick={fetchSessionData}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
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

      {/* SECTION 1: 5 Big Summary Cards (Showing Both Cash & Online) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Card 1: Opening Balance (Cash & Online) */}
        <div
          onClick={() => setShowOpenModal(true)}
          title="Click to Set / Edit Cash & Online Opening Balance"
          className="bg-slate-900 border border-slate-800 hover:border-indigo-500/50 p-4 rounded-2xl space-y-1.5 cursor-pointer transition"
        >
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            1. Opening Balance (O.B)
          </span>
          <p className="text-xl font-mono font-extrabold text-blue-400">
            💵 Rs. {(diarySummary.openingBalance || 0).toLocaleString()}
          </p>
          <p className="text-xs font-mono font-bold text-purple-400">
            🏦 Online O.B: Rs. {(diarySummary.openingOnline || 0).toLocaleString()}
          </p>
        </div>

        {/* Card 2: Today POS Sales (Cash & Online) */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1.5">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            2. Today POS Sales (Auto)
          </span>
          <p className="text-xl font-mono font-extrabold text-emerald-400">
            💵 + Rs. {(diarySummary.todayCashSales || 0).toLocaleString()}
          </p>
          <p className="text-xs font-mono font-bold text-purple-400">
            🏦 Online (O.S): + Rs. {(diarySummary.todayOnlineSales || 0).toLocaleString()}
          </p>
          {(diarySummary.todayCardSales || 0) > 0 && (
            <p className="text-[11px] font-mono font-semibold text-blue-400">
              💳 Card (POS Swipe): + Rs. {(diarySummary.todayCardSales || 0).toLocaleString()}
            </p>
          )}
        </div>

        {/* Card 3: Today Expenses */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1.5">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            3. Today Expenses (E)
          </span>
          <p className="text-xl font-mono font-extrabold text-amber-400">
            - Rs. {(diarySummary.todayExpenses || 0).toLocaleString()}
          </p>
          <p className="text-[11px] font-mono text-slate-400">
            💵 Cash: {(diarySummary.todayCashExpenses || 0).toLocaleString()} • 🏦 Online:{" "}
            {(diarySummary.todayOnlineExpenses || 0).toLocaleString()}
          </p>
        </div>

        {/* Card 4: Purchasing / Atif Withdraw */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1.5">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            4. Purchasing / Atif
          </span>
          <p className="text-xl font-mono font-extrabold text-rose-400">
            {diarySummary.purchasingAndAtifNet >= 0 ? "- " : "+ "}Rs.{" "}
            {Math.abs(diarySummary.purchasingAndAtifNet || 0).toLocaleString()}
          </p>
          <p className="text-[11px] font-mono text-slate-400">
            💵 Cash: {Math.abs(diarySummary.purchasingAndAtifCashNet || 0).toLocaleString()} • 🏦 Online:{" "}
            {Math.abs(diarySummary.purchasingAndAtifOnlineNet || 0).toLocaleString()}
          </p>
        </div>

        {/* Card 5: Closing Balance (Cash & Online) */}
        <div className="bg-slate-900 border-2 border-emerald-500/60 shadow-lg shadow-emerald-500/10 p-4 rounded-2xl space-y-1.5">
          <span className="text-[11px] font-bold text-slate-200 uppercase tracking-wider">
            5. Closing Balance
          </span>
          <p className="text-xl font-mono font-extrabold text-emerald-400">
            💵 Cash: Rs. {(diarySummary.closingCashBalance || 0).toLocaleString()}
          </p>
          <p className="text-xs font-mono font-bold text-purple-300">
            🏦 Online: Rs. {(diarySummary.closingOnlineBalance || 0).toLocaleString()}
          </p>
        </div>
      </div>

      {/* SECTION 2: 1-Row Quick Diary Entry Bar (With Cash / Online / Card / Split) */}
      <form
        onSubmit={handleAddDiaryEntry}
        className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-xl"
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Quick Diary Entry
          </h2>
          {/* Quick 1-Click Chips + Atif Withdraw Shortcut */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {["Tea", "Fuel", "Food", "IT Expense", "Packaging", "Other"].map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => {
                  setEntryType("EXPENSE");
                  setCategory(chip);
                  setDescription(chip === "Other" ? "" : chip);
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                  category === chip && entryType === "EXPENSE"
                    ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-300"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                {chip}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setEntryType("ATIF_WITHDRAW");
                setCategory("Atif Withdraw");
                setDescription("Atif Withdraw");
              }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                entryType === "ATIF_WITHDRAW"
                  ? "bg-rose-500/20 border-rose-500/50 text-rose-300"
                  : "bg-slate-950 border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
              }`}
            >
              Atif Withdraw
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          {/* Type */}
          <div className="md:col-span-2">
            <label className="block text-[11px] text-slate-400 mb-1">Type:</label>
            <select
              value={entryType}
              onChange={(e) => {
                const nextType = e.target.value as any;
                setEntryType(nextType);
                const presetLabels = [
                  "Tea",
                  "Fuel",
                  "Food",
                  "IT Expense",
                  "Packaging",
                  "Other",
                  "Atif Withdraw",
                  "Atif Night Withdraw",
                  "Atif Deposit",
                  "Purchasing",
                ];
                if (nextType === "ATIF_WITHDRAW") {
                  setCategory("Atif Withdraw");
                  if (!description.trim() || presetLabels.includes(description.trim())) {
                    setDescription("Atif Withdraw");
                  }
                } else if (nextType === "ATIF_DEPOSIT") {
                  setCategory("Atif Deposit");
                  if (!description.trim() || presetLabels.includes(description.trim())) {
                    setDescription("Atif Deposit");
                  }
                } else if (nextType === "CASH_PURCHASING") {
                  setCategory("Purchasing");
                  if (presetLabels.includes(description.trim())) {
                    setDescription("");
                  }
                } else if (nextType === "EXPENSE") {
                  const nextCat = ["Atif Withdraw", "Atif Deposit", "Purchasing"].includes(category)
                    ? "Tea"
                    : category;
                  setCategory(nextCat);
                  if (["Atif Withdraw", "Atif Night Withdraw", "Atif Deposit", "Purchasing"].includes(description.trim())) {
                    setDescription(nextCat === "Other" ? "" : nextCat);
                  }
                }
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 font-semibold focus:outline-none focus:border-indigo-500"
            >
              <option value="EXPENSE">Expense (Kharcha)</option>
              <option value="CASH_PURCHASING">Purchasing (CD/Item Buyback)</option>
              <option value="ATIF_WITHDRAW">Atif Withdraw (Owner Out)</option>
              <option value="ATIF_DEPOSIT">Atif Deposit (Owner In)</option>
            </select>
          </div>

          {/* Payment Mode: Cash / Online / Card / Split */}
          <div className="md:col-span-2">
            <label className="block text-[11px] text-slate-400 mb-1">Mode:</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as any)}
              className="w-full bg-slate-950 border border-indigo-500/40 rounded-xl px-3 py-2.5 text-xs text-indigo-300 font-bold focus:outline-none focus:border-indigo-500"
            >
              <option value="CASH">💵 Cash (Galla)</option>
              <option value="ONLINE">🏦 Online (Bank)</option>
              <option value="CARD">💳 Card</option>
              <option value="SPLIT">🔀 Split (Cash + Online)</option>
            </select>
          </div>

          {/* Description */}
          <div className="md:col-span-3">
            <label className="block text-[11px] text-slate-400 mb-1">Description:</label>
            <input
              type="text"
              placeholder="e.g. Tea / Fuel / Atif Withdraw..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Shop */}
          <div className="md:col-span-1">
            <label className="block text-[11px] text-slate-400 mb-1">Shop:</label>
            <select
              value={shopTag}
              onChange={(e) => setShopTag(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2.5 text-xs text-slate-200 font-semibold focus:outline-none focus:border-indigo-500"
            >
              {shopOptions.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          {/* Amount OR Split Cash + Online Inputs */}
          {paymentMethod === "SPLIT" ? (
            <div className="md:col-span-2 grid grid-cols-2 gap-1.5">
              <div>
                <label className="block text-[10px] text-emerald-400 mb-1">💵 Cash:</label>
                <input
                  type="number"
                  placeholder="Cash"
                  value={splitCashAmount}
                  onChange={(e) => setSplitCashAmount(e.target.value)}
                  className="w-full bg-slate-950 border border-emerald-500/40 rounded-xl px-2 py-2.5 text-xs text-emerald-300 font-mono font-bold focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] text-purple-400 mb-1">🏦 Online:</label>
                <input
                  type="number"
                  placeholder="Online"
                  value={splitOnlineAmount}
                  onChange={(e) => setSplitOnlineAmount(e.target.value)}
                  className="w-full bg-slate-950 border border-purple-500/40 rounded-xl px-2 py-2.5 text-xs text-purple-300 font-mono font-bold focus:outline-none"
                />
              </div>
            </div>
          ) : (
            <div className="md:col-span-2">
              <label className="block text-[11px] text-slate-400 mb-1">Amount:</label>
              <input
                type="number"
                placeholder="Enter amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-100 font-mono font-bold focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          {/* Slip + Submit */}
          <div className="md:col-span-2 flex items-center gap-2">
            <label
              title="Attach Receipt / Slip Picture"
              className={`px-3 py-2.5 rounded-xl border text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition shrink-0 ${
                attachmentUrl
                  ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                  : "bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700"
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>{attachmentUrl ? "Attached" : "Slip"}</span>
              <input type="file" accept="image/*" onChange={handleSlipUpload} className="hidden" />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/25 transition flex items-center justify-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add to Diary</span>
            </button>
          </div>
        </div>
      </form>

      {/* SECTION 3: Today's Diary List Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Today&apos;s Diary List (Cash & Online Running Ledger)
          </h2>
          <span className="text-[11px] text-slate-400 font-mono">
            💳 Card Sales Today: Rs. {(diarySummary.todayCardSales || 0).toLocaleString()}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="p-3">#</th>
                <th className="p-3">Time</th>
                <th className="p-3">Description / Particulars</th>
                <th className="p-3 text-center">Shop</th>
                <th className="p-3 text-center">Mode</th>
                <th className="p-3 text-right">💵 Cash (+ / -)</th>
                <th className="p-3 text-right">🏦 Online (+ / -)</th>
                <th className="p-3 text-right">💵 Cash Balance</th>
                <th className="p-3 text-right">🏦 Online Balance</th>
                <th className="p-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {diaryEntries.map((row) => {
                const isSystemRow = row._id === "OB-ROW" || row._id === "CS-ROW";
                return (
                  <tr key={row._id} className="hover:bg-slate-950/50">
                    <td className="p-3 font-bold text-slate-300">{row.seq}</td>
                    <td className="p-3 text-slate-400">{row.time}</td>
                    <td className="p-3 font-sans font-semibold text-slate-200 flex items-center gap-2">
                      <span>{row.description}</span>
                      {row.attachmentUrl && (
                        <button
                          type="button"
                          onClick={() => setPreviewSlipUrl(row.attachmentUrl!)}
                          className="px-2 py-0.5 text-[10px] rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" /> Slip
                        </button>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                        {row.shopTag}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          row.paymentMethod === "ONLINE" || row.paymentMethod === "BANK_TRANSFER"
                            ? "bg-purple-500/15 text-purple-300 border-purple-500/30"
                            : row.paymentMethod === "SPLIT"
                            ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
                            : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                        }`}
                      >
                        {row.paymentMethod || "CASH"}
                      </span>
                    </td>
                    <td className="p-3 text-right font-bold">
                      {row.cashIn > 0 ? (
                        <span className="text-emerald-400">
                          {row.seq === "O.B" ? "" : "+ "}Rs. {row.cashIn.toLocaleString()}
                        </span>
                      ) : row.cashOut > 0 ? (
                        <span className="text-rose-400">- Rs. {row.cashOut.toLocaleString()}</span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="p-3 text-right font-bold">
                      {row.onlineIn > 0 ? (
                        <span className="text-purple-400">
                          {row.seq === "O.B" ? "" : "+ "}Rs. {row.onlineIn.toLocaleString()}
                        </span>
                      ) : row.onlineOut > 0 ? (
                        <span className="text-rose-400">- Rs. {row.onlineOut.toLocaleString()}</span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="p-3 text-right font-bold text-emerald-300">
                      Rs. {(row.runningBalance || 0).toLocaleString()}
                    </td>
                    <td className="p-3 text-right font-bold text-purple-300">
                      Rs. {(row.runningOnlineBalance || 0).toLocaleString()}
                    </td>
                    <td className="p-3 text-center">
                      {!isSystemRow && (
                        <button
                          type="button"
                          onClick={() => handleDeleteEntry(row._id)}
                          title="Delete Entry"
                          className="p-1 text-slate-500 hover:text-rose-400 transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5 mx-auto" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Set Opening Balances (Cash O.B & Online O.B) Modal */}
      {showOpenModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-100">
                Set Starting Opening Balances (O.B)
              </h3>
              <button onClick={() => setShowOpenModal(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleOpenSession} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-emerald-400 mb-1">
                  💵 Opening Cash in Drawer (PKR)
                </label>
                <input
                  type="number"
                  min={0}
                  value={openingCash}
                  onChange={(e) => setOpeningCash(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-purple-400 mb-1">
                  🏦 Opening Online / Bank Balance (PKR)
                </label>
                <input
                  type="number"
                  min={0}
                  value={openingOnline}
                  onChange={(e) => setOpeningOnline(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 font-mono"
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowOpenModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
                >
                  Save Opening Balances
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Close & Lock Today's Diary Modal */}
      {showCloseModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-slate-100">
              Close & Lock Today&apos;s Diary
            </h3>
            <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Expected Closing Cash:</span>
                <span className="font-mono font-bold text-emerald-400">
                  Rs. {(diarySummary.closingCashBalance || 0).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Expected Closing Online:</span>
                <span className="font-mono font-bold text-purple-400">
                  Rs. {(diarySummary.closingOnlineBalance || 0).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-800">
                <span className="text-slate-400">Cash Variance:</span>
                <span
                  className={`font-mono font-bold ${
                    Number(actualCashCount) - (diarySummary.closingCashBalance || 0) === 0
                      ? "text-emerald-400"
                      : "text-rose-400"
                  }`}
                >
                  Rs. {(Number(actualCashCount) - (diarySummary.closingCashBalance || 0)).toLocaleString()}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-emerald-400 mb-1">
                💵 Physical Closing Cash in Drawer (PKR) *
              </label>
              <input
                type="number"
                value={actualCashCount}
                onChange={(e) => setActualCashCount(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-purple-400 mb-1">
                🏦 Closing Online / Bank Balance (PKR) *
              </label>
              <input
                type="number"
                value={actualOnlineCount}
                onChange={(e) => setActualOnlineCount(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 font-mono"
              />
            </div>

            {Number(actualCashCount) - (diarySummary.closingCashBalance || 0) !== 0 && (
              <div>
                <label className="block text-xs font-semibold text-rose-400 mb-1">
                  Mandatory Variance Reason *
                </label>
                <input
                  type="text"
                  placeholder="Explain reason for shortage / overage..."
                  value={varianceReason}
                  onChange={(e) => setVarianceReason(e.target.value)}
                  className="w-full bg-slate-950 border border-rose-500/40 rounded-xl px-3 py-2 text-xs text-slate-100"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCloseModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCloseSession}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
              >
                Confirm & Lock Diary
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slip Image Preview Modal */}
      {previewSlipUrl && (
        <div
          onClick={() => setPreviewSlipUrl(null)}
          className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50"
        >
          <div className="relative max-w-lg w-full bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <img src={previewSlipUrl} alt="Expense Slip" className="w-full rounded-xl object-contain max-h-[75vh]" />
          </div>
        </div>
      )}
    </div>
  );
}
