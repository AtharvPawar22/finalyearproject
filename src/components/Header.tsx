"use client";

import React from "react";
import Link from "next/link";
import { SlidersHorizontal, Store, RefreshCw } from "lucide-react";

interface HeaderProps {
  isOnline: boolean;
  onOpenProfile?: () => void;
  onOpenRoleModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ isOnline, onOpenRoleModal }) => {
  return (
    <header className="w-full bg-[#F8F9FA] px-5 pt-5 pb-3 sticky top-0 z-30">
      <div className="max-w-md mx-auto flex items-center justify-between">
        {/* Brand */}
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-base font-bold tracking-tight text-slate-900">
              NETZERO
            </span>
            <span
              className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                isOnline
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-700"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isOnline ? "bg-emerald-500" : "bg-amber-500"
                }`}
              />
              <span>{isOnline ? "ONLINE" : "OFFLINE"}</span>
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Customer Wallet · Contactless
          </p>
        </div>

        {/* Navigation & Mode Switch Links */}
        <div className="flex items-center space-x-1.5">
          {onOpenRoleModal ? (
            <button
              onClick={onOpenRoleModal}
              title="Switch Device Role"
              className="px-2.5 py-1.5 rounded-full bg-white border border-slate-200/80 flex items-center space-x-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:border-slate-300 transition-colors shadow-subtle"
            >
              <Store className="w-3.5 h-3.5 text-slate-600" />
              <span>Switch Mode</span>
            </button>
          ) : (
            <Link
              href="/terminal"
              title="Open Merchant Terminal"
              className="px-2.5 py-1.5 rounded-full bg-white border border-slate-200/80 flex items-center space-x-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:border-slate-300 transition-colors shadow-subtle"
            >
              <Store className="w-3.5 h-3.5 text-slate-600" />
              <span>Terminal</span>
            </Link>
          )}

          <Link
            href="/test-nfc"
            title="Hardware Diagnostics"
            className="w-8 h-8 rounded-full bg-white border border-slate-200/80 flex items-center justify-center text-slate-500 hover:text-slate-900 hover:border-slate-300 transition-colors shadow-subtle"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </header>
  );
};
