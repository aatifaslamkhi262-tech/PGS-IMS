"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { HRSubNav } from "@/components/HRSubNav";
import {
  Users,
  UserCheck,
  Clock,
  AlertTriangle,
  CreditCard,
  CalendarDays,
  ShieldAlert,
  ScanLine,
  ArrowRight,
} from "lucide-react";

export default function HROverviewPage() {
  const [loading, setLoading] = useState(true);
  const [attendanceData, setAttendanceData] = useState<any>(null);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);

  useEffect(() => {
    const loadOverview = async () => {
      try {
        setLoading(true);
        const [attRes, logRes] = await Promise.all([
          fetch("/api/hr/attendance"),
          fetch("/api/hr/audit-logs?limit=8"),
        ]);
        const attJson = await attRes.json();
        const logJson = await logRes.json();
        if (attJson.success) setAttendanceData(attJson.data);
        if (logJson.success) setRecentLogs(logJson.data || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    loadOverview();
  }, []);

  const rows: any[] = attendanceData?.rows || [];
  const unresolvedAlerts: any[] = attendanceData?.unresolvedAlerts || [];

  const totalActive = rows.length;
  const presentCount = rows.filter((r) =>
    ["PRESENT", "LATE", "HALF_DAY", "SHORT_HOURS", "PRESENT_ON_OFF_DAY"].includes(
      r.effectiveStatus
    )
  ).length;
  const lateCount = rows.filter(
    (r) => r.attendance?.lateMinutes > 0 || r.effectiveStatus === "LATE"
  ).length;
  const offOrHolidayCount = rows.filter((r) =>
    ["WEEKLY_OFF", "PAID_OFF", "HOLIDAY"].includes(r.effectiveStatus)
  ).length;
  const absentCount = rows.filter((r) => r.effectiveStatus === "ABSENT").length;

  return (
    <div className="space-y-6">
      <HRSubNav />

      {/* Top KPI Summary Cards - Flat, Crisp Borders, High Contrast */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Active Staff</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-bold text-slate-100 mt-1.5">
            {loading ? "—" : totalActive}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            Registered employees
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Present Today</span>
            <UserCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-emerald-400 mt-1.5">
            {loading ? "—" : presentCount}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            Clocked in at gate
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Late Arrivals</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-amber-400 mt-1.5">
            {loading ? "—" : lateCount}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            Past 15m grace window
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Absent / Not In</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-2xl font-bold text-rose-400 mt-1.5">
            {loading ? "—" : absentCount}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            Off/Holiday today: {offOrHolidayCount}
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 col-span-2 md:col-span-1">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Needs HR Action</span>
            <ShieldAlert className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-slate-100 mt-1.5">
            {loading ? "—" : unresolvedAlerts.length}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            Missed checkouts / claims
          </p>
        </div>
      </div>

      {/* Unresolved Alerts Banner if any */}
      {unresolvedAlerts.length > 0 && (
        <div className="bg-slate-900 border border-amber-700/70 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-amber-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              <span>
                {unresolvedAlerts.length} Attendance Item(s) Require HR Verification
              </span>
            </h2>
            <p className="text-xs text-slate-300 mt-1">
              Includes unclosed gate check-outs (MISSING_CHECKOUT) or early arrival claims when the gate PC was off.
            </p>
          </div>
          <Link
            href="/hr/attendance?tab=ATTENTION"
            className="px-3.5 py-2 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shrink-0 inline-flex items-center gap-1.5"
          >
            <span>Review & Resolve</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* Main Grid: Quick Actions & Recent Audit Trail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Phase 1 Core Modules */}
        <div className="lg:col-span-1 space-y-3">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
            <h2 className="text-sm font-bold text-slate-100 mb-3">
              Phase 1 Operations
            </h2>
            <div className="space-y-2">
              <Link
                href="/guard/kiosk"
                className="flex items-center justify-between p-3 rounded border border-slate-800 bg-slate-950 hover:bg-slate-800 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <ScanLine className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-slate-100">
                      Gate Attendance Kiosk
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Card scanner, PIN backup & break punches
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              </Link>

              <Link
                href="/hr/attendance"
                className="flex items-center justify-between p-3 rounded border border-slate-800 bg-slate-950 hover:bg-slate-800 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4 text-blue-400 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-slate-100">
                      Daily Attendance Sheet
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Worked vs target hours & manual fixes
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              </Link>

              <Link
                href="/hr/employees"
                className="flex items-center justify-between p-3 rounded border border-slate-800 bg-slate-950 hover:bg-slate-800 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Users className="w-4 h-4 text-indigo-400 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-slate-100">
                      Staff Profiles & Custom Schedules
                    </p>
                    <p className="text-[11px] text-slate-400">
                      3h–12h daily duty & weekly/monthly off quotas
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              </Link>

              <Link
                href="/hr/cards"
                className="flex items-center justify-between p-3 rounded border border-slate-800 bg-slate-950 hover:bg-slate-800 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <CreditCard className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-slate-100">
                      Employee Cards Lifecycle
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Issue, block lost cards, replace & print preview
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              </Link>
            </div>
          </div>
        </div>

        {/* Right: Recent Audit Log Table */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-100">
                Recent HR & Security Audit Log
              </h2>
              <p className="text-xs text-slate-400">
                Append-only hash-chained record of card actions and manual attendance corrections
              </p>
            </div>
            <Link
              href="/hr/audit-logs"
              className="text-xs font-semibold text-blue-400 hover:underline"
            >
              View All →
            </Link>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-slate-400">
              Loading audit records...
            </div>
          ) : recentLogs.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No HR audit actions logged yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Time</th>
                    <th className="py-2.5 px-3">Action</th>
                    <th className="py-2.5 px-3">Target</th>
                    <th className="py-2.5 px-3">Reason</th>
                    <th className="py-2.5 px-3">By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {recentLogs.map((log) => (
                    <tr key={log._id} className="hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-400 font-mono text-[11px]">
                        {new Date(log.createdAt).toLocaleString("en-PK", {
                          month: "short",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-100">
                        <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] font-mono">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-200">
                        {log.targetLabel}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">
                        {log.reason}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 font-mono">
                        {log.performedByName}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

