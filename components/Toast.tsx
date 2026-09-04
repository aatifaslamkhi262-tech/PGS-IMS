"use client";

import React, { useEffect } from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";

export interface ToastMessage {
  id: string;
  type: "success" | "error" | "info";
  text: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onClose: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onClose }) => {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full px-4 pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={onClose} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: ToastMessage; onClose: (id: string) => void }> = ({
  toast,
  onClose,
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(toast.id);
    }, 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onClose]);

  const isSuccess = toast.type === "success";

  return (
    <div
      className={`pointer-events-auto flex items-start justify-between gap-3 p-3.5 rounded-lg shadow-lg border text-sm font-medium transition-all transform translate-y-0 ${
        isSuccess
          ? "bg-slate-900 text-emerald-400 border-slate-700"
          : "bg-slate-900 text-rose-400 border-slate-700"
      }`}
    >
      <div className="flex items-start gap-2.5">
        {isSuccess ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        ) : (
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
        )}
        <span className="leading-snug text-slate-100">{toast.text}</span>
      </div>
      <button
        onClick={() => onClose(toast.id)}
        className="text-slate-400 hover:text-white p-1 rounded transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
