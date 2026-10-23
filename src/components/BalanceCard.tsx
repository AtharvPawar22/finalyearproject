"use client";

import React from "react";
import { Plus, Radio, Check, RefreshCw } from "lucide-react";
import { formatPaise } from "@/lib/protocol";
import { UserWallet } from "@/types";

interface BalanceCardProps {
  wallet: UserWallet | null;
  onOpenPay: () => void;
  onOpenAddMoney: () => void;
  onOpenSync: () => void;
  pendingSyncCount: number;
  isOnline: boolean;
}

export const BalanceCard: React.FC<BalanceCardProps> = ({
  wallet,
  onOpenPay,
  onOpenAddMoney,
  onOpenSync,
  pendingSyncCount,
  isOnline,
}) => {
  const balancePaise = wallet?.balancePaise ?? 0;

  return (
    <div className="w-full bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-card space-y-5">
      {/* Balance Block */}
      <div>
        <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 block mb-1">
          Available Balance
        </span>
        <div className="flex items-baseline space-x-2">
          <h2 className="text-4xl sm:text-[42px] font-bold tracking-tight text-slate-900 tabular-nums">
            {formatPaise(balancePaise)}
          </h2>
          <span className="text-xs font-semibold text-slate-400 uppercase">
            INR
          </span>
        </div>
        <div className="flex items-center space-x-1.5 text-xs text-slate-500 mt-2">
          <span className="font-medium text-slate-700">OFFLINE WALLET</span>
          <span>·</span>
          <span className="text-emerald-700 font-medium">Ready for payment</span>
        </div>
      </div>

      {/* Primary Payment Action */}
      <button
        onClick={onOpenPay}
        className="w-full py-3.5 px-4 rounded-xl bg-slate-900 text-white font-semibold text-sm flex items-center justify-center space-x-2.5 hover:bg-slate-800 active:scale-[0.99] transition-all shadow-sm"
      >
        <Radio className="w-4 h-4 text-emerald-400" />
        <span>Tap to Pay</span>
      </button>

      {/* Secondary Actions & Sync Row */}
      <div className="flex items-center justify-between pt-1 border-t border-slate-100">
        <button
          onClick={onOpenAddMoney}
          className="flex items-center space-x-1.5 py-2 px-3 rounded-lg hover:bg-slate-50 text-xs font-medium text-slate-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5 text-slate-500" />
          <span>Add Funds</span>
        </button>

        {/* Clean Synchronization Indicator / Trigger */}
        {pendingSyncCount > 0 ? (
          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-500">
              {pendingSyncCount} ready to sync
            </span>
            <button
              onClick={onOpenSync}
              className="py-1 px-2.5 rounded-md bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-800 transition-colors"
            >
              Sync
            </button>
          </div>
        ) : (
          <div className="flex items-center space-x-1 text-xs text-slate-400">
            <Check className="w-3.5 h-3.5 text-emerald-600" />
            <span>Up to date</span>
          </div>
        )}
      </div>
    </div>
  );
};
