"use client";

import React, { useEffect, useState } from "react";
import { HRSubNav } from "@/components/HRSubNav";
import {
  CalendarDays,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  AlertCircle,
  FileText,
} from "lucide-react";

export default function HRLeavesPage() {
  const [leaves, setLeaves] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Modal State
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState("");
  const [leaveType, setLeaveType] = useState("CASUAL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [totalDays, setTotalDays] = useState("1");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchLeaves = async () => {
    try {
      setLoading(true);
      setError("");
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);

      const [leaveRes, empRes] = await Promise.all([
        fetch(`/api/hr/leaves?${params.toString()}`),
        employees.length === 0 ? fetch("/api/hr/employees") : Promise.resolve(null),
      ]);

      const leaveJson = await leaveRes.json();
      if (leaveJson.success) {
        setLeaves(leaveJson.data || []);
      } else {
        setError(leaveJson.error || "Failed to load leaves.");
      }

      if (empRes) {
        const empJson = await empRes.json();
        if (empJson.success) setEmployees(empJson.data || []);
      }
    } catch (err: any) {
      setError(err.message || "Network error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaves();
  }, [statusFilter]);

  const handleApplyLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmpId || !startDate || !endDate || !reason.trim()) {
      setError("Please fill all required fields.");
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      setMessage("");
      const res = await fetch("/api/hr/leaves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: selectedEmpId,
          leaveType,
          startDate,
          endDate,
          totalDays: Number(totalDays) || 1,
          reason,
          notes,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setMessage("Leave applied successfully.");
        setShowApplyModal(false);
        setSelectedEmpId("");
        setReason("");
        setNotes("");
        fetchLeaves();
      } else {
        setError(json.error || "Failed to apply leave.");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecision = async (
    leaveId: string,
    action: "APPROVE" | "REJECT"
  ) => {
    try {
      setError("");
      setMessage("");
      let rejectionReason = "";
      if (action === "REJECT") {
        rejectionReason =
          prompt("Enter rejection reason:") || "Rejected by supervisor";
      }

      const res = await fetch("/api/hr/leaves", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaveId,
          action,
          rejectionReason,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setMessage(json.message);
        fetchLeaves();
      } else {
        setError(json.error || "Action failed.");
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6">
      <HRSubNav />

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-blue-500" />
            Leaves & Absence Management
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Apply, track and approve Casual, Sick, and Unpaid leave requests with audit trail
          </p>
        </div>

        <button
          onClick={() => setShowApplyModal(true)}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          <span>Apply Leave</span>
        </button>
      </div>

      {message && (
        <div className="mb-4 p-3 bg-emerald-950/80 border border-emerald-800 text-emerald-200 text-xs rounded flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-rose-950/80 border border-rose-800 text-rose-200 text-xs rounded flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 mb-4 border-b border-slate-800 pb-2">
        {["ALL", "PENDING", "APPROVED", "REJECTED"].map((st) => (
          <button
            key={st}
            onClick={() => setStatusFilter(st)}
            className={`px-3 py-1 rounded text-xs font-semibold transition ${
              statusFilter === st
                ? "bg-slate-800 text-white border border-slate-700"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {st}
          </button>
        ))}
      </div>

      {/* Leaves Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 text-slate-400 uppercase font-semibold border-b border-slate-800">
              <tr>
                <th className="p-3">Staff</th>
                <th className="p-3">Type</th>
                <th className="p-3">Dates</th>
                <th className="p-3 text-center">Days</th>
                <th className="p-3">Reason</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    Loading leave requests...
                  </td>
                </tr>
              ) : leaves.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    No leave requests found.
                  </td>
                </tr>
              ) : (
                leaves.map((l) => (
                  <tr key={l._id} className="hover:bg-slate-800/40 transition">
                    <td className="p-3">
                      <div className="font-semibold text-slate-100">
                        {l.employee?.name || "Staff"}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {l.employee?.employeeCode} · {l.employee?.designation}
                      </div>
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          l.leaveType === "CASUAL"
                            ? "bg-blue-900/60 text-blue-300 border border-blue-800"
                            : l.leaveType === "SICK"
                            ? "bg-amber-900/60 text-amber-300 border border-amber-800"
                            : "bg-rose-900/60 text-rose-300 border border-rose-800"
                        }`}
                      >
                        {l.leaveType}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="font-mono text-slate-200">
                        {l.startDate} {l.startDate !== l.endDate && `→ ${l.endDate}`}
                      </div>
                    </td>
                    <td className="p-3 text-center font-bold text-slate-200">
                      {l.totalDays}d
                    </td>
                    <td className="p-3 max-w-xs truncate text-slate-300" title={l.reason}>
                      {l.reason}
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          l.status === "APPROVED"
                            ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                            : l.status === "REJECTED"
                            ? "bg-rose-950 text-rose-400 border border-rose-800"
                            : "bg-amber-950 text-amber-400 border border-amber-800"
                        }`}
                      >
                        {l.status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      {l.status === "PENDING" ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleDecision(l._id, "APPROVE")}
                            className="p-1 px-2 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-700/60 rounded text-[11px] font-semibold"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleDecision(l._id, "REJECT")}
                            className="p-1 px-2 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-700/60 rounded text-[11px] font-semibold"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-500">
                          {l.status === "APPROVED" ? `by ${l.approvedByName || "Admin"}` : "Decided"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Apply Leave Modal */}
      {showApplyModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-md w-full p-5 shadow-2xl">
            <h3 className="text-base font-bold text-slate-100 mb-3 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-blue-500" />
              Apply Leave Request
            </h3>

            <form onSubmit={handleApplyLeave} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Select Employee *</label>
                <select
                  value={selectedEmpId}
                  onChange={(e) => setSelectedEmpId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
                  required
                >
                  <option value="">-- Choose Employee --</option>
                  {employees.map((emp) => (
                    <option key={emp._id} value={emp._id}>
                      {emp.name} ({emp.employeeCode}) - {emp.designation}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Leave Type *</label>
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
                >
                  <option value="CASUAL">Casual Leave (Paid Quota)</option>
                  <option value="SICK">Sick Leave (Paid)</option>
                  <option value="UNPAID">Unpaid Leave (Salary Deduction)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Start Date *</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      if (!endDate) setEndDate(e.target.value);
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">End Date *</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Total Days *</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={totalDays}
                  onChange={(e) => setTotalDays(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Reason *</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
                  placeholder="Medical, family event, personal urgency..."
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Additional Notes</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
                  placeholder="Optional note"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowApplyModal(false)}
                  className="px-3 py-1.5 rounded text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded disabled:opacity-50"
                >
                  {submitting ? "Submitting..." : "Submit Application"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

