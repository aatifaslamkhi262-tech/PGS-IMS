"use client";

import React, { useState, useEffect } from "react";
import {
  FileText,
  Calendar,
  DollarSign,
  TrendingUp,
  MapPin,
  RefreshCw,
  UserCheck,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Printer,
  Pencil,
  ShoppingBag,
  CheckCircle,
  AlertCircle,
  X,
  Package,
  ArrowUpRight,
  ArrowDownLeft,
  CreditCard,
  Building2,
  Wallet,
  Wrench,
} from "lucide-react";
import { ThermalReceiptModal } from "@/components/ThermalReceipt";
import { ThermalStaffHandoverModal, StaffHandoverData } from "@/components/ThermalStaffHandoverModal";

export default function DailyClosingReportPage() {
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>("ALL");
  const todayIso = new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
  const [dateRangePreset, setDateRangePreset] = useState<"TODAY" | "WEEK" | "MONTH" | "CUSTOM">("TODAY");
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  const [startDate, setStartDate] = useState<string>(todayIso);
  const [endDate, setEndDate] = useState<string>(todayIso);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<string>("ALL");

  const [cards, setCards] = useState<any>(null);
  const [rawSales, setRawSales] = useState<any[]>([]);
  const [repairsData, setRepairsData] = useState<any[]>([]);
  const [cardBreakdowns, setCardBreakdowns] = useState<Record<string, any[]>>({});
  const [canInspectCards, setCanInspectCards] = useState(false);
  const [activeCardModalKey, setActiveCardModalKey] = useState<string | null>(null);
  const [salesmanBreakdown, setSalesmanBreakdown] = useState<any[]>([]);
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Edit Salesman Modal
  const [editingSale, setEditingSale] = useState<any | null>(null);
  const [targetSalesmanId, setTargetSalesmanId] = useState<string>("");
  const [reassignLoading, setReassignLoading] = useState(false);

  // Thermal Receipt Modal
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [printReceiptData, setPrintReceiptData] = useState<any | null>(null);
  const [currentUser, setCurrentUser] = useState<any | null>(null);

  // Thermal Staff Handover Modal
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [handoverData, setHandoverData] = useState<StaffHandoverData | null>(null);

  useEffect(() => {
    fetchLocations();
    fetchStaff();
    fetchCurrentUser();
  }, []);

  const fetchCurrentUser = async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      if (data.success) setCurrentUser(data.data);
    } catch {
      // Silent catch
    }
  };

  useEffect(() => {
    if (selectedDate || (startDate && endDate)) {
      fetchReport();
    }
  }, [selectedLocation, selectedDate, startDate, endDate, selectedStaff]);

  const applyDatePreset = (preset: "TODAY" | "WEEK" | "MONTH" | "CUSTOM") => {
    setDateRangePreset(preset);
    const now = new Date();
    const endIso = now.toISOString().slice(0, 10);
    if (preset === "TODAY") {
      setSelectedDate(endIso);
      setStartDate(endIso);
      setEndDate(endIso);
    } else if (preset === "WEEK") {
      const weekAgo = new Date(now);
      weekAgo.setDate(now.getDate() - 6);
      const startIso = weekAgo.toISOString().slice(0, 10);
      setStartDate(startIso);
      setEndDate(endIso);
    } else if (preset === "MONTH") {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const startIso = monthStart.toISOString().slice(0, 10);
      setStartDate(startIso);
      setEndDate(endIso);
    }
  };

  const fetchLocations = async () => {
    try {
      const res = await fetch("/api/locations");
      const data = await res.json();
      if (data.success && data.data.length > 0) setLocations(data.data);
    } catch {
      setError("Failed to load locations.");
    }
  };

  const fetchStaff = async () => {
    try {
      const res = await fetch("/api/users/active");
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) setStaffList(data.data);
    } catch {
      // Silent catch
    }
  };

  const fetchReport = async () => {
    setLoading(true);
    setError("");

    try {
      const url = `/api/reports/daily-closing?date=${selectedDate}&startDate=${startDate}&endDate=${endDate}&locationId=${selectedLocation}&staffId=${selectedStaff}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.success) {
        const allowed = Boolean(data.data.canInspectCards);
        setCards(data.data.cards);
        setRawSales(data.data.rawSales || []);
        setRepairsData(data.data.repairs || []);
        setCanInspectCards(allowed);
        setCardBreakdowns(allowed ? (data.data.cardBreakdowns || {}) : {});
        if (!allowed) setActiveCardModalKey(null);

        const stockInBySalesman: Record<string, any> = data.data.salesmanStockIn || {};

        // Group salesman attribution for table (including branch & payment channels + Stock-In)
        const smMap: Record<
          string,
          {
            name: string;
            branchName: string;
            salesCount: number;
            directStockIn: number;
            exchangeStockIn: number;
            revenue: number;
            cogs: number;
            profit: number;
            cash: number;
            online: number;
            card: number;
            exchangeCredit: number;
            accruedSales: number;
            accruedProfit: number;
          }
        > = {};

        for (const s of data.data.rawSales || []) {
          const isWeb = s.saleSource === "WEBSITE";
          const smKey = isWeb ? "Website Orders" : (s.salesmanName || "Direct Counter");

          if (!smMap[smKey]) {
            smMap[smKey] = {
              name: smKey,
              branchName: s.locationName || "",
              salesCount: 0,
              directStockIn: 0,
              exchangeStockIn: 0,
              revenue: 0,
              cogs: 0,
              profit: 0,
              cash: 0,
              online: 0,
              card: 0,
              exchangeCredit: 0,
              accruedSales: 0,
              accruedProfit: 0,
            };
          }
          smMap[smKey].salesCount += 1;
          const delivery = Number(s.deliveryCharges || 0);
          const productSales = s.subtotal !== undefined
            ? Math.max(0, Number(s.subtotal || 0) - Number(s.discountAmount || 0))
            : Math.max(0, Number(s.totalAmount || 0) - delivery);
          const saleProfit = productSales - (s.totalCost || 0);

          if (s.isAccrued) {
            smMap[smKey].accruedSales += productSales;
            smMap[smKey].accruedProfit += saleProfit;
          } else {
            smMap[smKey].revenue += productSales;
            smMap[smKey].cogs += s.totalCost || 0;
            smMap[smKey].profit += saleProfit;
          }

          const pb = s.paymentBreakdown || {};
          smMap[smKey].cash += Number(pb.cash || 0);
          smMap[smKey].online += Number(pb.online || 0);
          smMap[smKey].card += Number(pb.card || 0);
          smMap[smKey].exchangeCredit += Number(pb.exchangeCredit || 0);
        }

        // Merge Stock-In attribution from Purchase Invoices
        for (const [, stIn] of Object.entries(stockInBySalesman)) {
          const sName = (stIn as any).salesmanName || "Assigned Staff";
          const matchedKey = Object.keys(smMap).find((k) => k.toLowerCase().startsWith(sName.toLowerCase())) || sName;
          if (!smMap[matchedKey]) {
            smMap[matchedKey] = {
              name: matchedKey,
              branchName: "",
              salesCount: 0,
              directStockIn: 0,
              exchangeStockIn: 0,
              revenue: 0,
              cogs: 0,
              profit: 0,
              cash: 0,
              online: 0,
              card: 0,
              exchangeCredit: 0,
              accruedSales: 0,
              accruedProfit: 0,
            };
          }
          smMap[matchedKey].directStockIn += Number((stIn as any).directStockIn || 0);
          smMap[matchedKey].exchangeStockIn += Number((stIn as any).exchangeStockIn || 0);
        }

        setSalesmanBreakdown(Object.values(smMap));
      } else {
        setError(data.error || "Failed to generate report.");
      }
    } catch {
      setError("Failed to generate report.");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAccrued = async (sale: any, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/sales/${sale._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "TOGGLE_ACCRUED" }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(data.message);
        await fetchReport();
        setTimeout(() => setSuccessMsg(""), 3500);
      } else {
        setError(data.error || "Failed to update accrued status.");
      }
    } catch {
      setError("Failed to update accrued status.");
    }
  };

  const handleSaveReassign = async () => {
    if (!editingSale) return;
    setReassignLoading(true);
    setError("");

    try {
      const selectedStaffObj = staffList.find((st) => st._id === targetSalesmanId);
      const payload = {
        salesmanId: targetSalesmanId === "DIRECT" ? null : targetSalesmanId,
        salesmanName: targetSalesmanId === "DIRECT" ? "Direct Counter" : selectedStaffObj?.name || "Unknown Staff",
        saleSource: targetSalesmanId === "DIRECT" ? "COUNTER" : "SALESMAN",
      };

      const res = await fetch(`/api/sales/${editingSale._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        setSuccessMsg("Salesman attribution updated successfully!");
        setEditingSale(null);
        await fetchReport();
        setTimeout(() => setSuccessMsg(""), 3500);
      } else {
        setError(data.error || "Failed to re-assign salesman.");
      }
    } catch {
      setError("Failed to re-assign salesman.");
    } finally {
      setReassignLoading(false);
    }
  };

  const handleCardClick = (cardKey: string) => {
    if (!canInspectCards) return;
    setActiveCardModalKey(cardKey);
  };

  const cardInteractiveClass = (hoverBorder: string) =>
    canInspectCards ? `${hoverBorder} cursor-pointer transition group` : "";

  const resolveSalePayments = (sale: any): Array<{ method: string; amount: number }> => {
    const pb = sale?.paymentBreakdown;
    if (pb) {
      const parts: Array<{ method: string; amount: number }> = [];
      if (Number(pb.cash || 0) > 0) parts.push({ method: "CASH", amount: Number(pb.cash) });
      if (Number(pb.card || 0) > 0) parts.push({ method: "CARD", amount: Number(pb.card) });
      if (Number(pb.online || 0) > 0) parts.push({ method: "BANK_TRANSFER", amount: Number(pb.online) });
      if (Number(pb.exchangeCredit || 0) > 0) parts.push({ method: "EXCHANGE_CREDIT", amount: Number(pb.exchangeCredit) });
      if (parts.length > 0) return parts;
    }
    if (Array.isArray(sale?.payments) && sale.payments.length > 0) {
      return sale.payments.map((p: any) => ({
        method: p.paymentMethod || p.method || "CASH",
        amount: Number(p.amount || 0),
      }));
    }
    const fallbackPaid =
      sale?.totalPaid !== undefined && sale?.totalPaid !== null
        ? Number(sale.totalPaid)
        : Number(sale?.totalAmount || 0);
    return fallbackPaid > 0
      ? [{ method: sale?.paymentMethod || "CASH", amount: fallbackPaid }]
      : [];
  };

  const handlePrintSlip = (sale: any, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const isRentalSwap =
      sale.saleSource === "EXCHANGE" ||
      sale.saleNumber?.startsWith("RNT-") ||
      sale.invoiceNumber?.startsWith("RNT-") ||
      (sale.notes && sale.notes.includes("Rental Return"));
    const resolvedPayments = resolveSalePayments(sale);
    const resolvedPaidAmount =
      sale.totalPaid !== undefined && sale.totalPaid !== null
        ? Number(sale.totalPaid)
        : resolvedPayments.reduce((sum, p) => sum + p.amount, 0) || Number(sale.totalAmount || 0);

    const prepared = {
      invoiceNumber:
        sale.saleNumber ||
        sale.invoiceNumber ||
        `INV-${sale._id.slice(-6).toUpperCase()}`,
      status: isRentalSwap ? "RENTAL_SWAP" : undefined,
      date: new Date(sale.completedAt || sale.createdAt).toLocaleString(),
      locationName: locations.find((l) => l._id === (sale.locationId || sale.location))?.name || sale.locationName || "Main Shop",
      cashierName: sale.createdByName || sale.createdBy || currentUser?.username || "Counter Staff",
      salesmanName: sale.salesmanName || "Direct Counter",
      customerName: sale.customerName || "Walk-in Customer",
      customerPhone: sale.customerPhone || "N/A",
      items: (sale.items || []).map((item: any) => ({
        productName: item.productName || item.title || "Product Item",
        condition: item.condition || "Used",
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal ?? (item.unitPrice * item.quantity),
        serialNumbers: item.serialNumbers || [],
      })),
      subtotal: sale.subtotal || sale.totalAmount,
      discountAmount: sale.discountAmount || 0,
      deliveryCharges: sale.deliveryCharges || 0,
      totalAmount: sale.totalAmount,
      paidAmount: resolvedPaidAmount,
      changeDue: 0,
      payments: resolvedPayments,
      notes: sale.notes,
    };

    setPrintReceiptData(prepared);
    setShowReceiptModal(true);
  };

  const handlePrintStaffHandover = (sm: any) => {
    const locObj = locations.find((l) => l._id === selectedLocation);
    const locName = locObj ? locObj.name : "All Locations";

    const attributedInvoices = rawSales
      .filter((s: any) => {
        if (sm.name === "Direct Counter") {
          return !s.salesman;
        }
        return (
          s.salesmanName === sm.name ||
          (s.salesman && s.salesman.toString() === sm.id?.toString())
        );
      })
      .map((s: any) => ({
        invoiceNumber: s.saleNumber || `INV-${s._id.slice(-6).toUpperCase()}`,
        totalAmount: s.totalAmount || 0,
        isAccrued: Boolean(s.isAccrued),
        customerName: s.customerName || "Walk-in",
      }));

    const handoverObj: StaffHandoverData = {
      salesmanName: sm.name,
      dateStr: selectedDate,
      locationName: locName,
      ordersClosed: sm.salesCount || 0,
      realizedSales: sm.revenue || 0,
      cogs: sm.cogs || 0,
      realizedProfit: sm.profit || 0,
      accruedSales: sm.accruedSales || 0,
      accruedProfit: sm.accruedProfit || 0,
      attributedInvoices,
    };

    setHandoverData(handoverObj);
    setShowHandoverModal(true);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 lg:p-6 space-y-6">
      {successMsg && (
        <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100">Daily Financial & Closing Report</h1>
            <p className="text-xs text-slate-400">
              Complete Audit View of 15 Financial, Inventory, Refund & Profit Stat Cards
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Date Preset Pills */}
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs">
            {(["TODAY", "WEEK", "MONTH", "CUSTOM"] as const).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => applyDatePreset(preset)}
                className={`px-2.5 py-1 rounded-lg font-bold transition ${
                  dateRangePreset === preset
                    ? "bg-indigo-600 text-white shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {preset === "TODAY"
                  ? "Today"
                  : preset === "WEEK"
                  ? "This Week"
                  : preset === "MONTH"
                  ? "This Month"
                  : "Custom Date"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs">
            <Calendar className="w-3.5 h-3.5 text-indigo-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setDateRangePreset("CUSTOM");
                setStartDate(e.target.value);
                setSelectedDate(e.target.value);
              }}
              className="bg-transparent text-slate-200 font-semibold focus:outline-none cursor-pointer"
            />
            <span className="text-slate-500 font-bold">→</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setDateRangePreset("CUSTOM");
                setEndDate(e.target.value);
              }}
              className="bg-transparent text-slate-200 font-semibold focus:outline-none cursor-pointer"
            />
          </div>

          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs">
            <MapPin className="w-3.5 h-3.5 text-indigo-400" />
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="bg-transparent text-slate-200 font-semibold focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900 text-slate-200">
                All Branches
              </option>
              {locations.map((loc) => (
                <option key={loc._id} value={loc._id} className="bg-slate-900 text-slate-200">
                  {loc.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs">
            <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
            <select
              value={selectedStaff}
              onChange={(e) => setSelectedStaff(e.target.value)}
              className="bg-transparent text-slate-200 font-semibold focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900 text-slate-200">
                All Salesmen
              </option>
              <option value="DIRECT" className="bg-slate-900 text-slate-200">
                Direct Counter
              </option>
              <option value="WEBSITE" className="bg-slate-900 text-slate-200">
                🌐 Website Orders
              </option>
              {staffList.map((st) => (
                <option key={st._id} value={st._id} className="bg-slate-900 text-slate-200">
                  {st.name} ({st.role})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={fetchReport}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {cards && (
        <div className="space-y-6">
            {/* SECTION 1: SALES & MONEY IN (Cards 1 to 6) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                <ArrowDownLeft className="w-4 h-4" />
                1. Sales & Money In (Payment Channel Breakdown)
              </h2>
              {canInspectCards && (
                <span className="text-[10px] text-slate-500">Click any card for lightweight breakdown</span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              <div
                onClick={canInspectCards ? () => handleCardClick("totalSales") : undefined}
                title={canInspectCards ? "Click to see invoice & repair breakdown" : undefined}
                className={`bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1 ${cardInteractiveClass("hover:border-indigo-500/60")}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-bold text-slate-400 uppercase ${canInspectCards ? "group-hover:text-indigo-300" : ""}`}>1. Total Sales</span>
                  {cards.deliveryCollected > 0 && (
                    <span className="text-[9px] font-bold text-cyan-400 bg-cyan-950/60 border border-cyan-800/60 px-1.5 py-0.5 rounded" title="Pass-through Delivery Fees Collected">
                      +Rs. {cards.deliveryCollected.toLocaleString()} Deliv.
                    </span>
                  )}
                </div>
                <p className="text-xl font-mono font-bold text-indigo-400">
                  Rs. {cards.totalSales.toLocaleString()}
                </p>
              </div>

              <div
                onClick={canInspectCards ? () => handleCardClick("cashReceived") : undefined}
                title={canInspectCards ? "Click to see cash inflows" : undefined}
                className={`bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1 ${cardInteractiveClass("hover:border-emerald-500/60")}`}
              >
                <span className="text-[10px] font-bold text-emerald-400 uppercase flex items-center gap-1">
                  <Wallet className="w-3 h-3" /> 2. Cash Received
                </span>
                <p className="text-xl font-mono font-bold text-emerald-400">
                  Rs. {cards.cashReceived.toLocaleString()}
                </p>
              </div>

              <div
                onClick={canInspectCards ? () => handleCardClick("card") : undefined}
                title={canInspectCards ? "Click to see card swipe receipts" : undefined}
                className={`bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1 ${cardInteractiveClass("hover:border-blue-500/60")}`}
              >
                <span className="text-[10px] font-bold text-blue-400 uppercase flex items-center gap-1">
                  <CreditCard className="w-3 h-3" /> 3. Card
                </span>
                <p className="text-xl font-mono font-bold text-blue-400">
                  Rs. {cards.card.toLocaleString()}
                </p>
              </div>

              <div
                onClick={canInspectCards ? () => handleCardClick("bankOnline") : undefined}
                title={canInspectCards ? "Click to see online transfers" : undefined}
                className={`bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1 ${cardInteractiveClass("hover:border-purple-500/60")}`}
              >
                <span className="text-[10px] font-bold text-purple-400 uppercase flex items-center gap-1">
                  <Building2 className="w-3 h-3" /> 4. Bank / Online
                </span>
                <p className="text-xl font-mono font-bold text-purple-400">
                  Rs. {cards.bankOnline.toLocaleString()}
                </p>
              </div>

              <div
                onClick={canInspectCards ? () => handleCardClick("settlementRecv") : undefined}
                title={canInspectCards ? "Click to see exchange settlement receipts" : undefined}
                className={`bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1 ${cardInteractiveClass("hover:border-emerald-400/60")}`}
              >
                <span className="text-[10px] font-bold text-emerald-300 uppercase">
                  5. Settlement Recv
                </span>
                <p className="text-xl font-mono font-bold text-emerald-300">
                  Rs. {cards.customerSettlementReceived.toLocaleString()}
                </p>
              </div>

              <div
                onClick={canInspectCards ? () => handleCardClick("exchangeCredit") : undefined}
                title={canInspectCards ? "Click to see exchange credit applied" : undefined}
                className={`bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1 ${cardInteractiveClass("hover:border-indigo-400/60")}`}
              >
                <span className="text-[10px] font-bold text-indigo-300 uppercase">
                  6. Exchange Credit
                </span>
                <p className="text-xl font-mono font-bold text-indigo-300">
                  Rs. {(cards.exchangeCredit || 0).toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* SECTION 2: INVENTORY & ACQUISITION (Cards 6A, 6B, 7, 8) */}
          <div className="space-y-2">
            <h2 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
              <Package className="w-4 h-4" />
              2. Inventory & Stock Valuation
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div
                onClick={canInspectCards ? () => handleCardClick("directStockIn") : undefined}
                title={canInspectCards ? "Click to see direct buyback invoices" : undefined}
                className={`bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1 ${cardInteractiveClass("hover:border-amber-500/60")}`}
              >
                <span className="text-[10px] font-bold text-amber-400 uppercase">
                  6A. Direct Stock-In
                </span>
                <p className="text-xl font-mono font-bold text-amber-400">
                  Rs. {(cards.directStockIn || 0).toLocaleString()}
                </p>
                <span className="text-[9px] text-slate-500">
                  Total Stock-In: Rs. {cards.stockInAcquisitionValue.toLocaleString()}
                </span>
              </div>

              <div
                onClick={canInspectCards ? () => handleCardClick("exchangeStockIn") : undefined}
                title={canInspectCards ? "Click to see exchange intake invoices" : undefined}
                className={`bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1 ${cardInteractiveClass("hover:border-amber-400/60")}`}
              >
                <span className="text-[10px] font-bold text-amber-300 uppercase">
                  6B. Exchange Stock-In
                </span>
                <p className="text-xl font-mono font-bold text-amber-300">
                  Rs. {(cards.exchangeStockIn || 0).toLocaleString()}
                </p>
              </div>

              <div
                onClick={canInspectCards ? () => handleCardClick("stockOutValue") : undefined}
                title={canInspectCards ? "Click to see stock-out breakdown" : undefined}
                className={`bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1 ${cardInteractiveClass("hover:border-slate-500/60")}`}
              >
                <span className="text-[10px] font-bold text-slate-300 uppercase">7. Stock-Out Value</span>
                <p className="text-xl font-mono font-bold text-slate-200">
                  Rs. {cards.stockOutValue.toLocaleString()}
                </p>
              </div>

              <div
                onClick={canInspectCards ? () => handleCardClick("cogs") : undefined}
                title={canInspectCards ? "Click to see cost breakdown" : undefined}
                className={`bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1 ${cardInteractiveClass("hover:border-slate-500/60")}`}
              >
                <span className="text-[10px] font-bold text-slate-400 uppercase">8. Cost of Goods Sold (COGS)</span>
                <p className="text-xl font-mono font-bold text-slate-300">
                  Rs. {cards.cogs.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* SECTION 3: REFUND & MONEY OUT (Cards 9 to 10) */}
          <div className="space-y-2">
            <h2 className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-2">
              <ArrowUpRight className="w-4 h-4" />
              3. Refunds & Money Out
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div
                onClick={canInspectCards ? () => handleCardClick("cashRefunds") : undefined}
                title={canInspectCards ? "Click to see cash/online refunds" : undefined}
                className={`bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1 ${cardInteractiveClass("hover:border-rose-500/60")}`}
              >
                <span className="text-[10px] font-bold text-rose-400 uppercase">9. Cash Refunds</span>
                <p className="text-xl font-mono font-bold text-rose-400">
                  Rs. {cards.cashRefunds.toLocaleString()}
                </p>
              </div>

              <div
                onClick={canInspectCards ? () => handleCardClick("settlementPaid") : undefined}
                title={canInspectCards ? "Click to see return/rental payouts" : undefined}
                className={`bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1 ${cardInteractiveClass("hover:border-rose-400/60")}`}
              >
                <span className="text-[10px] font-bold text-rose-300 uppercase">
                  10. Settlement Paid
                </span>
                <p className="text-xl font-mono font-bold text-rose-300">
                  Rs. {cards.customerSettlementPaid.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* SECTION 4: PROFIT & KHATA BALANCES (Cards 11 to 17) */}
          <div className="space-y-2">
            <h2 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              4. Profitability & Ledger Balances
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
              <div
                onClick={canInspectCards ? () => handleCardClick("grossProfit") : undefined}
                title={canInspectCards ? "Click to see gross profit per bill" : undefined}
                className={`bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1 ${cardInteractiveClass("hover:border-emerald-500/60")}`}
              >
                <span className="text-[10px] font-bold text-emerald-400 uppercase">11. Gross Profit</span>
                <p className="text-xl font-mono font-bold text-emerald-400">
                  Rs. {cards.grossProfit.toLocaleString()}
                </p>
              </div>

              <div
                onClick={canInspectCards ? () => handleCardClick("expenses") : undefined}
                title={canInspectCards ? "Click to see operating expense slips" : undefined}
                className={`bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1 ${cardInteractiveClass("hover:border-amber-500/60")}`}
              >
                <span className="text-[10px] font-bold text-amber-300 uppercase">12. Expenses</span>
                <p className="text-xl font-mono font-bold text-amber-300">
                  Rs. {cards.expenses.toLocaleString()}
                </p>
              </div>

              <div
                onClick={canInspectCards ? () => handleCardClick("netProfit") : undefined}
                title={canInspectCards ? "Click to see net profit formula & rows" : undefined}
                className={`bg-slate-900 border border-emerald-500/30 p-4 rounded-2xl space-y-1 bg-emerald-500/5 ${cardInteractiveClass("hover:border-emerald-400")}`}
              >
                <span className="text-[10px] font-bold text-emerald-300 uppercase">13. Realized Net Profit</span>
                <p className="text-xl font-mono font-bold text-emerald-300">
                  Rs. {cards.netProfit.toLocaleString()}
                </p>
              </div>

              <div
                onClick={canInspectCards ? () => handleCardClick("accruedSales") : undefined}
                title={canInspectCards ? "Click to see accrued/credit sales" : undefined}
                className={`bg-slate-900 border border-amber-500/30 p-4 rounded-2xl space-y-1 bg-amber-500/5 ${cardInteractiveClass("hover:border-amber-400")}`}
              >
                <span className="text-[10px] font-bold text-amber-400 uppercase">16. Accrued Sales</span>
                <p className="text-xl font-mono font-bold text-amber-400">
                  Rs. {(cards.accruedSales || 0).toLocaleString()}
                </p>
              </div>

              <div
                onClick={canInspectCards ? () => handleCardClick("accruedProfit") : undefined}
                title={canInspectCards ? "Click to see deferred profit on accrued sales" : undefined}
                className={`bg-slate-900 border border-amber-500/30 p-4 rounded-2xl space-y-1 bg-amber-500/5 ${cardInteractiveClass("hover:border-amber-400")}`}
              >
                <span className="text-[10px] font-bold text-amber-300 uppercase">17. Accrued Profit</span>
                <p className="text-xl font-mono font-bold text-amber-300">
                  Rs. {(cards.accruedProfit || 0).toLocaleString()}
                </p>
              </div>

              <div
                onClick={canInspectCards ? () => handleCardClick("outstanding") : undefined}
                title={canInspectCards ? "Click to see customers with Khata baqaya" : undefined}
                className={`bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1 ${cardInteractiveClass("hover:border-rose-500/60")}`}
              >
                <span className="text-[10px] font-bold text-rose-400 uppercase">14. Outstanding</span>
                <p className="text-xl font-mono font-bold text-rose-400">
                  Rs. {cards.outstanding.toLocaleString()}
                </p>
              </div>

              <div
                onClick={canInspectCards ? () => handleCardClick("customerAdvances") : undefined}
                title={canInspectCards ? "Click to see who holds Customer Advances & why" : undefined}
                className={`bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1 ${cardInteractiveClass("hover:border-indigo-500/70")}`}
              >
                <span className="text-[10px] font-bold text-indigo-300 uppercase">15. Customer Advances</span>
                <p className="text-xl font-mono font-bold text-indigo-300">
                  Rs. {cards.customerAdvances.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Staff Performance Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-indigo-400" />
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Staff Sales & Profit Attribution
                </h3>
              </div>
              <span className="text-[10px] text-slate-500 font-bold bg-slate-950 px-2 py-1 rounded border border-slate-800">
                Attribution Only (No Commission Logic)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                  <tr>
                    <th className="p-3">Salesman / Branch</th>
                    <th className="p-3 text-center">Orders</th>
                    <th className="p-3 text-right text-amber-400">Direct Stock-In</th>
                    <th className="p-3 text-right text-amber-300">Exchange Stock-In</th>
                    <th className="p-3 text-right">Stock-Out (Sales)</th>
                    <th className="p-3 text-right">COGS</th>
                    <th className="p-3 text-right">Realized Profit</th>
                    <th className="p-3 text-right text-emerald-400">Cash</th>
                    <th className="p-3 text-right text-purple-400">Online</th>
                    <th className="p-3 text-right text-blue-400">Card</th>
                    <th className="p-3 text-right text-indigo-300">Exchange Credit</th>
                    <th className="p-3 text-center">Handover Slip</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {salesmanBreakdown.map((sm: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-950/50">
                      <td className="p-3 font-sans font-bold text-slate-200">{sm.name}</td>
                      <td className="p-3 text-center text-slate-300 font-bold">{sm.salesCount}</td>
                      <td className="p-3 text-right text-amber-400 font-bold">
                        Rs. {(sm.directStockIn || 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-amber-300 font-bold">
                        Rs. {(sm.exchangeStockIn || 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-indigo-400 font-bold">
                        Rs. {sm.revenue.toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-slate-400">Rs. {sm.cogs.toLocaleString()}</td>
                      <td className="p-3 text-right text-emerald-400 font-bold">
                        Rs. {sm.profit.toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-emerald-400">
                        Rs. {(sm.cash || 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-purple-400">
                        Rs. {(sm.online || 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-blue-400">
                        Rs. {(sm.card || 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-indigo-300">
                        Rs. {(sm.exchangeCredit || 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => handlePrintStaffHandover(sm)}
                          title={`Print Handover Slip for ${sm.name}`}
                          className="px-2.5 py-1 text-[11px] font-sans font-semibold rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 transition-all flex items-center gap-1.5 mx-auto shadow-sm"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Print Slip</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Repair Services & Technician Attribution */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Repair Services & Technician Attribution
                </h3>
              </div>
              <span className="text-[10px] text-amber-400 font-semibold bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                {cards?.repairCount || 0} Total Repairs
              </span>
            </div>

            {/* Quick Repair Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                <p className="text-[10px] text-slate-400 font-semibold uppercase">Total Repair Revenue</p>
                <p className="text-sm font-mono font-bold text-indigo-400 mt-1">
                  Rs. {(cards?.repairRevenue || 0).toLocaleString()}
                </p>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                <p className="text-[10px] text-slate-400 font-semibold uppercase">Repair Cost (Kharcha)</p>
                <p className="text-sm font-mono font-bold text-slate-400 mt-1">
                  Rs. {(cards?.repairPartsCost || 0).toLocaleString()}
                </p>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                <p className="text-[10px] text-emerald-400 font-semibold uppercase">Repair Net Profit</p>
                <p className="text-sm font-mono font-bold text-emerald-400 mt-1">
                  Rs. {(cards?.repairProfit || 0).toLocaleString()}
                </p>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                <p className="text-[10px] text-amber-400 font-semibold uppercase">Completed Jobs</p>
                <p className="text-sm font-mono font-bold text-amber-400 mt-1">
                  {cards?.repairCount || 0}
                </p>
              </div>
            </div>

            {/* Technician Breakdown Table */}
            {(!cards?.technicianBreakdown || cards.technicianBreakdown.length === 0) ? (
              <div className="text-center py-6 text-slate-500 text-xs">
                No repair jobs recorded for the selected date and filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] text-slate-400 uppercase tracking-wider bg-slate-950/80">
                      <th className="p-3">Technician / Repaired By</th>
                      <th className="p-3 text-center">Jobs Completed</th>
                      <th className="p-3 text-right">Revenue (Billed)</th>
                      <th className="p-3 text-right">Cost (Kharcha)</th>
                      <th className="p-3 text-right text-emerald-400">Net Profit Earned</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {cards.technicianBreakdown.map((tech: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-950/50">
                        <td className="p-3 font-sans font-bold text-slate-200">{tech.technician}</td>
                        <td className="p-3 text-center text-slate-300 font-bold">{tech.count}</td>
                        <td className="p-3 text-right text-indigo-400 font-bold">
                          Rs. {tech.totalRevenue.toLocaleString()}
                        </td>
                        <td className="p-3 text-right text-slate-400">
                          Rs. {(tech.totalCost || 0).toLocaleString()}
                        </td>
                        <td className="p-3 text-right text-emerald-400 font-bold">
                          Rs. {(tech.profit !== undefined ? tech.profit : tech.laborRevenue).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Sales Audit Log */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Today's Sales Audit Log
                </h3>
              </div>
              <span className="text-[10px] text-slate-400 font-semibold bg-slate-950 px-2 py-1 rounded border border-slate-800">
                {rawSales.length} Total Sales
              </span>
            </div>

            {rawSales.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs">
                No completed sales recorded for the selected filters.
              </div>
            ) : (
              <div className="space-y-3">
                {rawSales.map((sale) => {
                  const isExpanded = expandedSaleId === sale._id;
                  const salesmanDisplay = sale.salesmanName || "Direct Counter";
                  const delivery = Number(sale.deliveryCharges || 0);
                  const productSales = sale.subtotal !== undefined
                    ? Math.max(0, Number(sale.subtotal || 0) - Number(sale.discountAmount || 0))
                    : Math.max(0, Number(sale.totalAmount || 0) - delivery);
                  const profit = productSales - (sale.totalCost || 0);

                  return (
                    <div
                      key={sale._id}
                      className="border border-slate-800 rounded-xl bg-slate-950/70 overflow-hidden transition shadow-sm"
                    >
                      <div
                        onClick={() => setExpandedSaleId(isExpanded ? null : sale._id)}
                        className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-slate-800/40 transition"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 transition">
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-slate-400" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-slate-100 text-xs">
                                {sale.invoiceNumber || `INV-${sale._id.slice(-6).toUpperCase()}`}
                              </span>
                              {sale.isAccrued && (
                                <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-bold px-2 py-0.5 rounded">
                                  🟧 Accrued Sale
                                </span>
                              )}
                              <span className="text-[10px] font-semibold text-slate-500">
                                {new Date(sale.completedAt || sale.createdAt).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 font-sans">
                              {sale.customerName || "Walk-in Customer"} •{" "}
                              <span className="text-slate-500">{sale.customerPhone || "No Phone"}</span>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 flex-wrap">
                          <div className="text-left md:text-right">
                            <span className="text-[10px] text-slate-400 block font-sans">Total Amount</span>
                            <span className="font-mono font-bold text-indigo-400 text-xs">
                              Rs. {(sale.totalAmount || 0).toLocaleString()}
                            </span>
                          </div>

                          <div className="text-left md:text-right">
                            <span className="text-[10px] text-slate-400 block font-sans">Profit</span>
                            <span className={`font-mono font-bold text-xs ${sale.isAccrued ? "text-amber-400" : "text-emerald-400"}`}>
                              Rs. {profit.toLocaleString()} {sale.isAccrued ? "(Accrued)" : ""}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300">
                            <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
                            <span>{salesmanDisplay}</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => handleToggleAccrued(sale, e)}
                              className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg transition border flex items-center gap-1 ${
                                sale.isAccrued
                                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30"
                                  : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white"
                              }`}
                              title={sale.isAccrued ? "Unmark Accrued (Mark as Realized)" : "Mark as Accrued Sale"}
                            >
                              {sale.isAccrued ? "🟧 Accrued (Unmark)" : "Mark Accrued"}
                            </button>
                            <button
                              onClick={(e) => handlePrintSlip(sale, e)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                              title="Print Thermal Slip"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Expanded Accordion: Items, Cost, Sale Price, Discounts & Totals */}
                      {isExpanded && (
                        <div className="border-t border-slate-800 bg-slate-900/60 p-4 space-y-4">
                          {/* Items Table */}
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left">
                              <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800 text-[11px] uppercase tracking-wider">
                                <tr>
                                  <th className="py-2.5 px-3">Item / Product</th>
                                  <th className="py-2.5 px-3 text-center">Qty</th>
                                  <th className="py-2.5 px-3 text-right">Cost Price (COGS)</th>
                                  <th className="py-2.5 px-3 text-right">Sale Price</th>
                                  <th className="py-2.5 px-3 text-right">Discount</th>
                                  <th className="py-2.5 px-3 text-right">Line Total</th>
                                  <th className="py-2.5 px-3 text-right text-emerald-400">Item Profit</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
                                {(sale.items || []).map((item: any, idx: number) => {
                                  const qty = item.quantity || 1;
                                  const unitCost = Number(item.unitCost || 0);
                                  const totalItemCost = unitCost * qty;
                                  const unitPrice = Number(item.unitPrice || 0);
                                  const itemDiscount = Number(item.discountAmount || 0);
                                  const lineTotal = Number(
                                    item.lineTotal !== undefined
                                      ? item.lineTotal
                                      : unitPrice * qty - itemDiscount
                                  );
                                  const itemProfit = lineTotal - totalItemCost;

                                  return (
                                    <tr key={idx} className="hover:bg-slate-950/40">
                                      <td className="py-2.5 px-3 font-sans">
                                        <div className="font-semibold text-slate-200">
                                          {item.productName || item.title || "Product Item"}
                                          {item.condition && (
                                            <span className="text-[10px] text-slate-400 ml-1.5 font-normal">
                                              ({item.condition})
                                            </span>
                                          )}
                                        </div>
                                        {item.serialNumbers && item.serialNumbers.length > 0 && (
                                          <div className="text-[10px] font-mono text-indigo-400 mt-0.5">
                                            S/N: {item.serialNumbers.join(", ")}
                                          </div>
                                        )}
                                      </td>
                                      <td className="py-2.5 px-3 text-center text-slate-300 font-bold">
                                        {qty}
                                      </td>
                                      <td className="py-2.5 px-3 text-right text-slate-400">
                                        Rs. {totalItemCost.toLocaleString()}
                                        {qty > 1 && (
                                          <span className="text-[10px] text-slate-500 block font-sans">
                                            (@ Rs. {unitCost.toLocaleString()})
                                          </span>
                                        )}
                                      </td>
                                      <td className="py-2.5 px-3 text-right text-slate-200 font-medium">
                                        Rs. {(unitPrice * qty).toLocaleString()}
                                        {qty > 1 && (
                                          <span className="text-[10px] text-slate-500 block font-sans">
                                            (@ Rs. {unitPrice.toLocaleString()})
                                          </span>
                                        )}
                                      </td>
                                      <td className="py-2.5 px-3 text-right text-amber-400 font-medium">
                                        {itemDiscount > 0
                                          ? `- Rs. ${itemDiscount.toLocaleString()}`
                                          : "—"}
                                      </td>
                                      <td className="py-2.5 px-3 text-right text-indigo-300 font-bold">
                                        Rs. {lineTotal.toLocaleString()}
                                      </td>
                                      <td
                                        className={`py-2.5 px-3 text-right font-bold ${
                                          itemProfit >= 0 ? "text-emerald-400" : "text-red-400"
                                        }`}
                                      >
                                        Rs. {itemProfit.toLocaleString()}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          {/* Financial Summary Breakdown Pill / Footer */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-2 border-t border-slate-800 text-xs">
                            <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80">
                              <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                                Subtotal
                              </span>
                              <span className="font-mono font-bold text-slate-200">
                                Rs. {Number(
                                  sale.subtotal !== undefined
                                    ? sale.subtotal
                                    : (sale.totalAmount || 0) - delivery + Number(sale.discountAmount || 0)
                                ).toLocaleString()}
                              </span>
                            </div>

                            <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80">
                              <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                                Overall Discount
                              </span>
                              <span className="font-mono font-bold text-amber-400">
                                {Number(sale.discountAmount || 0) > 0
                                  ? `- Rs. ${Number(sale.discountAmount || 0).toLocaleString()}`
                                  : "Rs. 0"}
                              </span>
                            </div>

                            <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80">
                              <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                                Delivery Fee
                              </span>
                              <span className="font-mono font-bold text-slate-300">
                                + Rs. {delivery.toLocaleString()}
                              </span>
                            </div>

                            <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80">
                              <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                                Total Cost (COGS)
                              </span>
                              <span className="font-mono font-bold text-slate-400">
                                Rs. {Number(sale.totalCost || 0).toLocaleString()}
                              </span>
                            </div>

                            <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80">
                              <span className="text-[10px] text-emerald-400 uppercase font-semibold block">
                                Net Realized Profit
                              </span>
                              <span
                                className={`font-mono font-bold ${
                                  profit >= 0 ? "text-emerald-400" : "text-red-400"
                                }`}
                              >
                                Rs. {profit.toLocaleString()}
                              </span>
                            </div>

                            <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80">
                              <span className="text-[10px] text-indigo-400 uppercase font-semibold block">
                                Payment Method
                              </span>
                              <span className="font-mono font-bold text-indigo-300 uppercase">
                                {(() => {
                                  const parts = resolveSalePayments(sale);
                                  if (parts.length > 1) {
                                    return parts
                                      .map((p) => `${p.method} (${p.amount.toLocaleString()})`)
                                      .join(" + ");
                                  }
                                  return parts[0]?.method || sale.paymentMethod || "CASH";
                                })()}
                              </span>
                            </div>
                          </div>

                          {/* Notes (if any) */}
                          {sale.notes && (
                            <div className="text-xs text-slate-400 bg-slate-950/50 p-2 rounded-lg border border-slate-800/60 font-sans">
                              <span className="font-semibold text-slate-300">Notes / Remarks: </span>
                              <span>{sale.notes}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Single Reusable Card Breakdown Summary Modal (Strictly visible only for authorized user) */}
      {canInspectCards && activeCardModalKey && cards && (() => {
        const realizedSales = rawSales.filter((s) => !s.isAccrued);
        const accruedSalesList = rawSales.filter((s) => s.isAccrued);
        const getProductRev = (s: any) =>
          s.subtotal !== undefined
            ? Math.max(0, Number(s.subtotal || 0) - Number(s.discountAmount || 0))
            : Math.max(0, Number(s.totalAmount || 0) - Number(s.deliveryCharges || 0));

        const saleSummaryRow = (s: any, amt: number, badgeOverride?: string) => ({
          ref: s.saleNumber || s.invoiceNumber || `INV-${String(s._id).slice(-6).toUpperCase()}`,
          date: s.completedAt || s.createdAt,
          summary: `${s.customerName || "Walk-in"} (${s.salesmanName || "Direct Counter"})`,
          amount: amt,
          kind: "SALE",
          targetId: s._id,
          badge: badgeOverride || (s.saleSource === "WEBSITE" ? "Online" : "Sale"),
        });

        const repairSummaryRow = (r: any, amt: number, badge = "Repair") => ({
          ref: r.repairNumber || "REP",
          date: r.createdAt,
          summary: `${r.customerName || "Customer"} — ${r.productName || "Repair"}`,
          amount: amt,
          kind: "REPAIR",
          targetId: r._id,
          badge,
        });

        const modalSpecs: Record<string, { title: string; total: number; formula: string; rows: any[] }> = {
          totalSales: {
            title: "1. Total Sales — Summary Breakdown",
            total: Number(cards.totalSales || 0),
            formula: `Retail Sales (Rs. ${Number(cards.retailSalesOnly || 0).toLocaleString()}) + Repair Revenue (Rs. ${Number(cards.repairRevenue || 0).toLocaleString()})`,
            rows: [
              ...realizedSales.map((s) => saleSummaryRow(s, getProductRev(s))),
              ...repairsData.map((r) => repairSummaryRow(r, Number(r.totalAmount || 0))),
            ],
          },
          cashReceived: {
            title: "2. Cash Received — Summary Breakdown",
            total: Number(cards.cashReceived || 0),
            formula: "All Cash Payments Collected Today (POS + Repairs + Rentals + Khata)",
            rows: cardBreakdowns.cashReceived || [],
          },
          card: {
            title: "3. Card Payments — Summary Breakdown",
            total: Number(cards.card || 0),
            formula: "All POS / Repair / Rental Card Swipes Today",
            rows: cardBreakdowns.card || [],
          },
          bankOnline: {
            title: "4. Bank / Online — Summary Breakdown",
            total: Number(cards.bankOnline || 0),
            formula: "All Bank Transfers / Raast / Online Collections Today",
            rows: cardBreakdowns.bankOnline || [],
          },
          settlementRecv: {
            title: "5. Settlement Recv — Summary Breakdown",
            total: Number(cards.customerSettlementReceived || 0),
            formula: "Net Payments Collected on Exchange / Swap Bills",
            rows: rawSales.filter((s) => s.saleSource === "EXCHANGE" && Number(s.totalPaid || 0) > 0).map((s) =>
              saleSummaryRow(s, Number(s.totalPaid || 0), "Exchange")
            ),
          },
          exchangeCredit: {
            title: "6. Exchange Credit — Summary Breakdown",
            total: Number(cards.exchangeCredit || 0),
            formula: "Returned Trade-In Credit Applied Against New Invoices",
            rows: cardBreakdowns.exchangeCredit || [],
          },
          directStockIn: {
            title: "6A. Direct Stock-In — Summary Breakdown",
            total: Number(cards.directStockIn || 0),
            formula: `Direct Customer Buybacks Today (Total Stock-In: Rs. ${Number(cards.stockInAcquisitionValue || 0).toLocaleString()})`,
            rows: cardBreakdowns.directStockIn || [],
          },
          exchangeStockIn: {
            title: "6B. Exchange Stock-In — Summary Breakdown",
            total: Number(cards.exchangeStockIn || 0),
            formula: "Customer Trade-In / Return Stock Intakes Today",
            rows: cardBreakdowns.exchangeStockIn || [],
          },
          stockOutValue: {
            title: "7. Stock-Out Value — Summary Breakdown",
            total: Number(cards.stockOutValue || 0),
            formula: "Cost Value of Inventory Issued (Completed Sales + Rental Stock-Out)",
            rows: [
              ...rawSales.filter((s) => Number(s.totalCost || 0) > 0).map((s) => saleSummaryRow(s, Number(s.totalCost || 0))),
              ...(cardBreakdowns.rentalStockOut || []),
            ],
          },
          cogs: {
            title: "8. Cost of Goods Sold (COGS) — Summary Breakdown",
            total: Number(cards.cogs || 0),
            formula: "Realized Sale Inventory Cost + Repair Parts & Direct Cost",
            rows: [
              ...realizedSales.filter((s) => Number(s.totalCost || 0) > 0).map((s) => saleSummaryRow(s, Number(s.totalCost || 0))),
              ...repairsData
                .map((r) => ({ r, c: Number(r.repairCost || 0) + Number(r.partsCostTotal || 0) }))
                .filter((x) => x.c > 0)
                .map(({ r, c }) => repairSummaryRow(r, c, "Repair Cost")),
            ],
          },
          cashRefunds: {
            title: "9. Cash Refunds — Summary Breakdown",
            total: Number(cards.cashRefunds || 0),
            formula: "Cash & Online Drawer Refunds Paid Out Today",
            rows: cardBreakdowns.cashRefunds || [],
          },
          settlementPaid: {
            title: "10. Settlement Paid — Summary Breakdown",
            total: Number(cards.customerSettlementPaid || 0),
            formula: "Return & Rental Deposit Refunds Returned to Customers",
            rows: cardBreakdowns.settlementPaid || [],
          },
          grossProfit: {
            title: "11. Gross Profit — Summary Breakdown",
            total: Number(cards.grossProfit || 0),
            formula: `Realized Product Sales Profit + Repair Profit (Rs. ${Number(cards.repairProfit || 0).toLocaleString()})`,
            rows: [
              ...realizedSales.map((s) => saleSummaryRow(s, getProductRev(s) - Number(s.totalCost || 0))),
              ...repairsData.map((r) =>
                repairSummaryRow(
                  r,
                  Number(r.totalAmount || 0) - (Number(r.repairCost || 0) + Number(r.partsCostTotal || 0)),
                  "Repair GP"
                )
              ),
            ],
          },
          expenses: {
            title: "12. Operating Expenses — Summary Breakdown",
            total: Number(cards.expenses || 0),
            formula: "Daily Operating Expenses Only (Excludes Purchasing & Atif Transfers)",
            rows: cardBreakdowns.expenses || [],
          },
          netProfit: {
            title: "13. Realized Net Profit — Summary Breakdown",
            total: Number(cards.netProfit || 0),
            formula: `Gross Profit (Rs. ${Number(cards.grossProfit || 0).toLocaleString()}) - Expenses (Rs. ${Number(cards.expenses || 0).toLocaleString()})`,
            rows: [
              ...realizedSales.map((s) => saleSummaryRow(s, getProductRev(s) - Number(s.totalCost || 0), "Profit +")),
              ...repairsData.map((r) =>
                repairSummaryRow(
                  r,
                  Number(r.totalAmount || 0) - (Number(r.repairCost || 0) + Number(r.partsCostTotal || 0)),
                  "Repair GP +"
                )
              ),
              ...(cardBreakdowns.expenses || []).map((ex: any) => ({
                ...ex,
                amount: -Math.abs(Number(ex.amount || 0)),
                badge: "Expense -",
              })),
            ],
          },
          accruedSales: {
            title: "16. Accrued Sales — Summary Breakdown",
            total: Number(cards.accruedSales || 0),
            formula: "Sales Marked as Accrued (Credit / Deferred Recognition)",
            rows: accruedSalesList.map((s) => saleSummaryRow(s, getProductRev(s), "Accrued")),
          },
          accruedProfit: {
            title: "17. Accrued Profit — Summary Breakdown",
            total: Number(cards.accruedProfit || 0),
            formula: "Deferred Net Margin on Accrued Sales",
            rows: accruedSalesList.map((s) => saleSummaryRow(s, getProductRev(s) - Number(s.totalCost || 0), "Accrued GP")),
          },
          outstanding: {
            title: "14. Outstanding (Customer Udhar) — Summary Breakdown",
            total: Number(cards.outstanding || 0),
            formula: "All Active Customers with Open Khata Baqaya",
            rows: cardBreakdowns.outstanding || [],
          },
          customerAdvances: {
            title: "15. Customer Advances — Summary Breakdown",
            total: Number(cards.customerAdvances || 0),
            formula: "Active Rental Deposits + Pending Advance Bookings + Khata / Ledger Advances",
            rows: cardBreakdowns.customerAdvances || [],
          },
        };

        const modalSpec = modalSpecs[activeCardModalKey];
        if (!modalSpec) return null;

        const handleModalRowClick = (row: any) => {
          if (row.kind === "SALE") {
            const matchedSale = rawSales.find((s) => s._id === row.targetId);
            if (matchedSale) {
              setActiveCardModalKey(null);
              handlePrintSlip(matchedSale);
              return;
            }
            window.open("/sales?mode=QUEUE", "_blank", "noopener,noreferrer");
            return;
          }
          if (row.kind === "REPAIR") {
            const matchedRepair = repairsData.find(
              (r) => r._id === row.targetId || r.repairNumber === row.ref
            );
            if (matchedRepair) {
              setActiveCardModalKey(null);
              setPrintReceiptData({
                invoiceNumber: matchedRepair.repairNumber,
                status: matchedRepair.status || "REPAIR",
                date: new Date(matchedRepair.createdAt).toLocaleString(),
                locationName: matchedRepair.locationName || "Main Shop",
                cashierName: matchedRepair.createdBy || currentUser?.username || "Counter Staff",
                salesmanName: matchedRepair.repairedBy || "Technician",
                customerName: matchedRepair.customerName || "Customer",
                customerPhone: matchedRepair.customerPhone || "N/A",
                items: [
                  {
                    productName: `${matchedRepair.productName || "Repair Job"}${matchedRepair.faultReason ? ` (${matchedRepair.faultReason})` : ""}`,
                    condition: "Repair",
                    quantity: 1,
                    unitPrice: Number(matchedRepair.totalAmount || 0),
                    lineTotal: Number(matchedRepair.totalAmount || 0),
                  },
                ],
                subtotal: Number(matchedRepair.totalAmount || 0),
                discountAmount: 0,
                deliveryCharges: 0,
                totalAmount: Number(matchedRepair.totalAmount || 0),
                paidAmount: Number(matchedRepair.paidAmount || 0),
                changeDue: 0,
                balanceDue: Number(matchedRepair.balanceDue || 0),
                payments: [
                  {
                    method: matchedRepair.paymentMethod || "CASH",
                    amount: Number(matchedRepair.paidAmount || 0),
                  },
                ],
              });
              setShowReceiptModal(true);
              return;
            }
            window.open("/repairs", "_blank", "noopener,noreferrer");
            return;
          }
          if (row.kind === "CUSTOMER") {
            window.open("/customers", "_blank", "noopener,noreferrer");
            return;
          }
          if (row.kind === "PURCHASE") {
            window.open("/purchase-invoices", "_blank", "noopener,noreferrer");
            return;
          }
          if (row.kind === "RENTAL") {
            window.open("/sales?mode=RETURNS", "_blank", "noopener,noreferrer");
            return;
          }
          window.open("/cash-sessions", "_blank", "noopener,noreferrer");
        };

        const badgeClass = (badge?: string) => {
          const b = String(badge || "").toLowerCase();
          if (b.includes("expense") || b.includes("refund") || b.includes("due")) {
            return "bg-rose-500/15 text-rose-300 border-rose-500/30";
          }
          if (b.includes("advance") || b.includes("accrued") || b.includes("buyback") || b.includes("repair")) {
            return "bg-amber-500/15 text-amber-300 border-amber-500/30";
          }
          if (b.includes("khata") || b.includes("ledger") || b.includes("profit") || b.includes("online")) {
            return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
          }
          return "bg-indigo-500/15 text-indigo-300 border-indigo-500/30";
        };

        return (
          <div
            onClick={() => setActiveCardModalKey(null)}
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              {/* Header */}
              <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-3">
                <h3 className="text-sm sm:text-base font-bold text-slate-100 truncate">
                  {modalSpec.title}
                </h3>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="px-3 py-1 rounded-full bg-indigo-600/90 text-white text-xs font-mono font-bold">
                    Total: Rs. {Number(modalSpec.total || 0).toLocaleString()}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveCardModalKey(null)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
                    title="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Formula Sub-Banner */}
              <div className="px-5 pt-3">
                <div className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-300 font-mono">
                  <span className="font-bold text-slate-100">
                    Rs. {Number(modalSpec.total || 0).toLocaleString()}
                  </span>{" "}
                  <span className="text-slate-500">=</span>{" "}
                  <span className="font-sans text-slate-400">{modalSpec.formula}</span>
                </div>
              </div>

              {/* Lightweight 4-Column List */}
              <div className="p-5 overflow-y-auto flex-1">
                {modalSpec.rows.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-500">
                    Is card mein abhi koi entry nahi hai.
                  </div>
                ) : (
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                        <th className="pb-2 pr-3 font-semibold">Ref #</th>
                        <th className="pb-2 px-3 font-semibold">Date / Time</th>
                        <th className="pb-2 px-3 font-semibold">Summary</th>
                        <th className="pb-2 pl-3 text-right font-semibold">Amount (PKR)</th>
                        <th className="pb-2 w-6"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {modalSpec.rows.map((row: any, idx: number) => (
                        <tr
                          key={`${row.ref}-${idx}`}
                          onClick={() => handleModalRowClick(row)}
                          className="hover:bg-slate-950/70 cursor-pointer transition group"
                        >
                          <td className="py-2.5 pr-3 whitespace-nowrap">
                            <span
                              className={`inline-block px-2 py-0.5 rounded border text-[11px] font-mono font-semibold ${badgeClass(row.badge)}`}
                            >
                              {row.ref}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-300 whitespace-nowrap font-mono text-[11px]">
                            {row.date
                              ? new Date(row.date).toLocaleString("en-PK", {
                                  day: "2-digit",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "—"}
                          </td>
                          <td className="py-2.5 px-3 text-slate-200">
                            {row.summary}
                          </td>
                          <td
                            className={`py-2.5 pl-3 text-right font-mono font-bold whitespace-nowrap ${
                              Number(row.amount || 0) < 0 ? "text-rose-400" : "text-slate-100"
                            }`}
                          >
                            {Number(row.amount || 0) < 0 ? "- " : ""}Rs.{" "}
                            {Math.abs(Number(row.amount || 0)).toLocaleString()}
                          </td>
                          <td className="py-2.5 pl-2 text-right text-slate-500 group-hover:text-indigo-400">
                            <ChevronRight className="w-3.5 h-3.5 inline" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/50 flex items-center justify-between gap-3">
                <span className="text-[11px] text-slate-500">
                  Tip: Kisi bhi row par click karke invoice/module detail kholen • Lightweight Summary View
                </span>
                <button
                  type="button"
                  onClick={() => setActiveCardModalKey(null)}
                  className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Thermal Receipt Modal */}
      {showReceiptModal && printReceiptData && (
        <ThermalReceiptModal
          receiptData={printReceiptData}
          onClose={() => {
            setShowReceiptModal(false);
            setPrintReceiptData(null);
          }}
        />
      )}

      {/* Thermal Staff Handover Modal */}
      {showHandoverModal && handoverData && (
        <ThermalStaffHandoverModal
          handoverData={handoverData}
          onClose={() => {
            setShowHandoverModal(false);
            setHandoverData(null);
          }}
        />
      )}
    </div>
  );
}
