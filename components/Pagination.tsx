"use client";

import React from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange?: (itemsPerPage: number) => void;
  itemLabel?: string;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  itemLabel = "items",
}) => {
  if (totalItems === 0 || totalPages <= 1) {
    if (totalItems === 0) return null;
  }

  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  // Generate page numbers array with ellipses
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages + 2) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);

      let startPage = Math.max(2, currentPage - 1);
      let endPage = Math.min(totalPages - 1, currentPage + 1);

      if (currentPage <= 3) {
        endPage = 4;
      } else if (currentPage >= totalPages - 2) {
        startPage = totalPages - 3;
      }

      if (startPage > 2) {
        pages.push("...");
      }

      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }

      if (endPage < totalPages - 1) {
        pages.push("...");
      }

      pages.push(totalPages);
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800/90 rounded-2xl p-3.5 sm:p-4 shadow-md shadow-slate-950/40 flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 text-xs text-slate-300">
      {/* Items count & Per-page selector */}
      <div className="flex flex-wrap items-center justify-between sm:justify-start w-full sm:w-auto gap-3">
        <div className="text-slate-400">
          Showing{" "}
          <span className="font-semibold font-mono text-slate-100">{startItem}</span>
          {" - "}
          <span className="font-semibold font-mono text-slate-100">{endItem}</span>
          {" of "}
          <span className="font-semibold font-mono text-slate-100">{totalItems}</span>
          {" "}{itemLabel}
        </div>

        {onItemsPerPageChange && (
          <div className="flex items-center gap-1.5 border-l border-slate-800/80 pl-3">
            <span className="text-slate-400 text-[11px]">Show:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
              className="bg-slate-950/90 border border-slate-800 text-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer font-mono"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center gap-1">
        {/* First Page */}
        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          title="First Page"
          className="p-1.5 rounded-lg bg-slate-950/60 border border-slate-800 text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-slate-950/60 disabled:hover:text-slate-400 transition-colors cursor-pointer"
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>

        {/* Previous Page */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          title="Previous Page"
          className="p-1.5 rounded-lg bg-slate-950/60 border border-slate-800 text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-slate-950/60 disabled:hover:text-slate-400 transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Page Numbers */}
        <div className="flex items-center gap-1 px-1">
          {pageNumbers.map((page, idx) => {
            if (page === "...") {
              return (
                <span
                  key={`ellipsis-${idx}`}
                  className="px-2 py-1 text-slate-500 font-mono text-xs select-none"
                >
                  ...
                </span>
              );
            }

            const pageNum = page as number;
            const isActive = pageNum === currentPage;

            return (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                className={`min-w-[32px] h-8 px-2 rounded-lg font-mono text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? "bg-indigo-600/90 text-white border border-indigo-500/50 shadow-sm shadow-indigo-900/40"
                    : "bg-slate-950/60 border border-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {pageNum}
              </button>
            );
          })}
        </div>

        {/* Next Page */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          title="Next Page"
          className="p-1.5 rounded-lg bg-slate-950/60 border border-slate-800 text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-slate-950/60 disabled:hover:text-slate-400 transition-colors cursor-pointer"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* Last Page */}
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          title="Last Page"
          className="p-1.5 rounded-lg bg-slate-950/60 border border-slate-800 text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-slate-950/60 disabled:hover:text-slate-400 transition-colors cursor-pointer"
        >
          <ChevronsRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
