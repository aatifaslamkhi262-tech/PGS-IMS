"use client";

import React from "react";
import { CreditCard } from "lucide-react";

export type PaymentAllocationMethod =
  | "CASH"
  | "CARD"
  | "BANK_TRANSFER"
  | "EXCHANGE_CREDIT";

export interface PaymentAllocationState {
  isSplit: boolean;
  singleMethod: PaymentAllocationMethod;
  singleAmount: number;
  cash: number;
  card: number;
  cardRef: string;
  bank: number;
  bankRef: string;
  exchangeCredit: number;
  exchangeCreditRef: string;
}

export interface PaymentAllocationEntry {
  method: PaymentAllocationMethod;
  amount: number;
  referenceNumber?: string;
}

export function createInitialPaymentState(
  singleMethod: PaymentAllocationMethod = "CASH",
  singleAmount: number = 0
): PaymentAllocationState {
  return {
    isSplit: false,
    singleMethod,
    singleAmount,
    cash: 0,
    card: 0,
    cardRef: "",
    bank: 0,
    bankRef: "",
    exchangeCredit: 0,
    exchangeCreditRef: "",
  };
}

export function getPaymentAllocatedTotal(
  state: PaymentAllocationState,
  fixedTotal: number = 0,
  useEditableSingleAmount: boolean = false
): number {
  if (state.isSplit) {
    return (
      Math.max(0, Number(state.cash || 0)) +
      Math.max(0, Number(state.card || 0)) +
      Math.max(0, Number(state.bank || 0)) +
      Math.max(0, Number(state.exchangeCredit || 0))
    );
  }
  return Math.max(0, Number(useEditableSingleAmount ? state.singleAmount : fixedTotal) || 0);
}

export function buildPaymentAllocations(
  state: PaymentAllocationState,
  fixedTotal: number = 0,
  useEditableSingleAmount: boolean = false
): PaymentAllocationEntry[] {
  if (!state.isSplit) {
    const amt = Math.max(0, Number(useEditableSingleAmount ? state.singleAmount : fixedTotal) || 0);
    return amt > 0 ? [{ method: state.singleMethod, amount: amt }] : [];
  }

  const list: PaymentAllocationEntry[] = [];
  if (state.cash > 0) list.push({ method: "CASH", amount: Number(state.cash) });
  if (state.card > 0) {
    list.push({
      method: "CARD",
      amount: Number(state.card),
      referenceNumber: state.cardRef.trim() || undefined,
    });
  }
  if (state.bank > 0) {
    list.push({
      method: "BANK_TRANSFER",
      amount: Number(state.bank),
      referenceNumber: state.bankRef.trim() || undefined,
    });
  }
  if (state.exchangeCredit > 0) {
    list.push({
      method: "EXCHANGE_CREDIT",
      amount: Number(state.exchangeCredit),
      referenceNumber: state.exchangeCreditRef.trim() || undefined,
    });
  }
  return list;
}

interface PaymentAllocationInputProps {
  value: PaymentAllocationState;
  onChange: (next: PaymentAllocationState) => void;
  targetAmount?: number;
  allowEditableSingleAmount?: boolean;
  includeExchangeCredit?: boolean;
  label?: string;
  singleAmountLabel?: string;
  accent?: "indigo" | "purple";
  showAllocatedSummary?: boolean;
}

/**
 * Shared Single / Split payment selector reused across POS, Advance Booking, and Queue Checkout.
 */
