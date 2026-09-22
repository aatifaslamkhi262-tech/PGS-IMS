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
} from "lucide-react";
import { ThermalReceiptModal } from "@/components/ThermalReceipt";

export default function DailyClosingReportPage() {
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>("ALL");
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [staffList, setStaffList] = useState<any[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<string>("ALL");

  const [cards, setCards] = useState<any>(null);
  const [rawSales, setRawSales] = useState<any[]>([]);
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
    if (selectedDate) {
      fetchReport();
    }
  }, [selectedLocation, selectedDate, selectedStaff]);

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
      const url = `/api/reports/daily-closing?date=${selectedDate}&locationId=${selectedLocation}&staffId=${selectedStaff}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.success) {
        setCards(data.data.cards);
        setRawSales(data.data.rawSales || []);

        // Group salesman attribution for table
        const smMap: Record<string, { name: string; salesCount: number; revenue: number; cogs: number; profit: number }> = {};
        for (const s of data.data.rawSales || []) {
          const smName = s.salesmanName || "Direct Counter";
          if (!smMap[smName]) {
            smMap[smName] = { name: smName, salesCount: 0, revenue: 0, cogs: 0, profit: 0 };
          }
          smMap[smName].salesCount += 1;
          smMap[smName].revenue += s.totalAmount || 0;
          smMap[smName].cogs += s.totalCost || 0;
          smMap[smName].profit += (s.totalAmount || 0) - (s.totalCost || 0);
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

  const handlePrintSlip = (sale: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const prepared = {
      invoiceNumber: sale.invoiceNumber || `INV-${sale._id.slice(-6).toUpperCase()}`,
      date: new Date(sale.createdAt).toLocaleString(),
      locationName: locations.find((l) => l._id === sale.locationId)?.name || "Main Shop",
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
      paidAmount: sale.totalPaid || sale.totalAmount,
      changeDue: 0,
      payments: [{ method: sale.paymentMethod || "CASH", amount: sale.totalAmount }],
    };

    setPrintReceiptData(prepared);
    setShowReceiptModal(true);
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

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs">
            <MapPin className="w-3.5 h-3.5 text-indigo-400" />
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="bg-transparent text-slate-200 font-semibold focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900 text-slate-200">
                All Locations / Branches
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
                All Staff Members
              </option>
              <option value="DIRECT" className="bg-slate-900 text-slate-200">
                Direct Counter
              </option>
              {staffList.map((st) => (
                <option key={st._id} value={st._id} className="bg-slate-900 text-slate-200">
                  {st.name} ({st.role})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs">
            <Calendar className="w-3.5 h-3.5 text-indigo-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-slate-200 font-semibold focus:outline-none cursor-pointer"
            />
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
          {/* SECTION 1: SALES & MONEY IN (Cards 1 to 5) */}
          <div className="space-y-2">
            <h2 className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
              <ArrowDownLeft className="w-4 h-4" />
              1. Sales & Money In (Payment Channel Breakdown)
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase">1. Total Sales</span>
                <p className="text-xl font-mono font-bold text-indigo-400">
                  Rs. {cards.totalSales.toLocaleString()}
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1">
                <span className="text-[10px] font-bold text-emerald-400 uppercase flex items-center gap-1">
                  <Wallet className="w-3 h-3" /> 2. Cash Received
                </span>
                <p className="text-xl font-mono font-bold text-emerald-400">
                  Rs. {cards.cashReceived.toLocaleString()}
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1">
                <span className="text-[10px] font-bold text-blue-400 uppercase flex items-center gap-1">
                  <CreditCard className="w-3 h-3" /> 3. Card
                </span>
                <p className="text-xl font-mono font-bold text-blue-400">
                  Rs. {cards.card.toLocaleString()}
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1">
                <span className="text-[10px] font-bold text-purple-400 uppercase flex items-center gap-1">
                  <Building2 className="w-3 h-3" /> 4. Bank / Online
                </span>
                <p className="text-xl font-mono font-bold text-purple-400">
                  Rs. {cards.bankOnline.toLocaleString()}
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1">
                <span className="text-[10px] font-bold text-emerald-300 uppercase">
                  5. Settlement Recv
                </span>
                <p className="text-xl font-mono font-bold text-emerald-300">
                  Rs. {cards.customerSettlementReceived.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* SECTION 2: INVENTORY & ACQUISITION (Cards 6 to 8) */}
          <div className="space-y-2">
            <h2 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
              <Package className="w-4 h-4" />
              2. Inventory & Stock Valuation
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1">
                <span className="text-[10px] font-bold text-amber-400 uppercase">
                  6. Stock-In Acquisition Value
                </span>
                <p className="text-xl font-mono font-bold text-amber-400">
                  Rs. {cards.stockInAcquisitionValue.toLocaleString()}
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1">
                <span className="text-[10px] font-bold text-slate-300 uppercase">7. Stock-Out Value</span>
                <p className="text-xl font-mono font-bold text-slate-200">
                  Rs. {cards.stockOutValue.toLocaleString()}
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1">
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
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1">
                <span className="text-[10px] font-bold text-rose-400 uppercase">9. Cash Refunds</span>
                <p className="text-xl font-mono font-bold text-rose-400">
                  Rs. {cards.cashRefunds.toLocaleString()}
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1">
                <span className="text-[10px] font-bold text-rose-300 uppercase">
                  10. Settlement Paid
                </span>
                <p className="text-xl font-mono font-bold text-rose-300">
                  Rs. {cards.customerSettlementPaid.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* SECTION 4: PROFIT & KHATA BALANCES (Cards 11 to 15) */}
          <div className="space-y-2">
            <h2 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              4. Profitability & Ledger Balances
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1">
                <span className="text-[10px] font-bold text-emerald-400 uppercase">11. Gross Profit</span>
                <p className="text-xl font-mono font-bold text-emerald-400">
                  Rs. {cards.grossProfit.toLocaleString()}
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1">
                <span className="text-[10px] font-bold text-amber-300 uppercase">12. Expenses</span>
                <p className="text-xl font-mono font-bold text-amber-300">
                  Rs. {cards.expenses.toLocaleString()}
                </p>
              </div>

              <div className="bg-slate-900 border border-emerald-500/30 p-4 rounded-2xl space-y-1 bg-emerald-500/5">
                <span className="text-[10px] font-bold text-emerald-300 uppercase">13. Net Profit</span>
                <p className="text-xl font-mono font-bold text-emerald-300">
                  Rs. {cards.netProfit.toLocaleString()}
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1">
                <span className="text-[10px] font-bold text-rose-400 uppercase">14. Outstanding</span>
                <p className="text-xl font-mono font-bold text-rose-400">
                  Rs. {cards.outstanding.toLocaleString()}
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1">
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
                    <th className="p-3">Salesman / Attribution</th>
                    <th className="p-3 text-center">Orders Closed</th>
                    <th className="p-3 text-right">Total Sales</th>
                    <th className="p-3 text-right">COGS</th>
                    <th className="p-3 text-right">Net Profit Generated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {salesmanBreakdown.map((sm: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-950/50">
                      <td className="p-3 font-sans font-bold text-slate-200">{sm.name}</td>
                      <td className="p-3 text-center text-slate-300 font-bold">{sm.salesCount}</td>
                      <td className="p-3 text-right text-indigo-400 font-bold">
                        Rs. {sm.revenue.toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-slate-400">Rs. {sm.cogs.toLocaleString()}</td>
                      <td className="p-3 text-right text-emerald-400 font-bold">
                        Rs. {sm.profit.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
                  const profit = (sale.totalAmount || 0) - (sale.totalCost || 0);

                  return (
                    <div
                      key={sale._id}
                      className="border border-slate-800 rounded-xl bg-slate-950/70 overflow-hidden transition"
                    >
                      <div
                        onClick={() => setExpandedSaleId(isExpanded ? null : sale._id)}
                        className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-slate-800/40 transition"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 rounded-lg bg-slate-800 text-slate-400">
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
                              <span className="text-[10px] font-semibold text-slate-500">
                                {new Date(sale.createdAt).toLocaleTimeString([], {
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
                            <span className="font-mono font-bold text-emerald-400 text-xs">
                              Rs. {profit.toLocaleString()}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300">
                            <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
                            <span>{salesmanDisplay}</span>
                          </div>

                          <div className="flex items-center gap-2">
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
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

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
    </div>
  );
}
