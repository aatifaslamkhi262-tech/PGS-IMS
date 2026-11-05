"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  CalendarCheck,
  Users,
  CreditCard,
  CalendarDays,
  ShieldAlert,
  ScanLine,
  Banknote,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/hr", label: "Overview", icon: LayoutGrid, exact: true },
  { href: "/hr/attendance", label: "Daily Attendance", icon: CalendarCheck },
  { href: "/hr/leaves", label: "Leaves", icon: CalendarDays },
  { href: "/hr/payroll", label: "Monthly Payroll", icon: Banknote },
  { href: "/hr/employees", label: "Staff & Duty Rules", icon: Users },
  { href: "/hr/cards", label: "Employee Cards", icon: CreditCard },
  { href: "/hr/audit-logs", label: "Audit Log", icon: ShieldAlert },
];

export const HRSubNav: React.FC = () => {
  const pathname = usePathname();

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 mb-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-slate-100 tracking-tight">
              HR & Staff Management
            </h1>
            <span className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800 rounded">
              Phase 1 & 2 · Active
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Gate attendance, custom duty hours, 3-Late penalty rule, Tareeqa A compensation, and monthly payroll lock
          </p>
        </div>

        <Link
          href="/guard/kiosk"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-xs font-semibold shrink-0"
        >
          <ScanLine className="w-3.5 h-3.5" />
          <span>Open Gate Kiosk</span>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-slate-800">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold border transition-colors ${
                active
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800 hover:text-slate-100"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

