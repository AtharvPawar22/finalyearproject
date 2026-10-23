"use client";

import React, { useState } from "react";
import { X, Check, ArrowRight, ShieldCheck, Lock } from "lucide-react";
import { addSimulatedFunds } from "@/lib/wallet";
import { formatPaise, rupeesToPaise } from "@/lib/protocol";

interface AddMoneyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newBalancePaise: number) => void;
}

const PRESET_AMOUNTS = [100, 200, 500, 1000];

export const AddMoneyModal: React.FC<AddMoneyModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [step, setStep] = useState<"SELECT_AMOUNT" | "SIMULATED_UPI_PIN" | "SUCCESS">("SELECT_AMOUNT");
  const [selectedRupees, setSelectedRupees] = useState<number>(500);
  const [customInput, setCustomInput] = useState<string>("");
  const [upiPin, setUpiPin] = useState<string>("1234");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentAmountPaise = customInput
    ? rupeesToPaise(customInput)
    : selectedRupees * 100;

  const handleProceedToUpi = () => {
    if (currentAmountPaise <= 0) {
      setErrorMessage("Please select or enter a valid amount.");
      return;
    }
    setErrorMessage(null);
    setStep("SIMULATED_UPI_PIN");
  };

  const handleConfirmUpiDeposit = async () => {
    if (upiPin.length < 4) {
      setErrorMessage("Please enter 4-digit UPI PIN (Demo: 1234)");
      return;
    }

    try {
      setIsProcessing(true);
      setErrorMessage(null);
      await new Promise((res) => setTimeout(res, 450));
      const newBal = await addSimulatedFunds(currentAmountPaise);
      setStep("SUCCESS");
      setTimeout(() => {
        setStep("SELECT_AMOUNT");
        setCustomInput("");
        setUpiPin("1234");
        onSuccess(newBal);
        onClose();
      }, 900);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Deposit failed");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    setStep("SELECT_AMOUNT");
    setErrorMessage(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 p-6 sm:p-7 shadow-modal relative animate-modal-up">
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* STEP 1: SELECT AMOUNT */}
        {step === "SELECT_AMOUNT" && (
          <div>
            <div className="mb-5">
              <h3 className="text-lg font-bold text-slate-900">
                Add Funds
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Simulate funding offline wallet balance
              </p>
            </div>

            <div className="space-y-5">
              {/* Presets */}
              <div>
                <span className="text-xs font-semibold text-slate-600 block mb-2">
                  Select Amount
                </span>
                <div className="grid grid-cols-4 gap-2">
                  {PRESET_AMOUNTS.map((amt) => {
                    const isSelected = !customInput && selectedRupees === amt;
                    return (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => {
                          setSelectedRupees(amt);
                          setCustomInput("");
                          setErrorMessage(null);
                        }}
                        className={`py-2.5 px-2 rounded-xl text-xs font-semibold border transition-all ${
                          isSelected
                            ? "bg-slate-900 text-white border-slate-900 shadow-subtle"
                            : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        ₹{amt}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Input */}
              <div>
                <span className="text-xs font-semibold text-slate-600 block mb-1.5">
                  Or Custom Amount
                </span>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-sm font-medium text-slate-400">
                    ₹
                  </span>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={customInput}
                    onChange={(e) => {
                      setCustomInput(e.target.value);
                      setErrorMessage(null);
                    }}
                    className="w-full pl-8 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 transition-colors"
                  />
                </div>
              </div>

              {errorMessage && (
                <p className="text-xs text-red-600 font-medium">{errorMessage}</p>
              )}

              {/* Proceed to Simulated UPI */}
              <button
                onClick={handleProceedToUpi}
                disabled={currentAmountPaise <= 0}
                className="w-full py-3.5 px-4 rounded-xl bg-slate-900 text-white font-semibold text-sm hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.99] flex items-center justify-center space-x-2 shadow-sm"
              >
                <span>Proceed with {formatPaise(currentAmountPaise)}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: SIMULATED UPI FLOW */}
        {step === "SIMULATED_UPI_PIN" && (
          <div className="space-y-5">
            <div>
              <div className="flex items-center space-x-1.5 text-xs text-emerald-700 font-semibold mb-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>SIMULATED UPI GATEWAY</span>
              </div>
              <h3 className="text-lg font-bold text-slate-900">
                Authorize {formatPaise(currentAmountPaise)}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                College demo simulation · No real bank account debited
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex justify-between text-xs text-slate-600">
                <span>Account</span>
                <span className="font-semibold text-slate-900">State Bank Demo ···· 4821</span>
              </div>
              <div className="flex justify-between text-xs text-slate-600">
                <span>Deposit Amount</span>
                <span className="font-bold text-slate-900 tabular-nums">
                  {formatPaise(currentAmountPaise)}
                </span>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">
                Enter 4-Digit UPI PIN (Simulation)
              </label>
              <div className="relative">
                <input
                  type="password"
                  maxLength={4}
                  value={upiPin}
                  onChange={(e) => {
                    setUpiPin(e.target.value);
                    setErrorMessage(null);
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-base font-mono tracking-widest text-slate-900 focus:outline-none focus:border-slate-400 transition-colors"
                  placeholder="••••"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Demo UPI PIN: <span className="font-mono text-slate-600">1234</span>
              </p>
            </div>

            {errorMessage && (
              <p className="text-xs text-red-600 font-medium">{errorMessage}</p>
            )}

            <div className="space-y-2">
              <button
                onClick={handleConfirmUpiDeposit}
                disabled={isProcessing}
                className="w-full py-3.5 px-4 rounded-xl bg-slate-900 text-white font-semibold text-sm hover:bg-slate-800 disabled:opacity-40 transition-all active:scale-[0.99] flex items-center justify-center space-x-2 shadow-sm"
              >
                <span>{isProcessing ? "Authorizing Deposit..." : "Authorize Deposit"}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => setStep("SELECT_AMOUNT")}
                disabled={isProcessing}
                className="w-full py-2 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: SUCCESS */}
        {step === "SUCCESS" && (
          <div className="py-8 flex flex-col items-center justify-center text-center space-y-2 animate-fade-in">
            <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <Check className="w-6 h-6 stroke-[2.5]" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              Deposit Successful
            </h3>
            <p className="text-sm font-semibold text-slate-700">
              Added {formatPaise(currentAmountPaise)} to offline wallet
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
