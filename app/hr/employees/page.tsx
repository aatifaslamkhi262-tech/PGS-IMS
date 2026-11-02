"use client";

import React, { useEffect, useState } from "react";
import { HRSubNav } from "@/components/HRSubNav";
import {
  Plus,
  Search,
  Edit2,
  KeyRound,
  CreditCard,
  Unlock,
  UserPlus,
  Camera,
  Link2,
} from "lucide-react";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function resizeImageFileToDataUrl(
  file: File,
  maxSize: number = 280
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width;
        let h = img.height;
        if (w > h) {
          if (w > maxSize) {
            h = Math.round((h * maxSize) / w);
            w = maxSize;
          }
        } else {
          if (h > maxSize) {
            w = Math.round((w * maxSize) / h);
            h = maxSize;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        } else {
          reject(new Error("Canvas context unavailable"));
        }
      };
      img.onerror = reject;
      img.src = ev.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function HREmployeesPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [unlinkedUsers, setUnlinkedUsers] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Import Users Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [defaultSalary, setDefaultSalary] = useState("35000");
  const [defaultDailyHours, setDefaultDailyHours] = useState("10");

  // Add/Edit Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState("");

  // Form fields
  const [employeeCode, setEmployeeCode] = useState("");
  const [name, setName] = useState("");
  const [designation, setDesignation] = useState("Salesman");
  const [locationId, setLocationId] = useState("");
  const [userId, setUserId] = useState("");
  const [phone, setPhone] = useState("");
  const [cnic, setCnic] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [bloodGroup, setBloodGroup] = useState("Unknown");
  const [joiningDate, setJoiningDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [baseSalary, setBaseSalary] = useState("35000");
  const [status, setStatus] = useState("ACTIVE");
  const [photoUrl, setPhotoUrl] = useState("");

  // Custom Duty & Off Rules
  const [shiftId, setShiftId] = useState("");
  const [dutyType, setDutyType] = useState<"FIXED_SHIFT" | "FLEXIBLE_HOURS">(
    "FIXED_SHIFT"
  );
  const [shiftStartTime, setShiftStartTime] = useState("10:00");
  const [shiftEndTime, setShiftEndTime] = useState("20:00");
  const [requiredDailyHours, setRequiredDailyHours] = useState("10");
  const [graceMinutes, setGraceMinutes] = useState("15");
  const [halfDayMinutes, setHalfDayMinutes] = useState("90");
  const [offPolicy, setOffPolicy] = useState<
    "WEEKLY_FIXED" | "MONTHLY_QUOTA" | "NONE"
  >("WEEKLY_FIXED");
  const [weeklyOffDays, setWeeklyOffDays] = useState<number[]>([0]);
  const [monthlyOffQuota, setMonthlyOffQuota] = useState("4");
  const [monthlyHalfDayQuota, setMonthlyHalfDayQuota] = useState("0");

  // PIN & Card
  const [pin, setPin] = useState("");
  const [autoIssueCard, setAutoIssueCard] = useState(true);
  const [editReason, setEditReason] = useState("");

  const fetchAll = async () => {
    try {
      setLoading(true);
      setError("");
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (statusFilter) params.set("status", statusFilter);

      const [empRes, locRes, shiftRes] = await Promise.all([
        fetch(`/api/hr/employees?${params.toString()}`),
        fetch("/api/locations"),
        fetch("/api/hr/shifts"),
      ]);
      const empData = await empRes.json();
      const locData = await locRes.json();
      const shiftData = await shiftRes.json();

      if (empData.success) {
        setEmployees(empData.data || []);
        setUnlinkedUsers(empData.unlinkedUsers || []);
        setAllUsers(empData.allUsers || []);
      } else {
        setError(empData.error || "Failed to load employees");
      }

      if (locData.success) setLocations(locData.data || []);
      if (shiftData.success) setShifts(shiftData.data || []);
    } catch (err: any) {
      setError(err.message || "Network error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [statusFilter]);

  const openImportUsersModal = () => {
    // Pre-select all non-Admin users (Salesman, Branch, Warehouse, etc.)
    const preselected = unlinkedUsers
      .filter((u) => u.role !== "Admin")
      .map((u) => u._id);
    setSelectedUserIds(
      preselected.length > 0
        ? preselected
        : unlinkedUsers.map((u) => u._id)
    );
    setShowImportModal(true);
  };

  const handleBulkImportUsers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedUserIds.length === 0) return;
    try {
      setSubmitting(true);
      setError("");
      setMessage("");
      const res = await fetch("/api/hr/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "IMPORT_USERS",
          userIds: selectedUserIds,
          defaultSalary: Number(defaultSalary) || 35000,
          defaultDailyHours: Number(defaultDailyHours) || 10,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage(json.message);
        setShowImportModal(false);
        fetchAll();
      } else {
        setError(json.error || "Failed to import users");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const openCreateModal = () => {
    setEditingEmployee(null);
    setModalError("");
    setEmployeeCode("");
    setName("");
    setDesignation("Salesman");
    setLocationId("");
    setUserId("");
    setPhone("");
    setCnic("");
    setEmergencyContactName("");
    setEmergencyContactPhone("");
    setBloodGroup("Unknown");
    setJoiningDate(new Date().toISOString().slice(0, 10));
    setBaseSalary("35000");
    setStatus("ACTIVE");
    setPhotoUrl("");
    setShiftId("");
    setDutyType("FIXED_SHIFT");
    setShiftStartTime("10:00");
    setShiftEndTime("20:00");
    setRequiredDailyHours("10");
    setGraceMinutes("15");
    setHalfDayMinutes("90");
    setOffPolicy("WEEKLY_FIXED");
    setWeeklyOffDays([0]);
    setMonthlyOffQuota("4");
    setMonthlyHalfDayQuota("0");
    setPin("");
    setAutoIssueCard(true);
    setEditReason("");
    setShowModal(true);
  };

  const openEditModal = (emp: any) => {
    setEditingEmployee(emp);
    setModalError("");
    setEmployeeCode(emp.employeeCode || "");
    setName(emp.name || "");
    setDesignation(emp.designation || "");
    setLocationId(emp.location?._id || emp.location || "");
    setUserId(emp.userId?._id || emp.userId || "");
    setPhone(emp.phone || "");
    setCnic(emp.cnicDecrypted || "");
    setEmergencyContactName(emp.emergencyContactName || "");
    setEmergencyContactPhone(emp.emergencyContactPhone || "");
    setBloodGroup(emp.bloodGroup || "Unknown");
    setJoiningDate(
      emp.joiningDate
        ? new Date(emp.joiningDate).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10)
    );
    setBaseSalary(String(emp.baseSalary ?? 0));
    setStatus(emp.status || "ACTIVE");
    setPhotoUrl(emp.photoUrl || "");
    setShiftId(emp.shift?._id || emp.shift || "");
    setDutyType(emp.dutyType || "FIXED_SHIFT");
    setShiftStartTime(emp.shiftStartTime || "10:00");
    setShiftEndTime(emp.shiftEndTime || "20:00");
    setRequiredDailyHours(String(emp.requiredDailyHours ?? 8));
    setGraceMinutes(String(emp.graceMinutes ?? 15));
    setHalfDayMinutes(String(emp.halfDayMinutes ?? 90));
    setOffPolicy(emp.offPolicy || "WEEKLY_FIXED");
    setWeeklyOffDays(
      Array.isArray(emp.weeklyOffDays) ? emp.weeklyOffDays : [0]
    );
    setMonthlyOffQuota(String(emp.monthlyOffQuota ?? 4));
    setMonthlyHalfDayQuota(String(emp.monthlyHalfDayQuota ?? 0));
    setPin("");
    setEditReason("Updated staff schedule / profile");
    setShowModal(true);
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImageFileToDataUrl(file, 280);
      setPhotoUrl(dataUrl);
    } catch (err) {
      console.error("Failed to process image:", err);
    }
  };

  const handleShiftPresetChange = (selectedShiftId: string) => {
    setShiftId(selectedShiftId);
    const found = shifts.find((s) => s._id === selectedShiftId);
    if (found) {
      setDutyType(
        found.shiftType === "FLEXIBLE_HOURS" ? "FLEXIBLE_HOURS" : "FIXED_SHIFT"
      );
      setShiftStartTime(found.startTime || "10:00");
      setShiftEndTime(found.endTime || "20:00");
      setRequiredDailyHours(String(found.paidDailyHours || 8));
      setGraceMinutes(String(found.graceMinutes ?? 15));
      setHalfDayMinutes(String(found.halfDayThresholdMinutes ?? 90));
      if (Array.isArray(found.weeklyOffDays)) {
        setWeeklyOffDays(found.weeklyOffDays);
      }
    }
  };

  const toggleWeeklyDay = (dayIndex: number) => {
    setWeeklyOffDays((prev) =>
      prev.includes(dayIndex)
        ? prev.filter((d) => d !== dayIndex)
        : [...prev, dayIndex].sort()
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError("");

    if (!name.trim() || !designation.trim() || !phone.trim()) {
      setModalError("Name, Designation, and Phone are required.");
      return;
    }

    if (pin.trim() && !/^\d{4}$/.test(pin.trim())) {
      setModalError("Backup PIN must be exactly 4 digits (e.g. 1234).");
      return;
    }

    try {
      setSubmitting(true);
      const payload: any = {
        employeeCode: employeeCode.trim() || undefined,
        name: name.trim(),
        designation: designation.trim(),
        location: locationId || undefined,
        userId: userId || undefined,
        phone: phone.trim(),
        cnic: cnic.trim() || undefined,
        emergencyContactName: emergencyContactName.trim(),
        emergencyContactPhone: emergencyContactPhone.trim(),
        bloodGroup,
        joiningDate,
        baseSalary: Number(baseSalary) || 0,
        status,
        photoUrl: photoUrl.trim(),
        shift: shiftId || undefined,
        dutyType,
        shiftStartTime,
        shiftEndTime,
        requiredDailyHours: Number(requiredDailyHours) || 8,
        graceMinutes: Number(graceMinutes ?? 15),
        halfDayMinutes: Number(halfDayMinutes ?? 90),
        offPolicy,
        weeklyOffDays,
        monthlyOffQuota: Number(monthlyOffQuota ?? 0),
        monthlyHalfDayQuota: Number(monthlyHalfDayQuota ?? 0),
        pin: pin.trim() || undefined,
        autoIssueCard,
        reason: editReason.trim() || "Profile update",
      };

      const url = editingEmployee
        ? `/api/hr/employees/${editingEmployee._id}`
        : "/api/hr/employees";
      const method = editingEmployee ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setShowModal(false);
        fetchAll();
      } else {
        setModalError(data.error || "Failed to save employee.");
      }
    } catch (err: any) {
      setModalError(err.message || "Failed to save.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnlockPin = async (empId: string) => {
    try {
      const res = await fetch(`/api/hr/employees/${empId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unlockPin: true,
          reason: "Unlocked PIN after failed attempts",
        }),
      });
      const data = await res.json();
      if (data.success) fetchAll();
    } catch (e) {
      console.error(e);
    }
  };

  const formatOffPolicyLabel = (emp: any) => {
    if (emp.offPolicy === "WEEKLY_FIXED") {
      const days = (emp.weeklyOffDays || [0])
        .map((d: number) => DAY_NAMES[d])
        .join(", ");
      return `Weekly: ${days || "None"} (${(emp.weeklyOffDays || []).length}/wk)`;
    }
    if (emp.offPolicy === "MONTHLY_QUOTA") {
      let txt = `Monthly: ${emp.monthlyOffQuota ?? 0} Off(s)`;
      if (emp.monthlyHalfDayQuota) {
        txt += ` + ${emp.monthlyHalfDayQuota} Half-Day(s)`;
      }
      return `${txt}/mo`;
    }
    return "No Fixed Offs";
  };

  return (
    <div className="space-y-5">
      <HRSubNav />

      {/* Unlinked System Users Notice Banner */}
      {unlinkedUsers.length > 0 && (
        <div className="bg-slate-900 border border-indigo-700/70 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
              <UserPlus className="w-4 h-4" />
              <span>
                {unlinkedUsers.length} Existing System / POS User Account(s) Found
              </span>
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              Import your existing Salesmen & Staff accounts in 1 click to link their POS Sales/Profit with Gate Attendance and auto-issue their ID Cards.
            </p>
          </div>
          <button
            onClick={openImportUsersModal}
            className="px-3.5 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shrink-0 inline-flex items-center gap-1.5"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Import from System Users ({unlinkedUsers.length})</span>
          </button>
        </div>
      )}

      {/* Top Filter & Action Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchAll();
          }}
          className="flex flex-wrap items-center gap-2 flex-1"
        >
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search name, code, phone or card UID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded pl-8 pr-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-200"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active Only</option>
            <option value="INACTIVE">Inactive</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="TERMINATED">Terminated</option>
          </select>

          <button
            type="submit"
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-xs font-semibold text-slate-200"
          >
            Filter
          </button>
        </form>

        <div className="flex items-center gap-2">
          {unlinkedUsers.length > 0 && (
            <button
              onClick={openImportUsersModal}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 text-xs font-semibold"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Import Users</span>
            </button>
          )}
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Staff Member</span>
          </button>
        </div>
      </div>

      {message && (
        <div className="p-3 rounded bg-emerald-950 border border-emerald-800 text-emerald-200 text-xs font-medium">
          ✓ {message}
        </div>
      )}

      {error && (
        <div className="p-3 rounded bg-rose-950 border border-rose-800 text-rose-200 text-xs">
          {error}
        </div>
      )}

      {/* Employees High-Density Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-xs text-slate-400">
            Loading staff profiles and custom schedules...
          </div>
        ) : employees.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-xs text-slate-400">
              No HR employee profiles registered yet.
            </p>
            {unlinkedUsers.length > 0 && (
              <button
                onClick={openImportUsersModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
              >
                <UserPlus className="w-4 h-4" />
                <span>
                  Import {unlinkedUsers.length} Existing System Users Now
                </span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-3">Staff Member</th>
                  <th className="py-3 px-3">Branch & POS Link</th>
                  <th className="py-3 px-3">Daily Duty Rule</th>
                  <th className="py-3 px-3">Off Policy</th>
                  <th className="py-3 px-3">Month Target</th>
                  <th className="py-3 px-3">Active Card & PIN</th>
                  <th className="py-3 px-3">CNIC / Phone</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {employees.map((emp) => {
                  const isPinLocked =
                    emp.pinLockedUntil &&
                    new Date(emp.pinLockedUntil) > new Date();

                  return (
                    <tr key={emp._id} className="hover:bg-slate-800/40">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2.5">
                          {emp.photoUrl ? (
                            <img
                              src={emp.photoUrl}
                              alt={emp.name}
                              className="w-9 h-9 rounded-lg object-cover border border-slate-700 shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">
                              {(emp.name || "S").charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="font-bold text-slate-100">
                              {emp.name}
                            </div>
                            <div className="font-mono text-[11px] text-blue-400">
                              {emp.employeeCode}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-200">
                          {emp.designation}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {emp.location?.name || "All Branches"}
                        </div>
                        {emp.userId?.username && (
                          <div className="inline-flex items-center gap-1 text-[10px] font-mono text-indigo-400 mt-0.5">
                            <Link2 className="w-2.5 h-2.5" />
                            <span>POS: @{emp.userId.username}</span>
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        <span className="font-bold text-slate-100">
                          {emp.requiredDailyHours}h / day
                        </span>
                        <div className="text-[11px] text-slate-400">
                          {emp.dutyType === "FLEXIBLE_HOURS"
                            ? "Flexible Timing (Part-Time)"
                            : `${emp.shiftStartTime} – ${emp.shiftEndTime} (${emp.graceMinutes}m grace)`}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] font-medium text-slate-200">
                          {formatOffPolicyLabel(emp)}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-bold text-emerald-400">
                          {emp.targetSummary?.targetHours ?? "—"} hrs
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {emp.targetSummary?.workingDays ?? "—"} working days
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5">
                          <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                          {emp.activeCardUid ? (
                            <span className="font-mono text-[11px] text-slate-200">
                              {emp.activeCardUid}
                            </span>
                          ) : (
                            <span className="text-[11px] text-rose-400 font-semibold">
                              No Active Card
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <KeyRound className="w-3 h-3 text-slate-400" />
                          <span className="text-[11px] text-slate-400">
                            PIN: {emp.hasPin ? "Set" : "Not Set"}
                          </span>
                          {isPinLocked && (
                            <button
                              onClick={() => handleUnlockPin(emp._id)}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 text-[10px] font-bold"
                            >
                              <Unlock className="w-2.5 h-2.5" />
                              Unlock
                            </button>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="text-slate-200">{emp.phone}</div>
                        <div className="font-mono text-[11px] text-slate-400">
                          {emp.cnicMasked || "No CNIC"}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            emp.status === "ACTIVE"
                              ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                              : "bg-slate-800 text-slate-400 border-slate-700"
                          }`}
                        >
                          {emp.status}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => openEditModal(emp)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Edit</span>
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

      {/* 1-Click Import System Users Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-lg w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-100">
                  Import Existing System Users into HR
                </h3>
                <p className="text-xs text-slate-400">
                  Select which User accounts should become HR Employees with linked POS sales & active Gate ID Cards.
                </p>
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                ✕ Close
              </button>
            </div>

            <form onSubmit={handleBulkImportUsers} className="space-y-4">
              <div className="max-h-60 overflow-y-auto divide-y divide-slate-800 border border-slate-800 rounded bg-slate-950">
                {unlinkedUsers.map((u) => {
                  const checked = selectedUserIds.includes(u._id);
                  return (
                    <label
                      key={u._id}
                      className="p-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-900 text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedUserIds((prev) => [...prev, u._id]);
                            } else {
                              setSelectedUserIds((prev) =>
                                prev.filter((id) => id !== u._id)
                              );
                            }
                          }}
                          className="rounded border-slate-700"
                        />
                        <div>
                          <div className="font-bold text-slate-100">
                            {u.name || u.username}{" "}
                            <span className="font-mono text-indigo-400">
                              (@{u.username})
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Branch: {u.assignedLocation?.name || "All Locations"}
                          </div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-bold uppercase text-slate-200">
                        {u.role}
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Default Daily Hours
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="24"
                    value={defaultDailyHours}
                    onChange={(e) => setDefaultDailyHours(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-100 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Default Base Salary (PKR)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={defaultSalary}
                    onChange={(e) => setDefaultSalary(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-100"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 rounded bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || selectedUserIds.length === 0}
                  className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold disabled:opacity-50"
                >
                  {submitting
                    ? "Importing..."
                    : `Import ${selectedUserIds.length} User(s) & Issue Cards`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Employee Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-2xl w-full p-5 space-y-4 my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-100">
                  {editingEmployee
                    ? `Edit Employee — ${editingEmployee.name} (${editingEmployee.employeeCode})`
                    : "Register New Employee & Schedule"}
                </h2>
                <p className="text-xs text-slate-400">
                  Configure personal info, photo, POS user link, custom daily duty hours (3h–12h), and off rules
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1"
              >
                ✕ Close
              </button>
            </div>

            {modalError && (
              <div className="p-3 rounded bg-rose-950 border border-rose-800 text-rose-200 text-xs">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Section 1: Basic Profile & Photo */}
              <div className="border border-slate-800 rounded p-3.5 space-y-3 bg-slate-950">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    {photoUrl ? (
                      <img
                        src={photoUrl}
                        alt="Employee preview"
                        className="w-14 h-14 rounded-lg object-cover border-2 border-indigo-500"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-400">
                        <Camera className="w-5 h-5" />
                      </div>
                    )}
                    <div>
                      <div className="text-xs font-bold text-slate-200">
                        Employee ID Card Photo
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Displayed on CR80 ID Card and Gate Kiosk screen
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5" />
                      <span>{photoUrl ? "Change Photo" : "Upload Photo"}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoSelect}
                        className="hidden"
                      />
                    </label>
                    {photoUrl && (
                      <button
                        type="button"
                        onClick={() => setPhotoUrl("")}
                        className="px-2.5 py-1.5 rounded bg-slate-800 text-rose-300 text-xs border border-slate-700"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Atif Mahmood"
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Employee Code
                    </label>
                    <input
                      type="text"
                      value={employeeCode}
                      onChange={(e) => setEmployeeCode(e.target.value)}
                      placeholder="Auto (e.g. EMP-001)"
                      disabled={!!editingEmployee}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 font-mono disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Designation *
                    </label>
                    <input
                      type="text"
                      required
                      value={designation}
                      onChange={(e) => setDesignation(e.target.value)}
                      placeholder="e.g. Senior Salesman / Helper"
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Branch / Location
                    </label>
                    <select
                      value={locationId}
                      onChange={(e) => setLocationId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100"
                    >
                      <option value="">All / Main Shop</option>
                      {locations.map((loc) => (
                        <option key={loc._id} value={loc._id}>
                          {loc.name} ({loc.type})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Linked POS User (For Sales Report)
                    </label>
                    <select
                      value={userId}
                      onChange={(e) => setUserId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100"
                    >
                      <option value="">-- No POS Login (Helper / Guard) --</option>
                      {allUsers.map((u) => (
                        <option key={u._id} value={u._id}>
                          @{u.username} ({u.name || u.role})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Phone Number *
                    </label>
                    <input
                      type="text"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="0300-1234567"
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      CNIC (Encrypted in DB)
                    </label>
                    <input
                      type="text"
                      value={cnic}
                      onChange={(e) => setCnic(e.target.value)}
                      placeholder="61101-1234567-1"
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Emergency Contact Name
                    </label>
                    <input
                      type="text"
                      value={emergencyContactName}
                      onChange={(e) => setEmergencyContactName(e.target.value)}
                      placeholder="Brother / Father name"
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Emergency Contact Phone
                    </label>
                    <input
                      type="text"
                      value={emergencyContactPhone}
                      onChange={(e) => setEmergencyContactPhone(e.target.value)}
                      placeholder="0321-7654321"
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Blood Group
                    </label>
                    <select
                      value={bloodGroup}
                      onChange={(e) => setBloodGroup(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100"
                    >
                      {[
                        "Unknown",
                        "A+",
                        "A-",
                        "B+",
                        "B-",
                        "O+",
                        "O-",
                        "AB+",
                        "AB-",
                      ].map((bg) => (
                        <option key={bg} value={bg}>
                          {bg}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Base Monthly Salary (PKR)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={baseSalary}
                      onChange={(e) => setBaseSalary(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Employment Status
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100"
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="INACTIVE">INACTIVE</option>
                      <option value="SUSPENDED">SUSPENDED</option>
                      <option value="TERMINATED">TERMINATED</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 2: Custom Working Hours & Off Policy */}
              <div className="border border-slate-800 rounded p-3.5 space-y-3 bg-slate-950">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    2. Custom Working Hours & Off Policy (Per Person)
                  </h3>
                  <select
                    value={shiftId}
                    onChange={(e) => handleShiftPresetChange(e.target.value)}
                    className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                  >
                    <option value="">-- Copy from Shift Preset (Optional) --</option>
                    {shifts.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.name} ({s.paidDailyHours}h)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Duty Schedule Type
                    </label>
                    <select
                      value={dutyType}
                      onChange={(e) => setDutyType(e.target.value as any)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100"
                    >
                      <option value="FIXED_SHIFT">
                        Fixed Shift Timings (Checks Late Arrival)
                      </option>
                      <option value="FLEXIBLE_HOURS">
                        Flexible Hours (Only Checks Total Daily Hours)
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Required Daily Hours (e.g. 3, 8, 10) *
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="1"
                      max="24"
                      required
                      value={requiredDailyHours}
                      onChange={(e) => setRequiredDailyHours(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Off Policy Type
                    </label>
                    <select
                      value={offPolicy}
                      onChange={(e) => setOffPolicy(e.target.value as any)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100"
                    >
                      <option value="WEEKLY_FIXED">
                        Weekly Fixed Day(s) (1 or 2 days/week)
                      </option>
                      <option value="MONTHLY_QUOTA">
                        Monthly Floating Off Quota (e.g. 1 or 2/month)
                      </option>
                      <option value="NONE">No Scheduled Offs</option>
                    </select>
                  </div>
                </div>

                {dutyType === "FIXED_SHIFT" && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Shift Start Time
                      </label>
                      <input
                        type="time"
                        value={shiftStartTime}
                        onChange={(e) => setShiftStartTime(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Shift End Time
                      </label>
                      <input
                        type="time"
                        value={shiftEndTime}
                        onChange={(e) => setShiftEndTime(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Late Grace (Mins)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={graceMinutes}
                        onChange={(e) => setGraceMinutes(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Half-Day Late (Mins)
                      </label>
                      <input
                        type="number"
                        min="15"
                        value={halfDayMinutes}
                        onChange={(e) => setHalfDayMinutes(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100"
                      />
                    </div>
                  </div>
                )}

                {offPolicy === "WEEKLY_FIXED" && (
                  <div className="pt-1">
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Select Weekly Off Day(s) (Select 1 or 2 days per week):
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {DAY_NAMES.map((dayLabel, idx) => {
                        const selected = weeklyOffDays.includes(idx);
                        return (
                          <button
                            key={dayLabel}
                            type="button"
                            onClick={() => toggleWeeklyDay(idx)}
                            className={`px-3 py-1.5 rounded text-xs font-semibold border ${
                              selected
                                ? "bg-blue-600 text-white border-blue-600"
                                : "bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800"
                            }`}
                          >
                            {dayLabel}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {offPolicy === "MONTHLY_QUOTA" && (
                  <div className="pt-1 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Paid Full Offs (e.g. 1, 2, 4)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="15"
                        value={monthlyOffQuota}
                        onChange={(e) => setMonthlyOffQuota(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 font-bold"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">
                        Deducted from monthly calendar days.
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Paid Half-Days (e.g. 1, 2)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="15"
                        value={monthlyHalfDayQuota}
                        onChange={(e) => setMonthlyHalfDayQuota(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 font-bold"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">
                        Counts as 50% shift hours in target hours.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Section 3: Gate Security & PIN */}
              <div className="border border-slate-800 rounded p-3.5 space-y-3 bg-slate-950">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  3. Gate Kiosk Security & Backup PIN
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {editingEmployee
                        ? "Reset 4-Digit Backup PIN (Leave blank to keep current)"
                        : "4-Digit Backup PIN (Optional, stored hashed)"}
                    </label>
                    <input
                      type="password"
                      maxLength={4}
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      placeholder="e.g. 4829"
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 font-mono"
                    />
                  </div>

                  {!editingEmployee ? (
                    <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer pt-4">
                      <input
                        type="checkbox"
                        checked={autoIssueCard}
                        onChange={(e) => setAutoIssueCard(e.target.checked)}
                        className="rounded border-slate-700"
                      />
                      <span>
                        Automatically issue active ID card with random barcode
                      </span>
                    </label>
                  ) : (
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Audit Reason for Edit *
                      </label>
                      <input
                        type="text"
                        required
                        value={editReason}
                        onChange={(e) => setEditReason(e.target.value)}
                        placeholder="e.g. Changed duty hours from 8h to 10h"
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold disabled:opacity-50"
                >
                  {submitting
                    ? "Saving..."
                    : editingEmployee
                    ? "Save Changes"
                    : "Register Employee"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
