"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  ScanLine,
  KeyRound,
  AlertOctagon,
  CheckCircle2,
  Clock,
  Coffee,
  LogOut,
  ShieldAlert,
  Camera,
} from "lucide-react";
import { CameraBarcodeScannerModal } from "@/components/CameraBarcodeScannerModal";

function playKioskBeep(type: "SUCCESS" | "OUT" | "ALARM") {
  try {
    const AudioCtx =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === "ALARM") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(280, ctx.currentTime + 0.2);
      osc.frequency.setValueAtTime(440, ctx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + 0.7);
    } else if (type === "OUT") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(580, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } else {
      osc.type = "sine";
      osc.frequency.setValueAtTime(780, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + 0.18);
    }
  } catch {
    // Audio context optional
  }
}

export default function GateKioskPage() {
  const [mode, setMode] = useState<"SCAN" | "PIN">("SCAN");
  const [cardInput, setCardInput] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [pin, setPin] = useState("");
  const [locationId, setLocationId] = useState("");
  const [locations, setLocations] = useState<any[]>([]);

  const [recentPunches, setRecentPunches] = useState<any[]>([]);
  const [serverTimeOffsetMs, setServerTimeOffsetMs] = useState(0);
  const [clockDriftMinutes, setClockDriftMinutes] = useState(0);
  const [nowDisplay, setNowDisplay] = useState<Date>(new Date());

  // Scan Result State
  const [scanResult, setScanResult] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showCameraScanner, setShowCameraScanner] = useState(false);

  // Edge Case 1: Claim Early Arrival (System was off when staff arrived)
  const [showEarlyClaimBox, setShowEarlyClaimBox] = useState(false);
  const [claimedTimeStr, setClaimedTimeStr] = useState("09:30");
  const [claimedReason, setClaimedReason] = useState(
    "Gate PC / Electricity was off when I arrived"
  );

  const scanInputRef = useRef<HTMLInputElement>(null);
  const resetTimerRef = useRef<any>(null);

  const fetchKioskStatus = async () => {
    try {
      const [kRes, locRes] = await Promise.all([
        fetch(
          `/api/hr/kiosk${locationId ? `?locationId=${locationId}` : ""}`
        ),
        locations.length === 0 ? fetch("/api/locations") : Promise.resolve(null),
      ]);
      const kJson = await kRes.json();
      if (kJson.success) {
        setRecentPunches(kJson.data || []);
        if (kJson.serverTime) {
          const srvMs = new Date(kJson.serverTime).getTime();
          const localMs = Date.now();
          const diffMs = srvMs - localMs;
          setServerTimeOffsetMs(diffMs);
          setClockDriftMinutes(Math.round(Math.abs(diffMs) / 60000));
        }
      }
      if (locRes) {
        const locJson = await locRes.json();
        if (locJson.success) setLocations(locJson.data || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchKioskStatus();
    const interval = setInterval(fetchKioskStatus, 15000);
    return () => clearInterval(interval);
  }, [locationId]);

  // Live Clock Ticker synced with Server Time
  useEffect(() => {
    const timer = setInterval(() => {
      setNowDisplay(new Date(Date.now() + serverTimeOffsetMs));
    }, 1000);
    return () => clearInterval(timer);
  }, [serverTimeOffsetMs]);

  // Keep barcode input focused in SCAN mode
  useEffect(() => {
    if (mode === "SCAN" && !showEarlyClaimBox) {
      scanInputRef.current?.focus();
    }
  }, [mode, scanResult, showEarlyClaimBox]);

  const scheduleAutoClear = (ms: number = 8000) => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      setScanResult(null);
      setShowEarlyClaimBox(false);
      if (mode === "SCAN") scanInputRef.current?.focus();
    }, ms);
  };

  const submitPunch = async (payload: any) => {
    try {
      setSubmitting(true);
      const res = await fetch("/api/hr/kiosk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          locationId: locationId || undefined,
        }),
      });
      const json = await res.json();
      setScanResult(json);

      if (json.kioskState === "BLOCKED_CARD" || json.kioskState === "PIN_LOCKED") {
        playKioskBeep("ALARM");
        scheduleAutoClear(14000); // Keep red alarm screen longer for guard
      } else if (json.kioskState === "CHECK_OUT" || json.kioskState === "BREAK_OUT") {
        playKioskBeep("OUT");
        scheduleAutoClear(9000);
      } else {
        playKioskBeep("SUCCESS");
        scheduleAutoClear(8000);
      }

      fetchKioskStatus();
    } catch (err: any) {
      setScanResult({
        success: false,
        kioskState: "INVALID_CARD",
        title: "NETWORK ERROR",
        message: err.message || "Could not reach server",
      });
      playKioskBeep("ALARM");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCardScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardInput.trim()) return;
    const uid = cardInput.trim();
    setCardInput("");
    setShowEarlyClaimBox(false);
    await submitPunch({ cardUid: uid, action: "AUTO" });
  };

  const handleCameraScanSuccess = async (barcodeValue: string) => {
    const clean = barcodeValue.trim();
    if (!clean) return;
    setCardInput(clean);
    setShowEarlyClaimBox(false);
    setShowCameraScanner(false);
    await submitPunch({ cardUid: clean, action: "AUTO" });
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeCode.trim() || !pin.trim()) return;
    const code = employeeCode.trim();
    const p = pin.trim();
    setPin("");
    setShowEarlyClaimBox(false);
    await submitPunch({ employeeCode: code, pin: p, action: "AUTO" });
  };

  const handleConvertToBreak = async () => {
    if (!scanResult?.employee) return;
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    await submitPunch({
      cardUid: scanResult.attendance?.cardUidUsed || undefined,
      employeeCode: scanResult.employee.employeeCode,
      action: "START_BREAK",
    });
  };

  const handleEarlyArrivalClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanResult?.employee || !claimedTimeStr) return;
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    await submitPunch({
      cardUid: scanResult.attendance?.cardUidUsed || undefined,
      employeeCode: scanResult.employee.employeeCode,
      action: "CLAIM_EARLY_ARRIVAL",
      claimedArrivalTimeStr: claimedTimeStr,
      claimedArrivalReason: claimedReason,
    });
    setShowEarlyClaimBox(false);
  };

  // Determine Solid Status Banner Colors (Zero glassmorphism, pure high-contrast solid colors)
  const getBannerClasses = () => {
    if (!scanResult) {
      return "bg-slate-900 border-2 border-slate-800 text-slate-100";
    }
    switch (scanResult.kioskState) {
      case "CHECK_IN":
      case "BREAK_IN":
        return "bg-emerald-700 border-2 border-emerald-500 text-white";
      case "CHECK_OUT":
        return "bg-blue-700 border-2 border-blue-400 text-white";
      case "BREAK_OUT":
      case "BOUNCE_IGNORED":
        return "bg-amber-700 border-2 border-amber-400 text-white";
      case "BLOCKED_CARD":
      case "PIN_LOCKED":
      case "INVALID_CARD":
        return "bg-rose-700 border-4 border-rose-300 text-white";
      default:
        return "bg-slate-900 border-2 border-slate-700 text-slate-100";
    }
  };

  return (
    <div className="space-y-4">
      {/* CMOS / Local PC Clock Drift Warning (Edge Case 5) */}
      {clockDriftMinutes > 2 && (
        <div className="bg-amber-900 border border-amber-600 text-amber-100 px-4 py-2.5 rounded-lg flex items-center justify-between text-xs font-semibold">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>
              Notice: This PC&apos;s local clock is off by {clockDriftMinutes} minutes. Attendance punches are using accurate Server Time automatically.
            </span>
          </div>
          <span className="font-mono">Server Time Active</span>
        </div>
      )}

      {/* Top Bar: Live Server Clock & Gate Location */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Gate Attendance Terminal (Server Time)
          </div>
          <div className="text-2xl sm:text-3xl font-mono font-extrabold text-slate-100 mt-0.5">
            {nowDisplay.toLocaleTimeString("en-PK", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
            <span className="text-sm font-normal text-slate-400 ml-3">
              {nowDisplay.toLocaleDateString("en-PK", {
                weekday: "short",
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs font-semibold text-slate-200"
          >
            <option value="">All Gate Locations / Main Entrance</option>
            {locations.map((loc) => (
              <option key={loc._id} value={loc._id}>
                Gate: {loc.name} ({loc.code})
              </option>
            ))}
          </select>

          <div className="inline-flex rounded border border-slate-800 overflow-hidden">
            <button
              type="button"
              onClick={() => {
                setMode("SCAN");
                setShowEarlyClaimBox(false);
              }}
              className={`px-3 py-2 text-xs font-bold inline-flex items-center gap-1.5 ${
                mode === "SCAN"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-950 text-slate-300 hover:bg-slate-800"
              }`}
            >
              <ScanLine className="w-3.5 h-3.5" />
              <span>Barcode Gun</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setShowEarlyClaimBox(false);
                setShowCameraScanner(true);
              }}
              className="px-3.5 py-2 text-xs font-bold inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white border-l border-r border-slate-800 transition"
              title="Scan card with Mobile Camera or Webcam"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Camera Scan</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("PIN");
                setShowEarlyClaimBox(false);
              }}
              className={`px-3 py-2 text-xs font-bold inline-flex items-center gap-1.5 ${
                mode === "PIN"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-950 text-slate-300 hover:bg-slate-800"
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Forgot Card (PIN)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Split Layout: Left = Scanner + Big Status Screen, Right = Today's Live Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left 2 Columns: Scanner Input + Solid Status Display */}
        <div className="lg:col-span-2 space-y-4">
          {/* Input Box */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
            {mode === "SCAN" ? (
              <form onSubmit={handleCardScanSubmit} className="flex flex-wrap sm:flex-nowrap gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <ScanLine className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    ref={scanInputRef}
                    type="text"
                    value={cardInput}
                    onChange={(e) => setCardInput(e.target.value)}
                    placeholder="Scan Barcode / QR Card Here (e.g. CRD-8F92A1)..."
                    autoFocus
                    className="w-full bg-slate-950 border-2 border-slate-700 focus:border-blue-500 rounded-lg pl-10 pr-4 py-3 text-sm font-mono font-bold text-slate-100 focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowCameraScanner(true)}
                  className="px-4 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold shrink-0 inline-flex items-center gap-2 shadow-sm transition"
                  title="Scan using phone camera or webcam"
                >
                  <Camera className="w-4 h-4" />
                  <span>Camera Scan</span>
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold shrink-0"
                >
                  {submitting ? "Checking..." : "Punch"}
                </button>
              </form>
            ) : (
              <form
                onSubmit={handlePinSubmit}
                className="grid grid-cols-1 sm:grid-cols-3 gap-2.5"
              >
                <input
                  type="text"
                  required
                  value={employeeCode}
                  onChange={(e) => setEmployeeCode(e.target.value)}
                  placeholder="Employee Code (e.g. EMP-001)"
                  className="bg-slate-950 border-2 border-slate-700 rounded-lg px-3.5 py-2.5 text-sm font-mono font-bold text-slate-100"
                />
                <input
                  type="password"
                  required
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="4-Digit Backup PIN"
                  className="bg-slate-950 border-2 border-slate-700 rounded-lg px-3.5 py-2.5 text-sm font-mono font-bold text-slate-100"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold"
                >
                  {submitting ? "Verifying..." : "Verify PIN & Punch"}
                </button>
              </form>
            )}
          </div>

          {/* Large Solid Status Display Box */}
          <div
            className={`rounded-lg p-6 min-h-[280px] flex flex-col justify-between transition-colors ${getBannerClasses()}`}
          >
            {!scanResult ? (
              <div className="my-auto text-center space-y-2 py-8">
                <ScanLine className="w-12 h-12 mx-auto text-slate-400" />
                <h2 className="text-xl font-bold text-slate-100">
                  READY — SCAN EMPLOYEE ID CARD
                </h2>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  First scan of the day clocks in (Green). Next scan clocks out (Blue). Repeat scans within 5 minutes are automatically ignored.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-black/25 text-xs font-mono font-bold uppercase">
                      {scanResult.kioskState === "BLOCKED_CARD" ||
                      scanResult.kioskState === "PIN_LOCKED" ||
                      scanResult.kioskState === "INVALID_CARD" ? (
                        <AlertOctagon className="w-4 h-4" />
                      ) : scanResult.kioskState === "CHECK_OUT" ? (
                        <LogOut className="w-4 h-4" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                      <span>{scanResult.kioskState.replace(/_/g, " ")}</span>
                    </div>

                    <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight pt-1">
                      {scanResult.title}
                    </h2>
                    <p className="text-sm sm:text-base font-medium opacity-95">
                      {scanResult.message}
                    </p>
                  </div>

                  {scanResult.employee && (
                    scanResult.employee.photoUrl ? (
                      <img
                        src={scanResult.employee.photoUrl}
                        alt={scanResult.employee.name}
                        className="w-16 h-16 rounded-lg object-cover border-2 border-white/50 shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-black/25 border border-white/25 flex items-center justify-center text-2xl font-extrabold shrink-0">
                        {scanResult.employee.name.charAt(0).toUpperCase()}
                      </div>
                    )
                  )}
                </div>

                {/* Employee or Blocked Card Details */}
                {scanResult.cardInfo && (
                  <div className="p-4 rounded bg-black/30 border border-white/20 text-xs space-y-1 font-mono">
                    <div>
                      <strong>CARD UID:</strong> {scanResult.cardInfo.cardUid} (
                      {scanResult.cardInfo.status})
                    </div>
                    <div>
                      <strong>STAFF NAME:</strong>{" "}
                      {scanResult.cardInfo.employeeName}{" "}
                      {scanResult.cardInfo.employeeCode
                        ? `(${scanResult.cardInfo.employeeCode})`
                        : ""}
                    </div>
                    {scanResult.cardInfo.blockedAt && (
                      <div>
                        <strong>BLOCKED ON:</strong>{" "}
                        {new Date(
                          scanResult.cardInfo.blockedAt
                        ).toLocaleString("en-PK")}
                      </div>
                    )}
                    {scanResult.cardInfo.blockReason && (
                      <div>
                        <strong>REASON:</strong>{" "}
                        {scanResult.cardInfo.blockReason}
                      </div>
                    )}
                  </div>
                )}

                {scanResult.employee && scanResult.attendance && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
                    <div className="p-3 rounded bg-black/25 border border-white/15">
                      <div className="text-[10px] uppercase opacity-80">
                        Staff Code & Role
                      </div>
                      <div className="text-xs font-bold mt-0.5">
                        {scanResult.employee.employeeCode} ·{" "}
                        {scanResult.employee.designation}
                      </div>
                    </div>

                    <div className="p-3 rounded bg-black/25 border border-white/15">
                      <div className="text-[10px] uppercase opacity-80">
                        Check-In Time
                      </div>
                      <div className="text-xs font-mono font-bold mt-0.5">
                        {scanResult.attendance.checkIn
                          ? new Date(
                              scanResult.attendance.checkIn
                            ).toLocaleTimeString("en-PK", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </div>
                    </div>

                    <div className="p-3 rounded bg-black/25 border border-white/15">
                      <div className="text-[10px] uppercase opacity-80">
                        Check-Out Time
                      </div>
                      <div className="text-xs font-mono font-bold mt-0.5">
                        {scanResult.attendance.checkOut
                          ? new Date(
                              scanResult.attendance.checkOut
                            ).toLocaleTimeString("en-PK", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "On Duty"}
                      </div>
                    </div>

                    <div className="p-3 rounded bg-black/25 border border-white/15">
                      <div className="text-[10px] uppercase opacity-80">
                        Daily Target
                      </div>
                      <div className="text-xs font-bold mt-0.5">
                        {scanResult.employee.requiredDailyHours} Hours (
                        {scanResult.employee.dutyType === "FLEXIBLE_HOURS"
                          ? "Flexible"
                          : "Fixed"}
                        )
                      </div>
                    </div>
                  </div>
                )}

                {/* Edge-Case Action Buttons right on the Kiosk Screen */}
                {scanResult.employee && (
                  <div className="pt-3 border-t border-white/20 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-2">
                      {/* Edge Case 1: Arrived before Kiosk PC turned on */}
                      {(scanResult.kioskState === "CHECK_IN" ||
                        scanResult.canClaimEarlyArrival) &&
                        !showEarlyClaimBox && (
                          <button
                            type="button"
                            onClick={() => {
                              if (resetTimerRef.current)
                                clearTimeout(resetTimerRef.current);
                              setClaimedTimeStr(
                                scanResult.employee.shiftStartTime || "09:30"
                              );
                              setShowEarlyClaimBox(true);
                            }}
                            className="px-3 py-1.5 rounded bg-black/35 hover:bg-black/50 border border-white/30 text-xs font-bold inline-flex items-center gap-1.5"
                          >
                            <Clock className="w-3.5 h-3.5" />
                            <span>
                              Arrived Earlier Before PC Turned On? Claim Time
                            </span>
                          </button>
                        )}

                      {/* Edge Case 2: Going out for a short break / market / bank instead of final check-out */}
                      {(scanResult.kioskState === "CHECK_OUT" ||
                        scanResult.canConvertToBreak ||
                        scanResult.canStartBreak) && (
                        <button
                          type="button"
                          onClick={handleConvertToBreak}
                          className="px-3 py-1.5 rounded bg-black/35 hover:bg-black/50 border border-white/30 text-xs font-bold inline-flex items-center gap-1.5"
                        >
                          <Coffee className="w-3.5 h-3.5" />
                          <span>
                            Going Out Temporarily (Bank / Break)? Mark Short Out
                          </span>
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setScanResult(null);
                        setShowEarlyClaimBox(false);
                        scanInputRef.current?.focus();
                      }}
                      className="px-3 py-1.5 rounded bg-black/25 hover:bg-black/40 text-xs font-semibold"
                    >
                      Clear Screen
                    </button>
                  </div>
                )}

                {/* Early Arrival Claim Inline Form */}
                {showEarlyClaimBox && (
                  <form
                    onSubmit={handleEarlyArrivalClaim}
                    className="p-3.5 rounded bg-black/40 border border-white/30 space-y-2.5"
                  >
                    <div className="text-xs font-bold">
                      Claim Actual Arrival Time (Sent to HR for 1-click verification):
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="time"
                        required
                        value={claimedTimeStr}
                        onChange={(e) => setClaimedTimeStr(e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white font-mono"
                      />
                      <input
                        type="text"
                        required
                        value={claimedReason}
                        onChange={(e) => setClaimedReason(e.target.value)}
                        placeholder="Reason (e.g. Gate PC was off)"
                        className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                      />
                      <button
                        type="submit"
                        className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                      >
                        Submit Claim to HR
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Today's Recent Scans Feed */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden flex flex-col">
          <div className="p-3.5 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Today&apos;s Gate Log
              </h3>
              <p className="text-[11px] text-slate-400">
                Live clock-in / clock-out activity
              </p>
            </div>
            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px] font-bold">
              {recentPunches.length} Active
            </span>
          </div>

          <div className="divide-y divide-slate-800 overflow-y-auto max-h-[380px]">
            {recentPunches.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No gate punches recorded today yet.
              </div>
            ) : (
              recentPunches.map((p) => {
                const emp = p.employee;
                const onBreak = p.flags?.includes("ON_BREAK");
                return (
                  <div
                    key={p._id}
                    className="p-3 flex items-center justify-between gap-2 hover:bg-slate-800/40"
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-100">
                        {emp?.name || "Staff"}{" "}
                        <span className="font-mono text-[10px] text-slate-400">
                          ({emp?.employeeCode})
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                        In:{" "}
                        {p.checkIn
                          ? new Date(p.checkIn).toLocaleTimeString("en-PK", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                        {p.checkOut &&
                          ` · Out: ${new Date(p.checkOut).toLocaleTimeString(
                            "en-PK",
                            {
                              hour: "2-digit",
                              minute: "2-digit",
                            }
                          )}`}
                      </div>
                    </div>

                    <div className="text-right">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          p.checkOut
                            ? "bg-blue-950 text-blue-300 border-blue-800"
                            : onBreak
                            ? "bg-amber-950 text-amber-300 border-amber-800"
                            : "bg-emerald-950 text-emerald-300 border-emerald-800"
                        }`}
                      >
                        {p.checkOut
                          ? `${Math.floor((p.workedMinutes || 0) / 60)}h ${
                              (p.workedMinutes || 0) % 60
                            }m`
                          : onBreak
                          ? "ON BREAK"
                          : "IN SHOP"}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
      {/* Camera Live Scanner Modal for Mobile / Webcam */}
      <CameraBarcodeScannerModal
        isOpen={showCameraScanner}
        onClose={() => setShowCameraScanner(false)}
        onScanSuccess={handleCameraScanSuccess}
      />
    </div>
  );
}

