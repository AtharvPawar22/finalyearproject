"use client";

import React, { useState } from "react";
import { X, RefreshCw, Check } from "lucide-react";
import { syncPendingTransactions, SyncReport } from "@/lib/sync";

interface SyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  isOnline: boolean;
  pendingSyncCount: number;
  onSyncCompleted: () => void;
}

export const SyncModal: React.FC<SyncModalProps> = ({
  isOpen,
  onClose,
  isOnline,
  pendingSyncCount,
  onSyncCompleted,
}) => {
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [report, setReport] = useState<SyncReport | null>(null);

  if (!isOpen) return null;

  const handleSync = async () => {
    if (!isOnline) return;

    try {
      setIsSyncing(true);
      const res = await syncPendingTransactions();
      setReport(res);
      onSyncCompleted();
    } catch (err) {
      console.error("Sync failed:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 p-6 sm:p-7 shadow-modal relative animate-modal-up">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="mb-5">
          <h3 className="text-lg font-bold text-slate-900">
            Cloud Synchronization
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Upload offline payment records to server
          </p>
        </div>

        {/* Sync Summary */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 mb-5">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500">Pending in Offline Queue</span>
            <span className="font-semibold text-slate-900">
              {pendingSyncCount} transaction{pendingSyncCount !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500">Connection Status</span>
            <span
              className={`font-medium px-2 py-0.5 rounded-full text-[11px] ${
                isOnline
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-700"
              }`}
            >
              {isOnline ? "● ONLINE" : "● OFFLINE"}
            </span>
          </div>
        </div>

        {/* Report Alert if synced */}
        {report && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs space-y-1 mb-5">
            <div className="flex items-center space-x-1.5 text-emerald-800 font-semibold">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>Sync Complete</span>
            </div>
            <p className="text-emerald-700 text-[11px]">
              Uploaded {report.syncedCount} queued transaction{report.syncedCount !== 1 ? "s" : ""}.
            </p>
          </div>
        )}

        {/* Sync Action Button */}
        <button
          onClick={handleSync}
          disabled={!isOnline || isSyncing || pendingSyncCount === 0}
          className="w-full py-3.5 px-4 rounded-xl bg-slate-900 text-white font-semibold text-sm hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-[0.99] flex items-center justify-center space-x-2 shadow-sm"
        >
          <RefreshCw
            className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`}
          />
          <span>
            {isSyncing
              ? "Synchronizing..."
              : pendingSyncCount === 0
              ? "Up to Date"
              : `Sync ${pendingSyncCount} Transaction${pendingSyncCount !== 1 ? "s" : ""}`}
          </span>
        </button>
      </div>
    </div>
  );
};
