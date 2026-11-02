"use client";

import React, { useEffect, useState } from "react";
import { HRSubNav } from "@/components/HRSubNav";
import { ShieldCheck, ShieldAlert, Search } from "lucide-react";

export default function HRAuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [chainValid, setChainValid] = useState(true);
  const [totalChecked, setTotalChecked] = useState(0);
  const [moduleFilter, setModuleFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (moduleFilter) params.set("module", moduleFilter);
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/hr/audit-logs?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setLogs(json.data || []);
        setChainValid(json.chainValid !== false);
        setTotalChecked(json.totalChecked || 0);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [moduleFilter]);

  return (
    <div className="space-y-5">
      <HRSubNav />

      {/* Hash-Chain Integrity Status Bar */}
      <div
        className={`rounded-lg p-3.5 border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${
          chainValid
            ? "bg-emerald-950/60 border-emerald-800 text-emerald-200"
            : "bg-rose-950 border-rose-800 text-rose-200"
        }`}
      >
        <div className="flex items-center gap-2 font-semibold">
          {chainValid ? (
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>
            {chainValid
              ? `Append-Only SHA-256 Hash Chain Verified (${totalChecked} sequential entries checked — No tampering detected)`
              : "WARNING: Audit log hash chain mismatch detected!"}
          </span>
        </div>
        <span className="font-mono text-[11px] opacity-80">
          Immutable Policy: Edit & Delete Disabled
        </span>
      </div>

      {/* Filters */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchLogs();
          }}
          className="flex flex-wrap items-center gap-2 flex-1"
        >
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by employee, card UID, reason or user..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded pl-8 pr-3 py-1.5 text-xs text-slate-100"
            />
          </div>

          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-200"
          >
            <option value="">All HR Modules</option>
            <option value="HR_ATTENDANCE">HR_ATTENDANCE</option>
            <option value="HR_CARD">HR_CARD</option>
            <option value="HR_EMPLOYEE">HR_EMPLOYEE</option>
            <option value="HR_SHIFT_HOLIDAY">HR_SHIFT_HOLIDAY</option>
          </select>

          <button
            type="submit"
            className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold"
          >
            Search
          </button>
        </form>
      </div>

      {/* Audit Log Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-xs text-slate-400">
            Loading immutable audit trail...
          </div>
        ) : logs.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-400">
            No audit log entries found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-3">Timestamp</th>
                  <th className="py-3 px-3">Module / Action</th>
                  <th className="py-3 px-3">Target</th>
                  <th className="py-3 px-3">Before → After</th>
                  <th className="py-3 px-3">Reason</th>
                  <th className="py-3 px-3">Performed By</th>
                  <th className="py-3 px-3">Chain Hash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {logs.map((log) => (
                  <tr key={log._id} className="hover:bg-slate-800/40 align-top">
                    <td className="py-3 px-3 whitespace-nowrap font-mono text-[11px] text-slate-400">
                      {new Date(log.createdAt).toLocaleString("en-PK", {
                        year: "numeric",
                        month: "short",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>

                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[11px] font-bold text-slate-100">
                        {log.action}
                      </span>
                      <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                        {log.module}
                      </div>
                    </td>

                    <td className="py-3 px-3 font-semibold text-slate-100">
                      {log.targetLabel}
                    </td>

                    <td className="py-3 px-3 font-mono text-[10px] max-w-xs">
                      {log.valueBefore && (
                        <div className="text-rose-400 truncate">
                          Before: {JSON.stringify(log.valueBefore)}
                        </div>
                      )}
                      {log.valueAfter && (
                        <div className="text-emerald-400 truncate">
                          After: {JSON.stringify(log.valueAfter)}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-3 text-slate-200 font-medium">
                      {log.reason}
                    </td>

                    <td className="py-3 px-3 font-mono text-[11px] text-slate-300">
                      {log.performedByName}
                    </td>

                    <td className="py-3 px-3 font-mono text-[10px] text-slate-400">
                      <div title={log.entryHash}>
                        #{log.entryHash?.slice(0, 10)}...
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

