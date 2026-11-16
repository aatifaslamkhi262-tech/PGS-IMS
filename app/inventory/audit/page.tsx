"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ArrowRight } from "lucide-react";
import Link from "next/link";

/**
 * RETIRED: The legacy 4-step Shelf Stock Audit workflow has been permanently retired.
 * Primary live reconciliation is now handled centrally by All-Branch Live Stock Sync (/inventory/live-sync).
 */
export default function RetiredAuditRedirect() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace("/inventory/live-sync");
    }, 400);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-200">
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl p-8 text-center space-y-4 shadow-2xl backdrop-blur-sm">
        <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
          <RefreshCw className="w-7 h-7 animate-spin" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Redirecting to Live Sync...</h2>
          <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">
            Purana 4-step audit screen retire kar diya gaya hai. Aapko All-Branch Live Stock Sync par redirect kiya ja raha hai.
          </p>
        </div>
        <Link
          href="/inventory/live-sync"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-sm transition-all shadow-lg shadow-emerald-900/30"
        >
          <span>Open Live Sync Now</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
