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
} from "lucide-react";

interface NavbarProps {
  onTriggerSeed?: () => void;
}

export const Navbar: React.FC<NavbarProps> = () => {
  const pathname = usePathname();
  const [user, setUser] = useState<{ username: string; role: string } | null>(null);
  const [loading, setLoading] = useState(true);

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

  // Helper checks for RBAC
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

  return (
    <>
      {/* Top Header Navbar */}
      <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-3">
            {/* Logo & App Name */}
            <Link
              href={user && (isAdmin || isWarehouse) ? "/" : "/price-lookup"}
              className="flex items-center gap-2.5 shrink-0"
            >
              <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-base text-slate-100 tracking-tight">
                    PGS <span className="text-indigo-400">IMS</span>
                  </span>
                  {user && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold bg-slate-800 text-indigo-400 border border-slate-700 rounded-sm uppercase">
                      {user.role}
                    </span>
                  )}
                </div>
                <p className="hidden sm:block text-[10px] text-slate-400 font-medium">
                  Inventory & POS Core
                </p>
              </div>
            </Link>

            {/* Desktop Navigation Links */}
            <nav className="hidden lg:flex items-center gap-1.5">
              {user && (isAdmin || isWarehouse) && (
                <Link
                  href="/"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    pathname === "/"
                      ? "bg-slate-800 text-indigo-400 border border-slate-700"
                      : "text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  <Package className="w-3.5 h-3.5" />
                  <span>Products</span>
                </Link>
              )}

              {user && (
                <Link
                  href="/price-lookup"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    pathname === "/price-lookup"
                      ? "bg-slate-800 text-indigo-400 border border-slate-700"
                      : "text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  <Tag className="w-3.5 h-3.5" />
                  <span>Price Lookup</span>
                </Link>
              )}

              {user && (isAdmin || isWarehouse || isAccountant) && (
                <Link
                  href="/suppliers"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    pathname.startsWith("/suppliers")
                      ? "bg-slate-800 text-indigo-400 border border-slate-700"
                      : "text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>Suppliers</span>
                </Link>
              )}

              {user && (isAdmin || isWarehouse || isAccountant) && (
                <Link
                  href="/purchase-invoices"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    pathname.startsWith("/purchase-invoices")
                      ? "bg-slate-800 text-indigo-400 border border-slate-700"
                      : "text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Purchases</span>
                </Link>
              )}

              {user && (isAdmin || isAccountant) && (
                <Link
                  href="/approvals"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    pathname.startsWith("/approvals")
                      ? "bg-slate-800 text-indigo-400 border border-slate-700"
                      : "text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>Approvals</span>
                </Link>
              )}

              {user && (
                <Link
                  href="/inventory"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    pathname.startsWith("/inventory")
                      ? "bg-slate-800 text-indigo-400 border border-slate-700"
                      : "text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Inventory</span>
                </Link>
              )}

              {user && (
                <Link
                  href="/transfers"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    pathname.startsWith("/transfers")
                      ? "bg-slate-800 text-indigo-400 border border-slate-700"
                      : "text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>Transfers</span>
                </Link>
              )}
            </nav>

            {/* User Info & Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {user ? (
                <div className="flex items-center gap-2">
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
          {isAdmin || isWarehouse ? (
            <Link
              href="/"
              className={`flex flex-col items-center justify-center w-full h-full text-[10px] font-semibold transition-colors ${
                pathname === "/" ? "text-indigo-400" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Package className="w-4 h-4 mb-0.5" />
              <span>Products</span>
            </Link>
          ) : null}

          <Link
            href="/price-lookup"
            className={`flex flex-col items-center justify-center w-full h-full text-[10px] font-semibold transition-colors ${
              pathname === "/price-lookup" ? "text-indigo-400" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Tag className="w-4 h-4 mb-0.5" />
            <span>Lookup</span>
          </Link>

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
              href="/purchase-invoices"
              className={`flex flex-col items-center justify-center w-full h-full text-[10px] font-semibold transition-colors ${
                pathname.startsWith("/purchase-invoices") ? "text-indigo-400" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <FileText className="w-4 h-4 mb-0.5" />
              <span>Purchases</span>
            </Link>
          )}
        </nav>
      )}
    </>
  );
};
