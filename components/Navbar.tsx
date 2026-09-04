"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Package,
  Plus,
  Database,
  ShoppingBag,
  LogOut,
  User as UserIcon,
  Truck,
  FileText,
  Layers,
  CheckSquare,
  Tag,
  ScanBarcode,
} from "lucide-react";

interface NavbarProps {
  onTriggerSeed?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onTriggerSeed }) => {
  const pathname = usePathname();
  const [seeding, setSeeding] = useState(false);
  const [user, setUser] = useState<{ username: string; role: string } | null>(null);
  const [loading, setLoading] = useState(true);

  // 1. Fetch authenticated session on mount
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
  }, [pathname]); // Refresh active state on route changes

  const handleSeedClick = async () => {
    if (seeding) return;
    setSeeding(true);
    try {
      if (onTriggerSeed) {
        await onTriggerSeed();
      } else {
        const res = await fetch("/api/seed?dev=true", { method: "POST" });
        const data = await res.json();
        if (data.success) {
          alert("Development seed and user test accounts generated successfully!");
          window.location.reload();
        } else {
          alert("Seed error: " + data.error);
        }
      }
    } catch (seedError: any) {
      alert("Seed error: " + seedError.message);
    } finally {
      setSeeding(false);
    }
  };

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
  const canMutateProducts = isAdmin || isWarehouse;

  // Don't render full nav actions on the login page itself
  if (pathname === "/login") {
    return (
      <header className="sticky top-0 z-40 bg-slate-900/95 border-b border-slate-800 backdrop-blur-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white shadow-md">
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
    <header className="sticky top-0 z-40 bg-slate-900/95 border-b border-slate-800 backdrop-blur-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          {/* Logo & App Name */}
          <Link href={user && (isAdmin || isWarehouse) ? "/" : "/price-lookup"} className="flex items-center gap-2.5 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white shadow-md shadow-indigo-900/40">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div className="hidden sm:block">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-base text-slate-100 tracking-tight">
                  PGS <span className="text-indigo-400">IMS</span>
                </span>
                {user && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-sm">
                    {user.role.toUpperCase()}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400 font-medium">Inventory & POS Core</p>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="flex items-center gap-1.5 sm:gap-2">
            {/* Products (Admin and Warehouse only) */}
            {user && (isAdmin || isWarehouse) && (
              <Link
                href="/"
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  pathname === "/" ? "bg-slate-800 text-indigo-400 border border-indigo-500/20" : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                <span>Products</span>
              </Link>
            )}

            {/* Price Lookup (All authenticated roles) */}
            {user && (
              <Link
                href="/price-lookup"
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  pathname === "/price-lookup" ? "bg-slate-800 text-indigo-400 border border-indigo-500/20" : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                <Tag className="w-3.5 h-3.5" />
                <span>Price Lookup</span>
              </Link>
            )}


            {/* Suppliers (Admin, Warehouse, Accountant) */}
            {user && (isAdmin || isWarehouse || isAccountant) && (
              <Link
                href="/suppliers"
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  pathname.startsWith("/suppliers") ? "bg-slate-800 text-indigo-400 border border-indigo-500/20" : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                <Truck className="w-3.5 h-3.5" />
                <span>Suppliers</span>
              </Link>
            )}

            {/* Invoices (Admin, Warehouse, Accountant) */}
            {user && (isAdmin || isWarehouse || isAccountant) && (
              <Link
                href="/purchase-invoices"
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  pathname.startsWith("/purchase-invoices") ? "bg-slate-800 text-indigo-400 border border-indigo-500/20" : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Purchases</span>
              </Link>
            )}

            {/* Approvals (Admin, Accountant) */}
            {user && (isAdmin || isAccountant) && (
              <Link
                href="/approvals"
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  pathname.startsWith("/approvals") ? "bg-slate-800 text-indigo-400 border border-indigo-500/20" : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Approvals</span>
              </Link>
            )}

            {/* Inventory (All roles) */}
            {user && (
              <Link
                href="/inventory"
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  pathname.startsWith("/inventory") ? "bg-slate-800 text-indigo-400 border border-indigo-500/20" : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Inventory</span>
              </Link>
            )}
          </nav>

          {/* Action / Profile Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Profile & Logout */}
            {user ? (
              <div className="flex items-center gap-2 border-l border-slate-800 pl-2 sm:pl-3">
                <div className="hidden xl:block text-right">
                  <p className="text-xs font-bold text-slate-200">{user.username}</p>
                  <p className="text-[9px] text-indigo-400 font-semibold uppercase">{user.role}</p>
                </div>
                <button
                  onClick={handleLogout}
                  title="Logout"
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-rose-400 transition-colors border border-slate-700/60"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              !loading && (
                <Link
                  href="/login"
                  className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors"
                >
                  Log In
                </Link>
              )
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
