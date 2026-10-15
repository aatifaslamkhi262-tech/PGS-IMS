"use client";

import React, { useState, useEffect } from "react";
import {
  Users,
  Search,
  Plus,
  DollarSign,
  CreditCard,
  Phone,
  MapPin,
  FileText,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Wallet,
  ChevronDown,
  ChevronUp,
  Printer,
  UserCheck,
  PlusCircle,
  MinusCircle,
  BookOpen,
  Receipt,
  ArrowDownLeft,
  ArrowUpRight,
} from "lucide-react";
import { ThermalReceiptModal } from "@/components/ThermalReceipt";

export default function CustomersPage() {
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [customerSales, setCustomerSales] = useState<any[]>([]);
  const [customerRentals, setCustomerRentals] = useState<any[]>([]);
  const [customerLedger, setCustomerLedger] = useState<any[]>([]);
  const [activeHistoryTab, setActiveHistoryTab] = useState<"LEDGER" | "SALES">("LEDGER");
  const [salesmen, setSalesmen] = useState<any[]>([]);
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Re-assign Salesman Modal State
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [reassignSale, setReassignSale] = useState<any | null>(null);
  const [targetSalesmanId, setTargetSalesmanId] = useState("");

  // Receipt Print Modal State
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [printReceiptData, setPrintReceiptData] = useState<any | null>(null);

  // Create Customer Form State (with Opening Balance)
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustAddress, setNewCustAddress] = useState("");
  const [newCustOpeningBal, setNewCustOpeningBal] = useState<number | "">("");
  const [newCustBalType, setNewCustBalType] = useState<"DUE" | "ADVANCE">("DUE");

  // Khata (+ / -) Modal State (Unified Modal for Udhar Diya (+) or Payment Wasool (-))
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [khataAction, setKhataAction] = useState<"PAYMENT" | "ADD_DEBT">("PAYMENT");
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD" | "BANK_TRANSFER">("CASH");
  const [paymentNotes, setPaymentNotes] = useState("");

  useEffect(() => {
    fetchLocations();
    fetchCustomers();
    fetchSalesmen();
  }, []);

  useEffect(() => {
    if (selectedCustomer) {
      fetchCustomerHistory(selectedCustomer);
      fetchCustomerLedger(selectedCustomer._id);
    }
  }, [selectedCustomer]);

  const fetchSalesmen = async () => {
    try {
      const res = await fetch("/api/users/active");
      const data = await res.json();
      if (data.success) setSalesmen(data.data);
    } catch {
      // ignore
    }
  };

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

  const fetchCustomers = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/customers?search=${encodeURIComponent(searchTerm)}`);
      const data = await res.json();
      if (data.success) {
        setCustomers(data.data);
        if (data.data.length > 0 && !selectedCustomer) {
          setSelectedCustomer(data.data[0]);
        }
      }
    } catch {
      setError("Failed to load customers.");
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomerHistory = async (cust: any) => {
    try {
      const queryParam = cust.phone ? `search=${encodeURIComponent(cust.phone)}` : `customerId=${cust._id}`;
      const [salesRes, rentalRes] = await Promise.all([
        fetch(`/api/sales?${queryParam}&limit=100`),
        fetch(`/api/sales/rentals?query=${encodeURIComponent(cust.phone || cust.name)}`),
      ]);
      const salesData = await salesRes.json();
      const rentalData = await rentalRes.json();
      if (salesData.success) {
        setCustomerSales(salesData.data);
      }
      if (rentalData.success && Array.isArray(rentalData.data)) {
        setCustomerRentals(rentalData.data);
      }
    } catch {
      // Silent error for history
    }
  };

  const fetchCustomerLedger = async (customerId: string) => {
    try {
      const res = await fetch(`/api/customers/ledger?customerId=${customerId}`);
      const data = await res.json();
      if (data.success) {
        setCustomerLedger(data.data || []);
      }
    } catch {
      // Silent error for ledger
    }
  };

  const handleReassignSalesman = async () => {
    if (!reassignSale) return;
    try {
      const res = await fetch(`/api/sales/${reassignSale._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salesmanId: targetSalesmanId || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(data.message || "Salesman attribution updated!");
        setShowReassignModal(false);
        if (selectedCustomer) {
          fetchCustomerHistory(selectedCustomer);
        }
      } else {
        setError(data.error || "Failed to update salesman attribution.");
      }
    } catch (err: any) {
      setError(err.message || "Network error.");
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName || !newCustPhone) return;

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCustName,
          phone: newCustPhone,
          address: newCustAddress,
          openingBalance: Number(newCustOpeningBal || 0),
          openingBalanceType: newCustBalType,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Failed to create customer.");
        return;
      }

      setShowCreateModal(false);
      setSuccessMsg(`Customer '${newCustName}' created!`);
      setNewCustName("");
      setNewCustPhone("");
      setNewCustAddress("");
      setNewCustOpeningBal("");
      setNewCustBalType("DUE");
      fetchCustomers();
    } catch (err: any) {
      setError(err.message || "Network error.");
    } finally {
      setLoading(false);
    }
  };

  const handleLedgerPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || paymentAmount <= 0) return;

    setLoading(true);
    setError("");
    setSuccessMsg("");

    try {
      const res = await fetch("/api/customers/ledger-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: selectedCustomer._id,
          locationId: selectedLocation,
          amount: Number(paymentAmount),
          paymentMethod: khataAction === "PAYMENT" ? paymentMethod : undefined,
          notes: paymentNotes,
          actionType: khataAction,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Failed to process khata entry.");
        setLoading(false);
        return;
      }

      setShowPaymentModal(false);
      setSuccessMsg(
        khataAction === "ADD_DEBT"
          ? `Udhar (+Rs. ${paymentAmount.toLocaleString()}) added for ${selectedCustomer.name}!`
          : `Payment (-Rs. ${paymentAmount.toLocaleString()}) recorded cleanly for ${selectedCustomer.name}!`
      );
      setPaymentAmount(0);
      setPaymentNotes("");
      if (data.data?.customer) {
        setSelectedCustomer(data.data.customer);
      }
      fetchCustomers();
      fetchCustomerHistory(selectedCustomer);
      fetchCustomerLedger(selectedCustomer._id);
    } catch (err: any) {
      setError(err.message || "Network error.");
    } finally {
      setLoading(false);
    }
  };

  // Compute total active customer purchases, paid & active rental deposits
  const activeSales = customerSales.filter((s) => s.status !== "CANCELLED");
  const totalPurchases = activeSales.reduce((sum, s) => sum + s.totalAmount, 0);
  const totalPaid = activeSales.reduce((sum, s) => sum + (s.totalPaid || s.totalAmount), 0);
  const activeRentalDepositTotal = customerRentals
    .filter((r) => r.status !== "COMPLETED")
    .reduce((sum, r) => sum + (r.totalDepositHeld || 0), 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100">Customers & Khata Ledger Directory</h1>
            <p className="text-xs text-slate-400">
              Track Customer Balance Dues, Advance Deposits, Store Credits, & Ledger Payments
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/20 transition flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>New Customer</span>
          </button>

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
            onClick={fetchCustomers}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Main Directory Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Customer Directory List */}
        <div className="lg:col-span-1 space-y-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
            <input
              type="text"
              placeholder="Search customer name or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchCustomers()}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-2 max-h-[calc(100vh-250px)] overflow-y-auto pr-1">
            {customers.map((c) => {
              const isSelected = selectedCustomer?._id === c._id;
              return (
                <div
                  key={c._id}
                  onClick={() => setSelectedCustomer(c)}
                  className={`p-3.5 rounded-xl border transition cursor-pointer space-y-1 ${
                    isSelected
                      ? "bg-indigo-950/40 border-indigo-500 shadow-lg shadow-indigo-500/10"
                      : "bg-slate-900 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-200">{c.name}</span>
                    <span className={`text-[10px] font-mono font-bold ${
                      c.outstandingBalance > 0 ? "text-rose-400" : "text-emerald-400"
                    }`}>
                      {c.outstandingBalance > 0 ? `Due: Rs. ${c.outstandingBalance.toLocaleString()}` : "Clear"}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono flex justify-between">
                    <span>Phone: {c.phone}</span>
                    <span>Advance: Rs. {c.advanceBalance || 0}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Selected Customer Khata Ledger & Transaction History */}
        <div className="lg:col-span-2">
          {selectedCustomer ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-6 shadow-xl">
              {/* Customer Header Bar */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-100">{selectedCustomer.name}</h2>
                  <p className="text-xs text-slate-400 font-mono">
                    Phone: {selectedCustomer.phone} {selectedCustomer.address ? `• ${selectedCustomer.address}` : ""}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setKhataAction("ADD_DEBT");
                      setPaymentAmount(0);
                      setPaymentNotes("");
                      setShowPaymentModal(true);
                    }}
                    className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-600/20 transition flex items-center gap-1.5"
                    title="Customer ne udhar liya (+)"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>+ Udhar Diya</span>
                  </button>

                  <button
                    onClick={() => {
                      setKhataAction("PAYMENT");
                      setPaymentAmount(selectedCustomer.outstandingBalance || 0);
                      setPaymentNotes("");
                      setShowPaymentModal(true);
                    }}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/20 transition flex items-center gap-1.5"
                    title="Customer se payment wasool ki (-)"
                  >
                    <MinusCircle className="w-4 h-4" />
                    <span>- Wasool Kiya</span>
                  </button>
                </div>
              </div>

              {/* Ledger Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Total Lifetime Purchases</span>
                  <p className="font-mono font-bold text-indigo-400 text-sm">
                    Rs. {totalPurchases.toLocaleString()}
                  </p>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase">Total Paid</span>
                  <p className="font-mono font-bold text-emerald-400 text-sm">
                    Rs. {totalPaid.toLocaleString()}
                  </p>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                  <span className="text-[10px] font-bold text-rose-400 uppercase">Outstanding Balance Due</span>
                  <p className="font-mono font-bold text-rose-400 text-sm">
                    Rs. {selectedCustomer.outstandingBalance.toLocaleString()}
                  </p>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                  <span className="text-[10px] font-bold text-purple-400 uppercase">Advance & Rental Deposits</span>
                  <p className="font-mono font-bold text-purple-400 text-sm">
                    Rs. {(selectedCustomer.advanceBalance + activeRentalDepositTotal).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Customer Transaction History & Ledger Tabs */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveHistoryTab("LEDGER")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                        activeHistoryTab === "LEDGER"
                          ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                          : "bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800"
                      }`}
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Khata Ledger Entries ({customerLedger.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveHistoryTab("SALES")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                        activeHistoryTab === "SALES"
                          ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                          : "bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800"
                      }`}
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      <span>POS Sales Invoices ({customerSales.length})</span>
                    </button>
                  </div>
                </div>

                {/* 📒 Khata Ledger Tab Table */}
                {activeHistoryTab === "LEDGER" && (
                  <div className="overflow-x-auto bg-slate-950 border border-slate-800 rounded-xl">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-900 border-b border-slate-800 text-slate-400">
                        <tr>
                          <th className="p-3">Date</th>
                          <th className="p-3">Entry #</th>
                          <th className="p-3">Type / Description</th>
                          <th className="p-3 text-right">Debit (+ Udhar)</th>
                          <th className="p-3 text-right">Credit (- Wasool)</th>
                          <th className="p-3 text-right">Running Due</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {customerLedger.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-6 text-center text-slate-500 font-sans">
                              Koi manual khata entry nahi hai. Upar "+ Udhar Diya" ya "- Wasool Kiya" se entry karein.
                            </td>
                          </tr>
                        ) : (
                          customerLedger.map((entry) => (
                            <tr key={entry._id} className="hover:bg-slate-900/60 transition">
                              <td className="p-3 font-sans text-slate-300">
                                {new Date(entry.createdAt).toLocaleDateString()}
                              </td>
                              <td className="p-3 font-bold text-slate-400 text-[11px]">
                                {entry.entryNumber}
                              </td>
                              <td className="p-3 font-sans">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {entry.type === "DEBT_ADJUSTMENT" ? (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-400 border border-rose-800/50">
                                      + Udhar Added
                                    </span>
                                  ) : entry.type === "PAYMENT" ? (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800/50">
                                      - Wasool Payment
                                    </span>
                                  ) : entry.type === "ADVANCE_DEPOSIT" ? (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-950 text-purple-400 border border-purple-800/50">
                                      Advance Deposit
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300">
                                      {entry.type}
                                    </span>
                                  )}
                                  {entry.notes && (
                                    <span className="text-[11px] text-slate-300">
                                      {entry.notes}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="p-3 text-right font-bold text-rose-400">
                                {entry.debit > 0 ? `Rs. ${entry.debit.toLocaleString()}` : "-"}
                              </td>
                              <td className="p-3 text-right font-bold text-emerald-400">
                                {entry.credit > 0 ? `Rs. ${entry.credit.toLocaleString()}` : "-"}
                              </td>
                              <td className="p-3 text-right font-bold text-slate-200">
                                Rs. {entry.runningOutstanding?.toLocaleString() || 0}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 🛒 POS Sales Tab Table */}
                {activeHistoryTab === "SALES" && (
                <div className="overflow-x-auto bg-slate-950 border border-slate-800 rounded-xl">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-900 border-b border-slate-800 text-slate-400">
                      <tr>
                        <th className="p-3">Sale #</th>
                        <th className="p-3">Date</th>
                        <th className="p-3 text-right">Total Bill</th>
                        <th className="p-3 text-right">Amount Paid</th>
                        <th className="p-3 text-right">Balance Due</th>
                        <th className="p-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {customerSales.map((s) => {
                        const isExpanded = expandedSaleId === s._id;
                        return (
                          <React.Fragment key={s._id}>
                            <tr
                              onClick={() => setExpandedSaleId(isExpanded ? null : s._id)}
                              className="hover:bg-slate-900/80 cursor-pointer transition"
                            >
                              <td className="p-3 font-bold text-indigo-400 flex items-center gap-1.5">
                                {isExpanded ? (
                                  <ChevronUp className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                )}
                                <span>{s.saleNumber}</span>
                              </td>
                              <td className="p-3 font-sans text-slate-300">
                                {new Date(s.createdAt).toLocaleDateString()}
                              </td>
                              <td className="p-3 text-right text-slate-200 font-bold">
                                Rs. {s.totalAmount?.toLocaleString()}
                              </td>
                              <td className="p-3 text-right text-emerald-400">
                                {s.status === "CANCELLED" ? "Rs. 0" : `Rs. ${(s.totalPaid || s.totalAmount)?.toLocaleString()}`}
                              </td>
                              <td className="p-3 text-right font-bold text-rose-400">
                                {s.status === "CANCELLED" ? "Rs. 0" : `Rs. ${(s.balanceDue || 0).toLocaleString()}`}
                              </td>
                              <td className="p-3 text-center font-sans">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  s.status === "CANCELLED"
                                    ? "bg-rose-950/80 text-rose-400 border border-rose-800/60"
                                    : "bg-slate-800 text-slate-300 border border-slate-700"
                                }`}>
                                  {s.status}
                                </span>
                              </td>
                            </tr>

                            {/* Nested Accordion Details Card */}
                            {isExpanded && (
                              <tr className="bg-slate-900/90">
                                <td colSpan={6} className="p-4 space-y-3 border-t border-b border-indigo-500/30">
                                  <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800">
                                    <div className="text-xs">
                                      <span className="text-slate-400">Salesman Attribution: </span>
                                      <span className="font-bold text-indigo-400 font-sans">
                                        {s.salesmanName || "Direct Counter / Self"}
                                      </span>
                                    </div>
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setReassignSale(s);
                                          setTargetSalesmanId(s.salesman?._id || s.salesman || "");
                                          setShowReassignModal(true);
                                        }}
                                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg transition flex items-center gap-1 shadow-sm"
                                      >
                                        ✏️ Edit Salesman
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setPrintReceiptData({
                                            invoiceNumber: s.invoiceNumber || s.saleNumber,
                                            date: s.createdAt,
                                            locationName: s.locationName || "Warehouse",
                                            cashierName:
                                              s.createdByName ||
                                              s.createdBy ||
                                              s.completedBy ||
                                              "Counter Staff",
                                            salesmanName: s.salesmanName,
                                            customerName: s.customerName || selectedCustomer.name,
                                            customerPhone: s.customerPhone || selectedCustomer.phone,
                                            items: s.items?.map((it: any) => ({
                                              productName: it.productName || it.product?.name || "Product",
                                              condition: it.condition || "New",
                                              quantity: it.quantity,
                                              unitPrice: it.unitPrice,
                                              lineTotal: it.lineTotal || (it.unitPrice * it.quantity),
                                              serialNumbers: it.serialNumbers,
                                            })) || [],
                                            subtotal: s.subtotal || s.totalAmount,
                                            discountAmount: s.discountAmount || 0,
                                            deliveryCharges: s.deliveryCharges || 0,
                                            totalAmount: s.totalAmount,
                                            paidAmount: s.totalPaid || s.totalAmount,
                                            changeDue: 0,
                                            payments: s.payments || [{ method: "CASH", amount: s.totalAmount }],
                                          });
                                          setShowReceiptModal(true);
                                        }}
                                        className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-lg transition flex items-center gap-1 border border-slate-700"
                                      >
                                        <Printer className="w-3.5 h-3.5" />
                                        Print Slip
                                      </button>
                                    </div>
                                  </div>

                                  {/* Itemized Purchased Items */}
                                  <div className="space-y-1">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                      Itemized Purchased Items ({s.items?.length || 0}):
                                    </span>
                                    <div className="space-y-1.5">
                                      {s.items?.map((item: any, itemIdx: number) => (
                                        <div
                                          key={itemIdx}
                                          className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between text-xs"
                                        >
                                          <div>
                                            <div className="font-bold text-slate-200 font-sans">
                                              {item.productName || item.product?.name} ({item.condition || "New"})
                                            </div>
                                            <div className="text-[11px] text-slate-400">
                                              {item.quantity} Qty x Rs. {item.unitPrice?.toLocaleString()}
                                            </div>
                                            {item.serialNumbers && item.serialNumbers.length > 0 && (
                                              <div className="text-[10px] text-cyan-400 font-mono font-bold mt-1 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40 inline-block">
                                                S/N: {item.serialNumbers.join(", ")}
                                              </div>
                                            )}
                                          </div>
                                          <span className="font-bold text-emerald-400 font-mono text-sm">
                                            Rs. {(item.lineTotal || item.unitPrice * item.quantity)?.toLocaleString()}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500 text-xs">
              Select a customer from the left directory to view ledger details.
            </div>
          )}
        </div>
      </div>

      {/* Khata Entry (+ / -) Modal */}
      {showPaymentModal && selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  {khataAction === "ADD_DEBT" ? (
                    <PlusCircle className="w-4 h-4 text-rose-400" />
                  ) : (
                    <MinusCircle className="w-4 h-4 text-emerald-400" />
                  )}
                  <span>
                    Khata Entry: {khataAction === "ADD_DEBT" ? "+ Udhar Diya" : "- Wasool Kiya"}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400 font-sans">
                  Customer: <span className="text-slate-200 font-bold">{selectedCustomer.name}</span> ({selectedCustomer.phone})
                </p>
              </div>
              <button onClick={() => setShowPaymentModal(false)} className="text-slate-400 hover:text-slate-200">
                ✖
              </button>
            </div>

            {/* Segmented Toggle: - Wasool Kiya vs + Udhar Diya */}
            <div className="grid grid-cols-2 p-1 bg-slate-950 border border-slate-800 rounded-xl gap-1">
              <button
                type="button"
                onClick={() => setKhataAction("PAYMENT")}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  khataAction === "PAYMENT"
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <MinusCircle className="w-3.5 h-3.5" />
                <span>- Wasool Kiya (Payment)</span>
              </button>
              <button
                type="button"
                onClick={() => setKhataAction("ADD_DEBT")}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  khataAction === "ADD_DEBT"
                    ? "bg-rose-600 text-white shadow-md shadow-rose-600/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>+ Udhar Diya (Add Debt)</span>
              </button>
            </div>

            <form onSubmit={handleLedgerPayment} className="space-y-4 text-xs">
              {/* Balance Summary & Projection */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-semibold">Current Balance Due:</span>
                  <span className="font-mono text-base font-extrabold text-slate-200">
                    Rs. {selectedCustomer.outstandingBalance.toLocaleString()}
                  </span>
                </div>
                {selectedCustomer.advanceBalance > 0 && (
                  <div className="flex justify-between items-center text-[11px] text-purple-400">
                    <span>Customer Advance Deposit:</span>
                    <span className="font-mono font-bold">
                      Rs. {selectedCustomer.advanceBalance.toLocaleString()}
                    </span>
                  </div>
                )}
                {paymentAmount > 0 && (
                  <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-800/80">
                    <span className="text-slate-400 font-semibold">
                      {khataAction === "ADD_DEBT" ? "Projected New Due (+):" : "Projected Remaining Due (-):"}
                    </span>
                    <span
                      className={`font-mono font-bold ${
                        khataAction === "ADD_DEBT" ? "text-rose-400" : "text-emerald-400"
                      }`}
                    >
                      Rs.{" "}
                      {khataAction === "ADD_DEBT"
                        ? (selectedCustomer.outstandingBalance + Number(paymentAmount)).toLocaleString()
                        : Math.max(0, selectedCustomer.outstandingBalance - Number(paymentAmount)).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              {/* Amount Input */}
              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">
                  {khataAction === "ADD_DEBT" ? "Udhar Amount (PKR) / رقم:" : "Payment Received (PKR) / وصول رقم:"}
                </label>
                <input
                  type="number"
                  min="1"
                  value={paymentAmount || ""}
                  onChange={(e) => setPaymentAmount(Number(e.target.value))}
                  placeholder="0"
                  className={`w-full bg-slate-950 border text-base font-mono font-bold rounded-xl px-3 py-2 ${
                    khataAction === "ADD_DEBT"
                      ? "border-rose-500/40 text-rose-400 focus:border-rose-500"
                      : "border-emerald-500/40 text-emerald-400 focus:border-emerald-500"
                  }`}
                  required
                />
              </div>

              {/* Payment Method (Only for Wasool Kiya / Payment) */}
              {khataAction === "PAYMENT" && (
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Payment Method:</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl px-3 py-2"
                  >
                    <option value="CASH">Cash 💵</option>
                    <option value="CARD">Credit/Debit Card 💳</option>
                    <option value="BANK_TRANSFER">Bank Transfer / Raast 🏦</option>
                  </select>
                </div>
              )}

              {/* Notes / Reference */}
              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">
                  {khataAction === "ADD_DEBT" ? "Reason / Notes (تفصیل):" : "Payment Reference / Notes:"}
                </label>
                <input
                  type="text"
                  placeholder={
                    khataAction === "ADD_DEBT"
                      ? "e.g. Samaan udhar liya / Purana hisab add kiya"
                      : "e.g. Received via Cash / Raast Ref #1234"
                  }
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-3 py-2"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 font-semibold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || paymentAmount <= 0}
                  className={`flex-1 py-2.5 rounded-xl text-white font-bold text-xs shadow-lg transition flex items-center justify-center gap-2 ${
                    khataAction === "ADD_DEBT"
                      ? "bg-rose-600 hover:bg-rose-500 shadow-rose-600/20"
                      : "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20"
                  }`}
                >
                  {loading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : khataAction === "ADD_DEBT" ? (
                    `+ Record Rs. ${paymentAmount ? paymentAmount.toLocaleString() : "0"} Udhar`
                  ) : (
                    `- Record Rs. ${paymentAmount ? paymentAmount.toLocaleString() : "0"} Payment`
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Customer Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-400" />
                Register New Customer
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-200">
                ✖
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Customer Name:</label>
                <input
                  type="text"
                  placeholder="e.g. Usman Ali"
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-3 py-2"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Phone Number:</label>
                <input
                  type="text"
                  placeholder="0300-1234567"
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 font-mono rounded-xl px-3 py-2"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Address (Optional):</label>
                <input
                  type="text"
                  placeholder="e.g. F-7, Islamabad"
                  value={newCustAddress}
                  onChange={(e) => setNewCustAddress(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-3 py-2"
                />
              </div>

              {/* Opening Balance Field (Optional) */}
              <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800 space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Opening Balance / ابتدائی کھاتہ</span>
                  </label>
                  <span className="text-[10px] text-slate-500">(Optional)</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-400">Raqam (PKR):</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={newCustOpeningBal}
                      onChange={(e) => setNewCustOpeningBal(e.target.value === "" ? "" : Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-800 text-slate-100 font-mono font-bold rounded-lg px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-400">Balance Type:</span>
                    <select
                      value={newCustBalType}
                      onChange={(e) => setNewCustBalType(e.target.value as any)}
                      className="w-full bg-slate-900 border border-slate-800 text-slate-200 rounded-lg px-2 py-1.5 text-xs"
                    >
                      <option value="DUE">Baqaya / Udhar (+ Due)</option>
                      <option value="ADVANCE">Advance Jama (- Deposit)</option>
                    </select>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500">
                  Agar customer pehle se udhar par chal raha hai toh yahan initial balance darj karein. Agar koi hisab nahi hai to 0 chhor dein.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 font-semibold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/20 transition flex items-center justify-center gap-2"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Save Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Re-assign Salesman Modal */}
      {showReassignModal && reassignSale && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-indigo-400" />
                Edit Salesman for Order #{reassignSale.saleNumber}
              </h3>
            </div>
            <p className="text-xs text-slate-400">
              Re-attribute this sale to credit the salesman's sales & profit report:
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Select Salesman Attribution:
              </label>
              <select
                value={targetSalesmanId}
                onChange={(e) => setTargetSalesmanId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-semibold"
              >
                <option value="">Direct Counter / Self</option>
                {salesmen.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name} (@{s.username})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setShowReassignModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReassignSalesman}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition"
              >
                Save Attribution
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Thermal Receipt Modal */}
      {showReceiptModal && printReceiptData && (
        <ThermalReceiptModal
          receiptData={printReceiptData}
          onClose={() => setShowReceiptModal(false)}
        />
      )}
    </div>
  );
}
