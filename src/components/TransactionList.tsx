"use client";

import React, { useState } from "react";
import { formatPaise } from "@/lib/protocol";
import { TransactionRecord } from "@/types";

interface TransactionListProps {
  transactions: TransactionRecord[];
  onSelectTransaction?: (txn: TransactionRecord) => void;
}

export const TransactionList: React.FC<TransactionListProps> = ({
  transactions,
  onSelectTransaction,
}) => {
  const [filter, setFilter] = useState<"ALL" | "PAYMENTS" | "CREDITS">("ALL");

  const filtered = transactions.filter((t) => {
    if (filter === "PAYMENTS") return t.type === "PAYMENT";
    if (filter === "CREDITS") return t.type === "CREDIT_SIMULATION";
    return true;
  });

  return (
    <div className="w-full space-y-3">
      {/* Header & Filter Row */}
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-500">
          Activity
        </h3>

        <div className="flex space-x-1 bg-slate-100 p-0.5 rounded-lg text-xs">
          {(["ALL", "PAYMENTS", "CREDITS"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-2.5 py-1 rounded-md transition-all font-medium ${
                filter === tab
                  ? "bg-white text-slate-900 shadow-subtle"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              {tab === "ALL" ? "All" : tab === "PAYMENTS" ? "Spent" : "Added"}
            </button>
          ))}
        </div>
      </div>

      {/* Rows Container */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 text-center shadow-card">
          <p className="text-xs font-medium text-slate-600">
            No transactions yet
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Offline payments will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 divide-y divide-slate-100 shadow-card overflow-hidden">
          {filtered.map((txn) => {
            const isDebit = txn.type === "PAYMENT";
            const dateObj = new Date(txn.timestamp);
            const isToday =
              new Date().toDateString() === dateObj.toDateString();
            const dateStr = isToday
              ? `Today · ${dateObj.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : `${dateObj.toLocaleDateString([], {
                  month: "short",
                  day: "numeric",
                })} · ${dateObj.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`;

            // Clean formatted TID
            const displayTid = txn.tid.startsWith("TXN_")
              ? `TX-${txn.tid.split("_")[1]?.slice(-6) || txn.tid.slice(-7)}`
              : txn.tid.slice(0, 10);

            return (
              <div
                key={txn.tid}
                onClick={() => onSelectTransaction?.(txn)}
                className="p-4 hover:bg-slate-50/70 transition-colors flex items-center justify-between cursor-pointer"
              >
                {/* Left: Merchant & Metadata */}
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-slate-900 leading-tight">
                    {isDebit
                      ? txn.merchantName || "Merchant Terminal"
                      : "Account Deposit"}
                  </p>
                  <p className="text-[11px] text-slate-500 font-normal">
                    {dateStr}
                  </p>
                  <p className="text-[10px] font-mono text-slate-400">
                    {displayTid}
                  </p>
                </div>

                {/* Right: Amount & Status */}
                <div className="text-right space-y-1">
                  <p
                    className={`text-sm font-semibold tabular-nums ${
                      isDebit ? "text-slate-900" : "text-emerald-700"
                    }`}
                  >
                    {isDebit ? "− " : "+ "}
                    {formatPaise(txn.amountPaise)}
                  </p>
                  <div className="flex items-center justify-end space-x-1.5">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        txn.status === "SYNCED"
                          ? "bg-emerald-500"
                          : "bg-amber-500"
                      }`}
                    />
                    <span className="text-[11px] font-medium text-slate-500">
                      {txn.status === "SYNCED" ? "Synced" : "Offline"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