export function PaymentAllocationInput({
  value,
  onChange,
  targetAmount = 0,
  allowEditableSingleAmount = false,
  includeExchangeCredit = false,
  label = "Payment Type:",
  singleAmountLabel = "Amount Received (PKR) *",
  accent = "indigo",
  showAllocatedSummary = true,
}: PaymentAllocationInputProps) {
  const activeToggleClass =
    accent === "purple"
      ? "bg-purple-600 border-purple-500 text-white"
      : "bg-indigo-600 border-indigo-500 text-white";

  const splitSum =
    Math.max(0, Number(value.cash || 0)) +
    Math.max(0, Number(value.card || 0)) +
    Math.max(0, Number(value.bank || 0)) +
    Math.max(0, Number(value.exchangeCredit || 0));

  const handleToggleSplit = (enableSplit: boolean) => {
    if (!enableSplit) {
      onChange({ ...value, isSplit: false });
      return;
    }
    const seedCash =
      value.cash === 0 && value.card === 0 && value.bank === 0 && value.exchangeCredit === 0
        ? allowEditableSingleAmount
          ? Math.max(0, Number(value.singleAmount || 0))
          : Math.max(0, Number(targetAmount || 0))
        : value.cash;
    onChange({ ...value, isSplit: true, cash: seedCash });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
          <CreditCard
            className={`w-3.5 h-3.5 ${accent === "purple" ? "text-purple-400" : "text-indigo-400"}`}
          />
          <span>{label}</span>
        </label>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleToggleSplit(false)}
            className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition ${
              !value.isSplit
                ? activeToggleClass
                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            Single
          </button>
          <button
            type="button"
            onClick={() => handleToggleSplit(true)}
            className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition ${
              value.isSplit
                ? "bg-cyan-600 border-cyan-500 text-white shadow-md shadow-cyan-600/30"
                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            🔀 Split Payment
          </button>
        </div>
      </div>

      {!value.isSplit ? (
        <div className="space-y-2">
          <div className={`grid gap-2 ${includeExchangeCredit ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
            <button
              type="button"
              onClick={() => onChange({ ...value, singleMethod: "CASH" })}
              className={`py-2 px-2.5 rounded-xl font-bold border text-xs text-center transition ${
                value.singleMethod === "CASH"
                  ? "bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/20"
                  : "bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800"
              }`}
            >
              💵 Cash
            </button>
            <button
              type="button"
              onClick={() => onChange({ ...value, singleMethod: "CARD" })}
              className={`py-2 px-2.5 rounded-xl font-bold border text-xs text-center transition ${
                value.singleMethod === "CARD"
                  ? "bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/20"
                  : "bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800"
              }`}
            >
              💳 Card
            </button>
            <button
              type="button"
              onClick={() => onChange({ ...value, singleMethod: "BANK_TRANSFER" })}
              className={`py-2 px-2.5 rounded-xl font-bold border text-xs text-center transition ${
                value.singleMethod === "BANK_TRANSFER"
                  ? "bg-cyan-600 text-white border-cyan-500 shadow-md shadow-cyan-600/20"
                  : "bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800"
              }`}
            >
              🏦 Bank / Raast
            </button>
            {includeExchangeCredit && (
              <button
                type="button"
                onClick={() => onChange({ ...value, singleMethod: "EXCHANGE_CREDIT" })}
                className={`py-2 px-2.5 rounded-xl font-bold border text-xs text-center transition ${
                  value.singleMethod === "EXCHANGE_CREDIT"
                    ? "bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-600/20"
                    : "bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800"
                }`}
              >
                🔄 Exchange
              </button>
            )}
          </div>

          {allowEditableSingleAmount && (
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">{singleAmountLabel}</label>
              <input
                type="number"
                min="1"
                placeholder="e.g. 7000 or 15000"
                value={value.singleAmount || ""}
                onChange={(e) =>
                  onChange({ ...value, singleAmount: Math.max(0, Number(e.target.value)) })
                }
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm font-bold text-purple-400 focus:outline-none focus:border-purple-500"
              />
            </div>
          )}
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl space-y-2 text-xs">
          <div className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider">
            Split Payment Breakdown
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-300 font-medium">💵 Cash (PKR):</span>
            <input
              type="number"
              min="0"
              placeholder="0"
              value={value.cash || ""}
              onChange={(e) => onChange({ ...value, cash: Math.max(0, Number(e.target.value)) })}
              className="w-28 bg-slate-950 border border-slate-700 text-emerald-400 font-bold rounded px-2 py-1 text-right text-xs"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-300 font-medium">💳 Card (PKR):</span>
            <div className="flex items-center gap-1">
              <input
                type="text"
                placeholder="Card Ref #"
                value={value.cardRef}
                onChange={(e) => onChange({ ...value, cardRef: e.target.value })}
                className="w-20 bg-slate-950 border border-slate-800 text-slate-300 rounded px-1.5 py-1 text-[10px]"
              />
              <input
                type="number"
                min="0"
                placeholder="0"
                value={value.card || ""}
                onChange={(e) => onChange({ ...value, card: Math.max(0, Number(e.target.value)) })}
                className="w-28 bg-slate-950 border border-slate-700 text-indigo-400 font-bold rounded px-2 py-1 text-right text-xs"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-300 font-medium">🏦 Bank / Raast (PKR):</span>
            <div className="flex items-center gap-1">
              <input
                type="text"
                placeholder="IBFT Ref #"
                value={value.bankRef}
                onChange={(e) => onChange({ ...value, bankRef: e.target.value })}
                className="w-20 bg-slate-950 border border-slate-800 text-slate-300 rounded px-1.5 py-1 text-[10px]"
              />
              <input
                type="number"
                min="0"
                placeholder="0"
                value={value.bank || ""}
                onChange={(e) => onChange({ ...value, bank: Math.max(0, Number(e.target.value)) })}
                className="w-28 bg-slate-950 border border-slate-700 text-cyan-400 font-bold rounded px-2 py-1 text-right text-xs"
              />
            </div>
          </div>

          {includeExchangeCredit && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-300 font-medium">🔄 Exchange Credit (PKR):</span>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  placeholder="PI Ref #"
                  value={value.exchangeCreditRef}
                  onChange={(e) => onChange({ ...value, exchangeCreditRef: e.target.value })}
                  className="w-20 bg-slate-950 border border-slate-800 text-slate-300 rounded px-1.5 py-1 text-[10px]"
                />
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={value.exchangeCredit || ""}
                  onChange={(e) =>
                    onChange({ ...value, exchangeCredit: Math.max(0, Number(e.target.value)) })
                  }
                  className="w-28 bg-slate-950 border border-indigo-500/60 text-indigo-300 font-bold rounded px-2 py-1 text-right text-xs"
                />
              </div>
            </div>
          )}

          {showAllocatedSummary && !allowEditableSingleAmount && (
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between font-bold">
              <span className="text-slate-400">Total Allocated:</span>
              <span
                className={
                  splitSum >= targetAmount - 0.5 ? "text-emerald-400" : "text-rose-400 animate-pulse"
                }
              >
                Rs. {splitSum.toLocaleString()} / Rs. {targetAmount.toLocaleString()}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
