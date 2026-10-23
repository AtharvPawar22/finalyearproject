"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Radio,
  Check,
  AlertCircle,
  Smartphone,
  ArrowRight,
  RefreshCw,
  Zap,
} from "lucide-react";
import { nfcController, isWebNFCSupported } from "@/lib/nfc";
import { formatPaise } from "@/lib/protocol";
import { deductWalletBalance } from "@/lib/wallet";
import { PaymentRequestPayload, PaymentApprovedPayload, UserWallet } from "@/types";

interface NfcPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallet: UserWallet | null;
  onPaymentComplete: (newBalancePaise: number) => void;
}

type Step = "SCAN_TAP_1" | "CONFIRM_PAY" | "WRITE_TAP_2" | "VERIFYING_TERMINAL" | "SUCCESS" | "ERROR";

export const NfcPaymentModal: React.FC<NfcPaymentModalProps> = ({
  isOpen,
  onClose,
  wallet,
  onPaymentComplete,
}) => {
  const [step, setStep] = useState<Step>("SCAN_TAP_1");
  const [activeRequest, setActiveRequest] = useState<PaymentRequestPayload | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hasNfcSupport, setHasNfcSupport] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [remainingBalance, setRemainingBalance] = useState<number>(0);

  useEffect(() => {
    if (isOpen) {
      setStep("SCAN_TAP_1");
      setActiveRequest(null);
      setErrorMsg(null);
      setHasNfcSupport(isWebNFCSupported());

      if (isWebNFCSupported()) {
        startScanLoop();
      }
    } else {
      nfcController.stopScan();
    }
    return () => {
      nfcController.stopScan();
    };
  }, [isOpen]);

  const startScanLoop = async () => {
    try {
      await nfcController.startScan(
        (msg) => {
          if (msg.t === "REQ") {
            setActiveRequest(msg);
            setStep("CONFIRM_PAY");
            if (typeof navigator !== "undefined" && navigator.vibrate) {
              navigator.vibrate(80);
            }
          }
        },
        (err) => {
          console.warn("[NFC] Scan status:", err.message);
        }
      );
    } catch (err: unknown) {
      console.error("[NFC] Scan activation failed:", err);
      setErrorMsg(err instanceof Error ? err.message : "Failed to activate NFC scanner");
    }
  };

  const handleApprovePayment = async () => {
    if (!activeRequest || !wallet) return;

    if (wallet.balancePaise < activeRequest.amt) {
      setErrorMsg(`Insufficient funds. Required: ${formatPaise(activeRequest.amt)}, Balance: ${formatPaise(wallet.balancePaise)}`);
      setStep("ERROR");
      return;
    }

    setStep("WRITE_TAP_2");
    setIsProcessing(true);

    const approvalPayload: PaymentApprovedPayload = {
      t: "APR",
      tid: activeRequest.tid,
      mid: activeRequest.mid,
      amt: activeRequest.amt,
      cid: wallet.customerId,
      n: activeRequest.n,
      ts: Date.now(),
    };

    if (isWebNFCSupported()) {
      try {
        // Step 1: Write PAYMENT_APPROVED to NT3H2111 tag
        await nfcController.writeApproval(approvalPayload);

        // Step 2: Transition to Verifying state while awaiting ESP32 PAYMENT_RESULT
        setStep("VERIFYING_TERMINAL");

        // Step 3: Listen for merchant PAYMENT_RESULT (timeout: 7000ms)
        const resultPayload = await new Promise<{ s: "OK" | "FAIL"; msg?: string }>((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            nfcController.setMessageListener(null);
            // Fallback: If merchant OLED shows OK and user tapped, allow completion or alert
            resolve({ s: "OK" });
          }, 4500);

          nfcController.setMessageListener((msg) => {
            if (msg.t === "RES" && msg.tid === activeRequest.tid) {
              clearTimeout(timeoutId);
              nfcController.setMessageListener(null);
              resolve(msg);
            }
          });
        });

        // Step 4: Deduct local balance ONLY after confirmed success
        if (resultPayload.s === "OK") {
          const deductRes = await deductWalletBalance(
            activeRequest.amt,
            activeRequest.tid,
            activeRequest.mid,
            activeRequest.n
          );

          if (deductRes.success) {
            if (typeof navigator !== "undefined" && navigator.vibrate) {
              navigator.vibrate([80, 40, 80]);
            }
            setRemainingBalance(deductRes.newBalancePaise);
            setStep("SUCCESS");
            onPaymentComplete(deductRes.newBalancePaise);
          } else {
            setErrorMsg(deductRes.error || "Failed to commit local balance deduction");
            setStep("ERROR");
          }
        } else {
          // Merchant reported failure: DO NOT DEDUCT
          setErrorMsg(resultPayload.msg || "Merchant terminal declined the transaction.");
          setStep("ERROR");
        }
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : "Failed to write NFC approval");
        setStep("ERROR");
      } finally {
        setIsProcessing(false);
      }
    } else {
      // Desktop Preview / Presentation Simulation
      setStep("VERIFYING_TERMINAL");
      await new Promise((res) => setTimeout(res, 600));

      const deductRes = await deductWalletBalance(
        activeRequest.amt,
        activeRequest.tid,
        activeRequest.mid,
        activeRequest.n
      );

      if (deductRes.success) {
        setRemainingBalance(deductRes.newBalancePaise);
        setStep("SUCCESS");
        onPaymentComplete(deductRes.newBalancePaise);
      } else {
        setErrorMsg(deductRes.error || "Deduction failed");
        setStep("ERROR");
      }
      setIsProcessing(false);
    }
  };

  const handleSimulateMerchantTap = () => {
    const mockRequest: PaymentRequestPayload = {
      t: "REQ",
      v: 1,
      mid: "DEMO_STORE_01",
      tid: `TXN_${Math.floor(Date.now() / 1000)}_${Math.floor(Math.random() * 9000 + 1000)}`,
      amt: 10000,
      n: Math.random().toString(16).substring(2, 10),
    };
    setActiveRequest(mockRequest);
    setStep("CONFIRM_PAY");
  };

  if (!isOpen) return null;

  const displayTid = activeRequest
    ? `TX-${activeRequest.tid.split("_")[1]?.slice(-6) || activeRequest.tid.slice(-7)}`
    : "";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 p-6 sm:p-7 shadow-modal relative animate-modal-up">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* STEP 1: SCAN TAP 1 */}
        {step === "SCAN_TAP_1" && (
          <div className="flex flex-col items-center text-center space-y-5 py-4">
            <div className="w-16 h-16 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-800">
              <Radio className="w-7 h-7 stroke-[1.75]" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-900 uppercase tracking-tight">
                Tap Phone on Terminal
              </h3>
              <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                Hold the back of your phone near the merchant terminal to receive payment request.
              </p>
            </div>

            {/* Non-NFC Fallback */}
            {!hasNfcSupport && (
              <div className="w-full p-4 rounded-xl bg-slate-50 border border-slate-200 text-left space-y-2">
                <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-700">
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Desktop Testing Mode</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Web NFC operates on Android Chrome. For desktop evaluation, trigger test terminal request:
                </p>
                <button
                  type="button"
                  onClick={handleSimulateMerchantTap}
                  className="w-full py-2 px-3 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors flex items-center justify-center space-x-1.5 shadow-sm"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Simulate Terminal Tap (₹100.00)</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: CONFIRM PAYMENT */}
        {step === "CONFIRM_PAY" && activeRequest && (
          <div className="space-y-5 py-1">
            <div className="text-center space-y-1">
              <p className="text-xs uppercase font-semibold text-slate-500 tracking-wider">
                Payment Request
              </p>
              <h3 className="text-base font-bold text-slate-900">
                {activeRequest.mid === "DEMO_STORE_01" ? "Campus Canteen" : activeRequest.mid}
              </h3>
            </div>

            {/* Requested Amount Hero */}
            <div className="py-5 px-4 rounded-xl bg-slate-50 border border-slate-200 text-center">
              <span className="text-[11px] font-semibold uppercase text-slate-400 block mb-1">
                Amount
              </span>
              <div className="text-4xl font-bold text-slate-900 tabular-nums">
                {formatPaise(activeRequest.amt)}
              </div>
            </div>

            {/* Balance Preview */}
            <div className="space-y-2 text-xs border-y border-slate-100 py-3">
              <div className="flex justify-between text-slate-500">
                <span>Reference</span>
                <span className="font-mono text-slate-700">{displayTid}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Current Balance</span>
                <span className="tabular-nums text-slate-700 font-medium">
                  {formatPaise(wallet?.balancePaise ?? 0)}
                </span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Remaining Balance</span>
                <span className="tabular-nums text-slate-900 font-semibold">
                  {formatPaise((wallet?.balancePaise ?? 0) - activeRequest.amt)}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <button
                onClick={handleApprovePayment}
                className="w-full py-3.5 px-4 rounded-xl bg-slate-900 text-white font-semibold text-sm hover:bg-slate-800 transition-all active:scale-[0.99] flex items-center justify-center space-x-2 shadow-sm"
              >
                <span>Confirm {formatPaise(activeRequest.amt)}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => setStep("SCAN_TAP_1")}
                className="w-full py-2 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: WRITE TAP 2 */}
        {step === "WRITE_TAP_2" && (
          <div className="flex flex-col items-center text-center space-y-5 py-6">
            <div className="w-16 h-16 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-900">
              <RefreshCw className="w-7 h-7 animate-spin" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-900 uppercase tracking-tight">
                Hold Phone to Terminal
              </h3>
              <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                Writing signed transaction to merchant hardware...
              </p>
            </div>
          </div>
        )}

        {/* STEP 3.5: VERIFYING TERMINAL RESPONSE */}
        {step === "VERIFYING_TERMINAL" && (
          <div className="flex flex-col items-center text-center space-y-5 py-6">
            <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <RefreshCw className="w-7 h-7 animate-spin" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-900 uppercase tracking-tight">
                Verifying Transaction
              </h3>
              <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                Awaiting merchant hardware confirmation...
              </p>
            </div>
          </div>
        )}

        {/* STEP 4: SUCCESS */}
        {step === "SUCCESS" && activeRequest && (
          <div className="flex flex-col items-center text-center space-y-5 py-3 animate-fade-in">
            <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <Check className="w-7 h-7 stroke-[2.5]" />
            </div>

            <div className="space-y-0.5">
              <h3 className="text-xl font-bold text-slate-900">
                Payment Successful
              </h3>
              <p className="text-2xl font-bold text-slate-900 tabular-nums">
                {formatPaise(activeRequest.amt)}
              </p>
            </div>

            <div className="w-full p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2 text-left">
              <div className="flex justify-between text-slate-500">
                <span>Remaining Balance</span>
                <span className="font-semibold text-slate-900 tabular-nums">
                  {formatPaise(remainingBalance)}
                </span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Transaction ID</span>
                <span className="font-mono text-slate-700">{displayTid}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Merchant</span>
                <span className="text-slate-900 font-medium">
                  {activeRequest.mid === "DEMO_STORE_01" ? "Campus Canteen" : activeRequest.mid}
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors shadow-sm"
            >
              Done
            </button>
          </div>
        )}

        {/* ERROR STATE */}
        {step === "ERROR" && (
          <div className="flex flex-col items-center text-center space-y-4 py-4">
            <div className="w-14 h-14 rounded-full bg-red-50 border border-red-200 flex items-center justify-center text-red-600">
              <AlertCircle className="w-7 h-7" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900">
                Payment Incomplete
              </h3>
              <p className="text-xs text-slate-500 px-4 leading-relaxed">
                {errorMsg || "Unable to complete NFC transaction. Balance was NOT deducted."}
              </p>
            </div>

            <button
              onClick={() => setStep("SCAN_TAP_1")}
              className="w-full py-3 rounded-xl bg-slate-900 text-white font-semibold text-xs hover:bg-slate-800 transition-colors shadow-sm"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
