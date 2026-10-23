"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Smartphone, Store, ArrowRight, ShieldCheck } from "lucide-react";

interface RoleSelectionModalProps {
  isOpen: boolean;
  onSelectCustomer: () => void;
}

export const RoleSelectionModal: React.FC<RoleSelectionModalProps> = ({
  isOpen,
  onSelectCustomer,
}) => {
  const router = useRouter();

  if (!isOpen) return null;

  const handleSelectCustomer = () => {
    try {
      localStorage.setItem("netzero_device_role", "customer");
    } catch {}
    onSelectCustomer();
  };

  const handleSelectMerchant = () => {
    try {
      localStorage.setItem("netzero_device_role", "merchant");
    } catch {}
    router.push("/terminal");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-sm bg-white rounded-3xl border border-slate-200 p-6 shadow-2xl space-y-5 animate-modal-up">
        {/* Brand Header */}
        <div className="text-center space-y-1.5 pt-1">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white font-mono text-sm font-bold flex items-center justify-center mx-auto shadow-md">
            NZ
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            NETZERO PAY
          </h2>
          <p className="text-xs text-slate-500 max-w-xs mx-auto">
            Choose device role for this demonstration:
          </p>
        </div>

        {/* Roles Selection Cards */}
        <div className="space-y-3">
          {/* Option 1: Customer Wallet */}
          <button
            type="button"
            onClick={handleSelectCustomer}
            className="w-full p-4 rounded-2xl bg-slate-50 hover:bg-slate-100/80 border border-slate-200/90 text-left transition-all active:scale-[0.98] flex items-center justify-between group shadow-sm"
          >
            <div className="flex items-center space-x-3.5">
              <div className="w-11 h-11 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 shadow-sm">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 group-hover:text-black">
                  Customer Wallet
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                  Offline balance vault, simulated tap & sync
                </p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-slate-800 transition-colors shrink-0" />
          </button>

          {/* Option 2: Merchant Terminal */}
          <button
            type="button"
            onClick={handleSelectMerchant}
            className="w-full p-4 rounded-2xl bg-[#0D0D0D] text-white hover:bg-black border border-slate-800 text-left transition-all active:scale-[0.98] flex items-center justify-between group shadow-sm"
          >
            <div className="flex items-center space-x-3.5">
              <div className="w-11 h-11 rounded-xl bg-white/10 text-emerald-400 border border-white/15 flex items-center justify-center shrink-0">
                <Store className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white group-hover:text-emerald-300">
                  Merchant Terminal (POS)
                </h3>
                <p className="text-[11px] text-white/60 mt-0.5 leading-snug">
                  Charge amounts, receive taps & view balance
                </p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-white/40 group-hover:text-white transition-colors shrink-0" />
          </button>
        </div>

        {/* Footer info */}
        <div className="flex items-center space-x-1.5 text-[10px] text-slate-400 justify-center pt-1 border-t border-slate-100">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>You can switch between Customer & Merchant at any time</span>
        </div>
      </div>
    </div>
  );
};
