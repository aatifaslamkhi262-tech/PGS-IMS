"use client";

import React, { useEffect, useState } from "react";
import { HRSubNav } from "@/components/HRSubNav";
import {
  AlertTriangle,
  Check,
  X,
  Edit2,
  Calendar,
  RefreshCw,
} from "lucide-react";

function toHHMMInPKT(isoDate?: string | null): string {
  if (!isoDate) return "";
  const d = new Date(new Date(isoDate).getTime() + 5 * 60 * 60 * 1000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatMinutesAsHM(totalMinutes: number = 0): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export default function HRAttendancePage() {
  const [date, setDate] = useState<string>("");
  const [locationId, setLocationId] = useState("");
  const [locations, setLocations] = useState<any[]>([]);
  const [tab, setTab] = useState<
    "ALL" | "ATTENTION" | "PRESENT" | "ABSENT" | "OFF"
  >("ALL");

  const [rows, setRows] = useState<any[]>([]);
  const [unresolvedAlerts, setUnresolvedAlerts] = useState<any[]>([]);
  const [holidayToday, setHolidayToday] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Manual Correction Modal
  const [editingRow, setEditingRow] = useState<any | null>(null);
  const [editDate, setEditDate] = useState("");
  const [checkInTime, setCheckInTime] = useState("");
  const [checkOutTime, setCheckOutTime] = useState("");
  const [statusOverride, setStatusOverride] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchAttendance = async (selectedDate?: string) => {
    try {
      setLoading(true);
      setError("");
      const params = new URLSearchParams();
      if (selectedDate ?? date) params.set("date", selectedDate ?? date);
      if (locationId) params.set("locationId", locationId);

      const [attRes, locRes] = await Promise.all([
        fetch(`/api/hr/attendance?${params.toString()}`),
        locations.length === 0 ? fetch("/api/locations") : Promise.resolve(null),
      ]);
      const attJson = await attRes.json();
      if (attJson.success) {
        if (!date && attJson.data.date) {
          setDate(attJson.data.date);
        }
        setRows(attJson.data.rows || []);
        setUnresolvedAlerts(attJson.data.unresolvedAlerts || []);
        setHolidayToday(attJson.data.holidayToday || null);
      } else {
        setError(attJson.error || "Failed to load attendance sheet");
      }

      if (locRes) {
        const locJson = await locRes.json();
        if (locJson.success) setLocations(locJson.data || []);
      }
    } catch (err: any) {
      setError(err.message || "Network error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
  }, [locationId]);

  const handleEarlyClaimDecision = async (
    attendanceId: string,
    decision: "APPROVE_EARLY_ARRIVAL" | "REJECT_EARLY_ARRIVAL"
  ) => {
    try {
      setError("");
      setMessage("");
      const res = await fetch("/api/hr/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: decision,
          attendanceId,
          reason:
            decision === "APPROVE_EARLY_ARRIVAL"
              ? "Verified early arrival before Kiosk PC turned on"
              : "Rejected unverified early arrival claim",
        }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage(json.message);
        fetchAttendance(date);
      } else {
        setError(json.error || "Action failed");
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const openCorrectionModal = (
    emp: any,
    attRecord: any | null,
    recordDate: string
  ) => {
    setEditingRow({ employee: emp, attendance: attRecord });
    setEditDate(recordDate);
    setCheckInTime(
      attRecord?.checkIn
        ? toHHMMInPKT(attRecord.checkIn)
        : emp.shiftStartTime || "10:00"
    );
    setCheckOutTime(
      attRecord?.checkOut
        ? toHHMMInPKT(attRecord.checkOut)
        : emp.shiftEndTime || "20:00"
    );
    setStatusOverride(
      attRecord?.status === "MISSING_CHECKOUT" ? "" : attRecord?.status || ""
    );
    setReason(
      attRecord?.status === "MISSING_CHECKOUT"
        ? "Verified checkout time with gate guard register"
        : ""
    );
    setNotes(attRecord?.notes || "");
  };

  const handleManualSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRow || !reason.trim()) return;

    try {
      setSubmitting(true);
      setError("");
      setMessage("");
      const res = await fetch("/api/hr/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "MANUAL_UPDATE",
          employeeId: editingRow.employee._id,
          date: editDate,
          checkInTime:
            statusOverride === "ABSENT" ||
            statusOverride === "PAID_OFF" ||
            statusOverride === "WEEKLY_OFF"
              ? ""
              : checkInTime,
          checkOutTime:
            statusOverride === "ABSENT" ||
            statusOverride === "PAID_OFF" ||
            statusOverride === "WEEKLY_OFF"
              ? ""
              : checkOutTime,
          statusOverride:
            statusOverride === "MISSING_CHECKOUT"
              ? undefined
              : statusOverride || undefined,
          reason: reason.trim(),
          notes,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage(json.message);
        setEditingRow(null);
        fetchAttendance(date);
      } else {
        setError(json.error || "Failed to save correction");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredRows = rows.filter((r) => {
    const st = r.effectiveStatus;
    const att = r.attendance;
    const needsAttention =
      st === "MISSING_CHECKOUT" ||
      st === "SHORT_HOURS" ||
      att?.claimedArrivalStatus === "PENDING" ||
      att?.flags?.includes("PIN_USED_NO_CARD");

    if (tab === "ATTENTION") return needsAttention;
    if (tab === "PRESENT")
      return [
        "PRESENT",
        "LATE",
        "HALF_DAY",
        "SHORT_HOURS",
        "PRESENT_ON_OFF_DAY",
      ].includes(st);
    if (tab === "ABSENT") return st === "ABSENT";
    if (tab === "OFF")
      return ["WEEKLY_OFF", "PAID_OFF", "HOLIDAY"].includes(st);
    return true;
  });

  const getStatusBadge = (st: string) => {
    switch (st) {
      case "PRESENT":
        return "bg-emerald-950 text-emerald-300 border-emerald-800";
      case "PRESENT_ON_OFF_DAY":
        return "bg-teal-950 text-teal-300 border-teal-800";
      case "LATE":
      case "SHORT_HOURS":
      case "HALF_DAY":
        return "bg-amber-950 text-amber-300 border-amber-800";
      case "MISSING_CHECKOUT":
        return "bg-amber-900 text-amber-100 border-amber-600";
      case "WEEKLY_OFF":
      case "PAID_OFF":
      case "HOLIDAY":
        return "bg-blue-950 text-blue-300 border-blue-800";
      default:
        return "bg-rose-950 text-rose-300 border-rose-800";
    }
  };

  return (
    <div className="space-y-5">
      <HRSubNav />

      {/* Top Needs-Attention Queue (Missed Checkouts & Early Arrival Claims) */}
      {unresolvedAlerts.length > 0 && (
        <div className="bg-slate-900 border border-amber-700 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              <span>
                Pending HR Verification Queue ({unresolvedAlerts.length})
              </span>
            </h2>
            <span className="text-[11px] text-slate-400">
              Every action is logged to the Audit Trail
            </span>
          </div>

          <div className="divide-y divide-slate-800 border border-slate-800 rounded bg-slate-950">
            {unresolvedAlerts.map((alertItem) => {
              const emp = alertItem.employee;
              const isEarlyClaim =
                alertItem.claimedArrivalStatus === "PENDING";

              return (
                <div
                  key={alertItem._id}
                  className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <span className="font-bold text-slate-100">
                      {emp?.name || "Staff"} ({emp?.employeeCode})
                    </span>{" "}
                    <span className="font-mono text-slate-400">
                      on {alertItem.date}
                    </span>
                    {isEarlyClaim ? (
                      <div className="text-amber-300 mt-0.5">
                        <strong>System-Off Early Arrival Claim:</strong> Scanned
                        at {toHHMMInPKT(alertItem.checkIn)}, claimed actual
                        arrival at{" "}
                        <strong>
                          {toHHMMInPKT(alertItem.claimedArrivalTime)}
                        </strong>{" "}
                        — &ldquo;{alertItem.claimedArrivalReason}&rdquo;
                      </div>
                    ) : (
                      <div className="text-rose-300 mt-0.5">
                        <strong>MISSING CHECKOUT:</strong> Clocked in at{" "}
                        {toHHMMInPKT(alertItem.checkIn)}, forgot to scan out at
                        gate.
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isEarlyClaim ? (
                      <>
                        <button
                          onClick={() =>
                            handleEarlyClaimDecision(
                              alertItem._id,
                              "APPROVE_EARLY_ARRIVAL"
                            )
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-semibold"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>
                            Approve {toHHMMInPKT(alertItem.claimedArrivalTime)}
                          </span>
                        </button>
                        <button
                          onClick={() =>
                            handleEarlyClaimDecision(
                              alertItem._id,
                              "REJECT_EARLY_ARRIVAL"
                            )
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-rose-300 border border-slate-700 font-semibold"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() =>
                          openCorrectionModal(emp, alertItem, alertItem.date)
                        }
                        className="inline-flex items-center gap-1 px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-semibold"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>Fix Checkout Time</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter & Date Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                fetchAttendance(e.target.value);
              }}
              className="bg-transparent text-xs font-semibold text-slate-100 focus:outline-none"
            />
          </div>

          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-200"
          >
            <option value="">All Branches / Locations</option>
            {locations.map((loc) => (
              <option key={loc._id} value={loc._id}>
                {loc.name}
              </option>
            ))}
          </select>

          <button
            onClick={() => fetchAttendance(date)}
            className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold inline-flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Refresh</span>
          </button>
        </div>

        {/* Status Tabs */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: "ALL", label: `All (${rows.length})` },
            { id: "ATTENTION", label: "Needs Attention" },
            { id: "PRESENT", label: "Present / Late" },
            { id: "ABSENT", label: "Absent" },
            { id: "OFF", label: "Off / Holiday" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as any)}
              className={`px-3 py-1.5 rounded text-xs font-semibold border ${
                tab === t.id
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {holidayToday && (
        <div className="p-3 rounded bg-blue-950 border border-blue-800 text-blue-200 text-xs font-semibold">
          📅 Today ({date}) is a registered Holiday:{" "}
          <strong>{holidayToday.name}</strong> ({holidayToday.type})
        </div>
      )}

      {message && (
        <div className="p-3 rounded bg-emerald-950 border border-emerald-800 text-emerald-200 text-xs">
          ✓ {message}
        </div>
      )}

      {error && (
        <div className="p-3 rounded bg-rose-950 border border-rose-800 text-rose-200 text-xs">
          ✕ {error}
        </div>
      )}

      {/* Daily Attendance Sheet Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-xs text-slate-400">
            Loading daily attendance sheet...
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-400">
            No attendance records match the selected filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-3">Employee</th>
                  <th className="py-3 px-3">Daily Duty & Off Rule</th>
                  <th className="py-3 px-3">Clock-In</th>
                  <th className="py-3 px-3">Breaks</th>
                  <th className="py-3 px-3">Clock-Out</th>
                  <th className="py-3 px-3">Worked vs Target</th>
                  <th className="py-3 px-3">Month Progress</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">HR Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredRows.map((row) => {
                  const emp = row.employee;
                  const att = row.attendance;
                  const st = row.effectiveStatus;
                  const targetMins = Math.round(
                    (emp.requiredDailyHours || 8) * 60
                  );

                  return (
                    <tr key={emp._id} className="hover:bg-slate-800/40">
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-100">
                          {emp.name}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          <span className="font-mono text-blue-400">
                            {emp.employeeCode}
                          </span>{" "}
                          · {emp.designation}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-200">
                          {emp.requiredDailyHours}h / day (
                          {emp.dutyType === "FLEXIBLE_HOURS"
                            ? "Flexible"
                            : `${emp.shiftStartTime}–${emp.shiftEndTime}`}
                          )
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {emp.offPolicy === "MONTHLY_QUOTA"
                            ? `Quota: ${row.monthStats.paidOffsUsed}/${emp.monthlyOffQuota} Offs used`
                            : emp.offPolicy === "WEEKLY_FIXED"
                            ? `Weekly Off (${(emp.weeklyOffDays || []).length}/wk)`
                            : "No Fixed Off"}
                        </div>
                      </td>

                      <td className="py-3 px-3 font-mono">
                        {att?.checkIn ? (
                          <div>
                            <span className="font-bold text-slate-100">
                              {toHHMMInPKT(att.checkIn)}
                            </span>
                            {att.lateMinutes > 0 && (
                              <div className="text-[10px] text-amber-400">
                                +{att.lateMinutes}m late
                              </div>
                            )}
                            {att.claimedArrivalStatus === "PENDING" && (
                              <div className="text-[10px] text-amber-300 font-sans">
                                Claimed: {toHHMMInPKT(att.claimedArrivalTime)}
                              </div>
                            )}
                            {att.flags?.includes("PIN_USED_NO_CARD") && (
                              <div className="text-[10px] text-blue-400 font-sans">
                                Used Backup PIN
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        {att?.breaks?.length > 0 ? (
                          <div>
                            <span className="font-semibold text-slate-200">
                              {att.breaks.length} break(s)
                            </span>
                            <div className="text-[10px] text-slate-400">
                              {att.totalBreakMinutes || 0} mins total
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-500">0m</span>
                        )}
                      </td>

                      <td className="py-3 px-3 font-mono">
                        {att?.checkOut ? (
                          <span className="font-bold text-slate-100">
                            {toHHMMInPKT(att.checkOut)}
                          </span>
                        ) : att?.checkIn ? (
                          <span className="text-[11px] text-emerald-400 font-sans font-semibold">
                            In Shop
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        {att?.checkOut ? (
                          <div>
                            <span
                              className={`font-bold ${
                                att.shortMinutes > 10
                                  ? "text-rose-400"
                                  : "text-emerald-400"
                              }`}
                            >
                              {formatMinutesAsHM(att.workedMinutes)}
                            </span>{" "}
                            <span className="text-slate-400">
                              / {emp.requiredDailyHours}h
                            </span>
                            {att.shortMinutes > 10 && (
                              <div className="text-[10px] text-rose-400">
                                Short: {formatMinutesAsHM(att.shortMinutes)}
                              </div>
                            )}
                            {att.extraMinutes > 15 && (
                              <div className="text-[10px] text-emerald-400">
                                +{formatMinutesAsHM(att.extraMinutes)} extra
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">
                            Target: {formatMinutesAsHM(targetMins)}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-200">
                          {row.monthStats.workedHours}h /{" "}
                          {row.monthStats.targetHours}h
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {row.monthStats.workingDays} work days in mo
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getStatusBadge(
                            st
                          )}`}
                        >
                          {st.replace(/_/g, " ")}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => openCorrectionModal(emp, att, date)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Edit / Fix</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* HR Manual Correction Modal */}
      {editingRow && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div>
                <h3 className="text-sm font-bold text-slate-100">
                  Correct Attendance — {editingRow.employee.name}
                </h3>
                <p className="text-[11px] text-slate-400">
                  Date: {editDate} · Required Daily Duty:{" "}
                  {editingRow.employee.requiredDailyHours}h
                </p>
              </div>
              <button
                onClick={() => setEditingRow(null)}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                ✕ Close
              </button>
            </div>

            <form onSubmit={handleManualSave} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Attendance Status Override (Optional)
                </label>
                <select
                  value={statusOverride}
                  onChange={(e) => setStatusOverride(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-100"
                >
                  <option value="">
                    Auto-Calculate from Check-In / Check-Out
                  </option>
                  <option value="PRESENT">PRESENT (On Time / Full Duty)</option>
                  <option value="LATE">LATE</option>
                  <option value="HALF_DAY">HALF DAY</option>
                  <option value="SHORT_HOURS">SHORT HOURS</option>
                  <option value="PAID_OFF">
                    PAID OFF (Use Monthly Quota / Scheduled Off)
                  </option>
                  <option value="WEEKLY_OFF">WEEKLY OFF</option>
                  <option value="ABSENT">ABSENT</option>
                </select>
              </div>

              {statusOverride !== "ABSENT" &&
                statusOverride !== "PAID_OFF" &&
                statusOverride !== "WEEKLY_OFF" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Check-In Time (PKT)
                      </label>
                      <input
                        type="time"
                        value={checkInTime}
                        onChange={(e) => setCheckInTime(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-100 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Check-Out Time (PKT)
                      </label>
                      <input
                        type="time"
                        value={checkOutTime}
                        onChange={(e) => setCheckOutTime(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-100 font-mono"
                      />
                    </div>
                  </div>
                )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Mandatory Audit Reason *
                </label>
                <input
                  type="text"
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Forgot to scan at gate, verified with guard register"
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-100"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Recorded permanently in the append-only HR Audit Log.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Remarks / Notes
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional note"
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingRow(null)}
                  className="px-4 py-2 rounded bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold"
                >
                  {submitting ? "Saving..." : "Save & Log Correction"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

