"use client";

import React, { useState } from "react";
import { Lock, ArrowRight, ShieldCheck } from "lucide-react";

interface DemoLoginModalProps {
  isOpen: boolean;
  onLoginSuccess: (name: string) => void;
}

export const DemoLoginModal: React.FC<DemoLoginModalProps> = ({
  isOpen,
  onLoginSuccess,
}) => {
  const [name, setName] = useState<string>("Atharv (Student Demo)");
  const [pin, setPin] = useState<string>("1234");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin || pin.length < 4) {
      setError("Please enter a 4-digit demo PIN (Default: 1234)");
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      onLoginSuccess(name);
    }, 300);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 p-6 shadow-modal space-y-5 animate-modal-up">
        {/* Header */}
        <div className="text-center space-y-1.5">
          <div className="w-11 h-11 rounded-xl bg-slate-900 text-white font-mono text-sm font-bold flex items-center justify-center mx-auto tracking-tighter">
            NZ
          </div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">
            NETZERO PAY
          </h2>
          <p className="text-xs text-slate-500">
            Offline Contactless Wallet Demo
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">
              Account Holder
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:border-slate-400 transition-colors"
              placeholder="Your Name"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">
              Demo Wallet PIN
            </label>
            <div className="relative">
              <input
                type="password"
                maxLength={4}
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setError(null);
                }}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono tracking-widest text-slate-900 focus:outline-none focus:border-slate-400 transition-colors"
                placeholder="••••"
              />
              <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Default demo PIN: <span className="font-mono text-slate-600">1234</span>
            </p>
          </div>

          {error && (
            <p className="text-xs text-red-600 font-medium">{error}</p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 px-4 rounded-xl bg-slate-900 text-white font-semibold text-sm hover:bg-slate-800 disabled:opacity-40 transition-all flex items-center justify-center space-x-2 shadow-sm active:scale-[0.99]"
          >
            <span>{isSubmitting ? "Authenticating..." : "Enter Offline Wallet"}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="flex items-center space-x-2 text-[11px] text-slate-400 justify-center">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Local IndexedDB Session · No Cloud Sign-in</span>
        </div>
      </div>
    </div>
  );
};
