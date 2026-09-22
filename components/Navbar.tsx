"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Package,
  LogOut,
  Truck,
  FileText,
  Layers,
  CheckSquare,
  Tag,
  ShoppingBag,
  ShoppingCart,
  Clock,
  Wallet,
  Calendar,
  ArrowRightLeft,
  Globe,
  ChevronDown,
  LayoutDashboard,
  BarChart3,
  Users,
  Handshake,
} from "lucide-react";

interface NavbarProps {
  onTriggerSeed?: () => void;
}

export const Navbar: React.FC<NavbarProps> = () => {
  const pathname = usePathname();
  const [user, setUser] = useState<{ username: string; role: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // Fetch session on mount
  useEffect(() => {
    const fetchSession = async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        if (data.success) {
          setUser(data.data);
        } else {
          setUser(null);
        }
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    fetchSession();
  }, [pathname]);

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        window.location.href = "/login";
      }
    } catch {
      alert("Logout failed. Please try again.");
    }
  };

  const isAdmin = user?.role === "Admin";
  const isWarehouse = user?.role === "Warehouse";
  const isAccountant = user?.role === "Accountant";

  if (pathname === "/login") {
    return (
      <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <span className="font-bold text-lg text-slate-100 tracking-tight">
                PGS <span className="text-indigo-400">IMS</span>
              </span>
            </div>
          </div>
        </div>
      </header>
    );
  }

  // Active checks for categories
  const isSalesActive =
    pathname === "/pos" ||
    pathname === "/warehouse-queue" ||
    pathname.startsWith("/sales/");

  const isInventoryActive =
    pathname === "/" ||
    pathname === "/price-lookup" ||
    pathname.startsWith("/inventory") ||
    pathname.startsWith("/transfers");

  const isPurchasesActive =
    pathname.startsWith("/purchase-invoices") ||
    pathname.startsWith("/suppliers") ||
    pathname.startsWith("/approvals");

  const isReportsActive = pathname.startsWith("/reports");

  return (
    <>
      {/* Top Header Navbar */}
      <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            
            {/* Logo */}
            <Link
              href={user && (isAdmin || isWarehouse) ? "/" : "/price-lookup"}
              className="flex items-center gap-2.5 shrink-0"
            >
              <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold shadow-md shadow-indigo-600/20">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base text-slate-100 tracking-tight">
                  PGS <span className="text-indigo-400">IMS</span>
                </span>
                {user && (
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-800 text-indigo-400 border border-slate-700/80 rounded-md uppercase">
                    {user.role}
                  </span>
                )}
              </div>
            </Link>

            {/* Clean Dropdown Navigation Bar */}
            {user && (
              <nav className="hidden lg:flex items-center gap-2">

                {/* Dashboard Direct Link */}
                {(isAdmin || isWarehouse) && (
                  <Link
                    href="/"
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      pathname === "/"
                        ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                        : "text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                    }`}
                  >
                    <LayoutDashboard className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Dashboard</span>
                  </Link>
                )}

                {/* Sales Dropdown */}
                <div
                  className="relative group"
                  onMouseEnter={() => setActiveDropdown("sales")}
                  onMouseLeave={() => setActiveDropdown(null)}
                >
                  <button
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      isSalesActive
                        ? "bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 font-bold"
                        : "text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                    }`}
                  >
                    <ShoppingCart className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Sales</span>
                    <ChevronDown className="w-3 h-3 text-slate-400 group-hover:rotate-180 transition-transform" />
                  </button>

                  <div className="absolute top-full left-0 hidden group-hover:block w-52 pt-1 z-50">
                    <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-1.5 space-y-0.5 backdrop-blur-md">
                      <Link
                        href="/sales?mode=POS"
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-200 hover:bg-slate-800 hover:text-emerald-400 font-bold transition"
                      >
                        <ShoppingCart className="w-4 h-4 text-emerald-400" />
                        <span>New POS Terminal</span>
                      </Link>

                      {(isAdmin || isWarehouse) && (
                        <Link
                          href="/sales?mode=QUEUE"
                          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-200 hover:bg-slate-800 hover:text-amber-400 transition"
                        >
                          <Clock className="w-4 h-4 text-amber-400" />
                          <span>Warehouse Queue</span>
                        </Link>
                      )}

                      <Link
                        href="/sales?mode=ADVANCE"
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-200 hover:bg-slate-800 hover:text-purple-400 transition"
                      >
                        <Calendar className="w-4 h-4 text-purple-400" />
                        <span>Advance Bookings</span>
                      </Link>

                      <Link
                        href="/sales?mode=RETURNS"
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-200 hover:bg-slate-800 hover:text-blue-400 transition"
                      >
                        <ArrowRightLeft className="w-4 h-4 text-blue-400" />
                        <span>Returns & Swaps</span>
                      </Link>

                      <Link
                        href="/sales?mode=TRADEIN"
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-200 hover:bg-slate-800 hover:text-emerald-400 transition"
                      >
                        <Handshake className="w-4 h-4 text-emerald-400" />
                        <span>Direct Trade-In</span>
                      </Link>

                      <Link
                        href="/sales?mode=ONLINE"
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-200 hover:bg-slate-800 hover:text-cyan-400 transition"
                      >
                        <Globe className="w-4 h-4 text-cyan-400" />
                        <span>Online Orders</span>
                      </Link>

                      <Link
                        href="/customers"
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-200 hover:bg-slate-800 hover:text-indigo-400 transition"
                      >
                        <Users className="w-4 h-4 text-indigo-400" />
                        <span>Customers & Ledger</span>
                      </Link>
                    </div>
                  </div>
                </div>

                {/* Inventory Dropdown */}
                <div
                  className="relative group"
                  onMouseEnter={() => setActiveDropdown("inventory")}
                  onMouseLeave={() => setActiveDropdown(null)}
                >
                  <button
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      isInventoryActive && pathname !== "/"
                        ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                        : "text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Inventory</span>
                    <ChevronDown className="w-3 h-3 text-slate-400 group-hover:rotate-180 transition-transform" />
                  </button>

                  <div className="absolute top-full left-0 hidden group-hover:block w-48 pt-1 z-50">
                    <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-1.5 space-y-0.5 backdrop-blur-md">
                      <Link
                        href="/inventory"
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-200 hover:bg-slate-800 hover:text-indigo-400 transition"
                      >
                        <Layers className="w-4 h-4 text-indigo-400" />
                        <span>Stock Inventory</span>
                      </Link>

                      <Link
                        href="/transfers"
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-200 hover:bg-slate-800 hover:text-indigo-400 transition"
                      >
                        <Truck className="w-4 h-4 text-indigo-400" />
                        <span>Stock Transfers</span>
                      </Link>

                      <Link
                        href="/price-lookup"
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-200 hover:bg-slate-800 hover:text-indigo-400 transition"
                      >
                        <Tag className="w-4 h-4 text-indigo-400" />
                        <span>Price Lookup</span>
                      </Link>
                    </div>
                  </div>
                </div>

                {/* Purchases Dropdown */}
                {(isAdmin || isWarehouse || isAccountant) && (
                  <div
                    className="relative group"
                    onMouseEnter={() => setActiveDropdown("purchases")}
                    onMouseLeave={() => setActiveDropdown(null)}
                  >
                    <button
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        isPurchasesActive
                          ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                          : "text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Purchases</span>
                      <ChevronDown className="w-3 h-3 text-slate-400 group-hover:rotate-180 transition-transform" />
                    </button>

                    <div className="absolute top-full left-0 hidden group-hover:block w-48 pt-1 z-50">
                      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-1.5 space-y-0.5 backdrop-blur-md">
                        <Link
                          href="/purchase-invoices"
                          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-200 hover:bg-slate-800 hover:text-indigo-400 transition"
                        >
                          <FileText className="w-4 h-4 text-indigo-400" />
                          <span>Purchase Invoices</span>
                        </Link>

                        <Link
                          href="/suppliers"
                          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-200 hover:bg-slate-800 hover:text-indigo-400 transition"
                        >
                          <Truck className="w-4 h-4 text-indigo-400" />
                          <span>Suppliers</span>
                        </Link>

                        {(isAdmin || isAccountant) && (
                          <Link
                            href="/approvals"
                            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-200 hover:bg-slate-800 hover:text-indigo-400 transition"
                          >
                            <CheckSquare className="w-4 h-4 text-indigo-400" />
                            <span>Approvals</span>
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Reports Dropdown */}
                {(isAdmin || isWarehouse || isAccountant) && (
                  <div
                    className="relative group"
                    onMouseEnter={() => setActiveDropdown("reports")}
                    onMouseLeave={() => setActiveDropdown(null)}
                  >
                    <button
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        isReportsActive
                          ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                          : "text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                      }`}
                    >
                      <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Reports</span>
                      <ChevronDown className="w-3 h-3 text-slate-400 group-hover:rotate-180 transition-transform" />
                    </button>

                    <div className="absolute top-full left-0 hidden group-hover:block w-52 pt-1 z-50">
                      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-1.5 space-y-0.5 backdrop-blur-md">
                        <Link
                          href="/reports/daily-closing"
                          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-200 hover:bg-slate-800 hover:text-emerald-400 transition"
                        >
                          <FileText className="w-4 h-4 text-emerald-400" />
                          <span>Daily Closing Report</span>
                        </Link>

                        <Link
                          href="/cash-sessions"
                          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-200 hover:bg-slate-800 hover:text-indigo-400 transition"
                        >
                          <Wallet className="w-4 h-4 text-indigo-400" />
                          <span>Cash Register Shift</span>
                        </Link>

                        <Link
                          href="/reports/stock-out"
                          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-200 hover:bg-slate-800 hover:text-amber-400 transition"
                        >
                          <BarChart3 className="w-4 h-4 text-amber-400" />
                          <span>Stock-Out Report</span>
                        </Link>
                      </div>
                    </div>
                  </div>
                )}
              </nav>
            )}

            {/* User Info & Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {user ? (
                <div className="flex items-center gap-3">
                  <div className="hidden lg:block text-right">
                    <p className="text-xs font-bold text-slate-200">{user.username}</p>
                    <p className="text-[10px] text-indigo-400 font-semibold uppercase">{user.role}</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    title="Logout"
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-rose-400 transition-colors border border-slate-700"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                !loading && (
                  <Link
                    href="/login"
                    className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors"
                  >
                    Log In
                  </Link>
                )
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile & Tablet Bottom Navigation Bar */}
      {user && (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-900 border-t border-slate-800 flex justify-around items-center h-14 px-1 shadow-lg">
          <Link
            href="/pos"
            className={`flex flex-col items-center justify-center w-full h-full text-[10px] font-bold transition-colors ${
              pathname === "/pos" ? "text-emerald-400" : "text-emerald-500/80 hover:text-emerald-300"
            }`}
          >
            <ShoppingCart className="w-4 h-4 mb-0.5" />
            <span>POS</span>
          </Link>

          {(isAdmin || isWarehouse) && (
            <Link
              href="/warehouse-queue"
              className={`flex flex-col items-center justify-center w-full h-full text-[10px] font-semibold transition-colors ${
                pathname === "/warehouse-queue" ? "text-amber-400" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Clock className="w-4 h-4 mb-0.5" />
              <span>Queue</span>
            </Link>
          )}

          <Link
            href="/inventory"
            className={`flex flex-col items-center justify-center w-full h-full text-[10px] font-semibold transition-colors ${
              pathname.startsWith("/inventory") ? "text-indigo-400" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="w-4 h-4 mb-0.5" />
            <span>Inventory</span>
          </Link>

          <Link
            href="/transfers"
            className={`flex flex-col items-center justify-center w-full h-full text-[10px] font-semibold transition-colors ${
              pathname.startsWith("/transfers") ? "text-indigo-400" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Truck className="w-4 h-4 mb-0.5" />
            <span>Transfers</span>
          </Link>

          {(isAdmin || isWarehouse || isAccountant) && (
            <Link
              href="/reports/daily-closing"
              className={`flex flex-col items-center justify-center w-full h-full text-[10px] font-semibold transition-colors ${
                pathname.startsWith("/reports/daily-closing") ? "text-emerald-400" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <FileText className="w-4 h-4 mb-0.5" />
              <span>Closing</span>
            </Link>
          )}
        </nav>
      )}
    </>
  );
};
