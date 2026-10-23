"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  Radio,
  Check,
  AlertCircle,
  Smartphone,
  ArrowRight,
  RefreshCw,
  Zap,
  Wifi,
} from "lucide-react";
import { nfcController, isWebNFCSupported } from "@/lib/nfc";
import { formatPaise } from "@/lib/protocol";
import { deductWalletBalance } from "@/lib/wallet";
import {
  joinChannel,
  publishMessage,
  leaveChannel,
  setChannelMessageHandler,
} from "@/lib/realtimeChannel";
import { isSupabaseConfigured } from "@/lib/supabase";
import { PaymentRequestPayload, PaymentApprovedPayload, UserWallet } from "@/types";

interface NfcPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallet: UserWallet | null;
  onPaymentComplete: (newBalancePaise: number) => void;
}

type Step = "SCAN_TAP_1" | "CONFIRM_PAY" | "WRITE_TAP_2" | "VERIFYING_TERMINAL" | "SUCCESS" | "ERROR";
type PayMode = "nfc" | "channel";

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

  // ── Channel (two-phone / two-tab demo) mode ────────────────────────────
  const [payMode, setPayMode] = useState<PayMode>("channel");
  const [sessionInput, setSessionInput] = useState<string>("demo01");
  const [channelConnecting, setChannelConnecting] = useState(false);
  const [channelConnected, setChannelConnected] = useState(false);
  const [channelError, setChannelError] = useState<string | null>(null);

  // Stable callback so it can be passed to joinChannel without recreating channel
  const handleChannelMessage = useCallback(
    (msg: PaymentRequestPayload | { t: string; tid?: string }) => {
      if (msg.t === "REQ") {
        const req = msg as PaymentRequestPayload;
        setActiveRequest((prev) => {
          if (!prev || prev.tid !== req.tid) {
            setStep((s) => (s === "SCAN_TAP_1" ? "CONFIRM_PAY" : s));
            if (typeof navigator !== "undefined" && navigator.vibrate) {
              navigator.vibrate(80);
            }
            return req;
          }
          return prev;
        });
      }
    },
    []
  );

  useEffect(() => {
    if (isOpen) {
      setStep("SCAN_TAP_1");
      setActiveRequest(null);
      setErrorMsg(null);
      const nfcAvailable = isWebNFCSupported();
      setHasNfcSupport(nfcAvailable);
      setChannelError(null);

      // Default mode: if Web NFC is not available, default to channel mode!
      if (!nfcAvailable) {
        setPayMode("channel");
      }

      // Auto-connect to default session if in channel mode
      connectToSession("demo01");

      if (nfcAvailable) {
        startScanLoop();
      }
    } else {
      nfcController.stopScan();
      leaveChannel().catch(console.error);
      setChannelConnected(false);
      setChannelConnecting(false);
    }
    return () => {
      nfcController.stopScan();
      leaveChannel().catch(console.error);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // ── Channel connect ──────────────────────────────────────────────────

  const connectToSession = async (sess: string) => {
    setChannelConnecting(true);
    setChannelError(null);
    try {
      await joinChannel(sess, handleChannelMessage as Parameters<typeof joinChannel>[1]);
      setChannelConnected(true);
      setChannelConnecting(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setChannelError(msg);
      setChannelConnecting(false);
    }
  };

  const handleConnectChannel = async () => {
    await connectToSession(sessionInput);
  };

  // ── Approve payment ──────────────────────────────────────────────────

  const handleApprovePayment = async () => {
    if (!activeRequest || !wallet) return;

    if (wallet.balancePaise < activeRequest.amt) {
      setErrorMsg(
        `Insufficient funds. Required: ${formatPaise(activeRequest.amt)}, Balance: ${formatPaise(wallet.balancePaise)}`
      );
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

    // ── CHANNEL MODE ────────────────────────────────────────────────────
    if (payMode === "channel") {
      try {
        await publishMessage(approvalPayload);
        setStep("VERIFYING_TERMINAL");

        // Wait for RES OK from merchant terminal via channel
        const resultPayload = await new Promise<{ s: "OK" | "FAIL"; msg?: string }>(
          (resolve, reject) => {
            const timeoutId = setTimeout(() => {
              setChannelMessageHandler(handleChannelMessage);
              reject(new Error("Timed out waiting for merchant confirmation (10s)"));
            }, 10000);

            setChannelMessageHandler((msg) => {
              if (msg.t === "RES" && (msg as { tid: string }).tid === activeRequest.tid) {
                clearTimeout(timeoutId);
                setChannelMessageHandler(handleChannelMessage);
                resolve(msg as { s: "OK" | "FAIL"; msg?: string });
              }
            });
          }
        );

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
          setErrorMsg(resultPayload.msg || "Merchant terminal declined the transaction.");
          setStep("ERROR");
        }
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : "Channel payment failed");
        setStep("ERROR");
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // ── NFC MODE ────────────────────────────────────────────────────────
    if (isWebNFCSupported()) {
      try {
        await nfcController.writeApproval(approvalPayload);
        setStep("VERIFYING_TERMINAL");

        const resultPayload = await new Promise<{ s: "OK" | "FAIL"; msg?: string }>(
          (resolve, reject) => {
            const timeoutId = setTimeout(() => {
              nfcController.setMessageListener(null);
              resolve({ s: "OK" });
            }, 4500);

            nfcController.setMessageListener((msg) => {
              if (msg.t === "RES" && msg.tid === activeRequest.tid) {
                clearTimeout(timeoutId);
                nfcController.setMessageListener(null);
                resolve(msg);
              }
            });
          }
        );

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

  const merchantDisplayName =
    activeRequest?.mid === "DEMO_STORE_01"
      ? "Campus Canteen"
      : activeRequest?.mid === "NETZERO_TERMINAL_01"
      ? "NetZero Demo Store"
      : activeRequest?.mid ?? "";

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
              {payMode === "channel" ? (
                <Wifi className="w-7 h-7 stroke-[1.75] text-slate-800 animate-pulse" />
              ) : (
                <Radio className="w-7 h-7 stroke-[1.75]" />
              )}
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-900 uppercase tracking-tight">
                {payMode === "channel" ? "Awaiting Payment Request" : "Tap Phone on Terminal"}
              </h3>
              <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                {payMode === "channel"
                  ? "Enter the session code to receive live payment request from Merchant Terminal."
                  : "Hold the back of your phone near the merchant terminal to receive payment request."}
              </p>
            </div>

            {/* Mode toggle: NFC vs Channel */}
            <div className="w-full">
              {/* Tab toggle */}
              <div className="flex border border-slate-200 rounded-xl p-0.5 mb-4 bg-slate-50">
                <button
                  onClick={() => setPayMode("channel")}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    payMode === "channel"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Two-Phone Demo
                </button>
                <button
                  onClick={() => setPayMode("nfc")}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    payMode === "nfc"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  NFC Hardware
                </button>
              </div>

              {/* Channel mode UI */}
              {payMode === "channel" && (
                <div className="w-full p-4 rounded-xl bg-slate-50 border border-slate-200 text-left space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-800">
                      <Wifi className="w-3.5 h-3.5 text-slate-700" />
                      <span>Live Terminal Session</span>
                    </div>
                    {channelConnected && (
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span>Connected</span>
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Set amount on the Merchant Terminal (Phone A) with session code{" "}
                    <span className="font-mono font-medium text-slate-700">{sessionInput}</span>.
                  </p>

                  <div className="flex gap-2">
                    <input
                      value={sessionInput}
                      onChange={(e) =>
                        setSessionInput(
                          e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12)
                        )
                      }
                      className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400"
                      placeholder="demo01"
                    />
                    <button
                      onClick={handleConnectChannel}
                      disabled={channelConnecting}
                      className="px-3.5 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                      {channelConnecting ? "Connecting…" : channelConnected ? "Re-sync" : "Join"}
                    </button>
                  </div>
                  {channelError && (
                    <p className="text-[10px] text-red-600 leading-snug">{channelError}</p>
                  )}

                  <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500">
                    <span>Quick test on this device?</span>
                    <button
                      type="button"
                      onClick={handleSimulateMerchantTap}
                      className="font-semibold text-slate-800 hover:text-black underline"
                    >
                      Trigger ₹100 Test Tap
                    </button>
                  </div>
                </div>
              )}

              {/* NFC mode fallback */}
              {payMode === "nfc" && (
                <div className="w-full p-4 rounded-xl bg-slate-50 border border-slate-200 text-left space-y-2">
                  <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-700">
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>{hasNfcSupport ? "Web NFC Ready" : "Hardware NFC Mode"}</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {hasNfcSupport
                      ? "Hold the back of this phone near the NT3H2111 antenna connected to the ESP32."
                      : "Web NFC requires Android Chrome. For simulation or testing without hardware:"}
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
          </div>
        )}

        {/* STEP 2: CONFIRM PAYMENT */}
        {step === "CONFIRM_PAY" && activeRequest && (
          <div className="space-y-5 py-1">
            <div className="text-center space-y-1">
              <p className="text-xs uppercase font-semibold text-slate-500 tracking-wider">
                Payment Request
              </p>
              <h3 className="text-base font-bold text-slate-900">{merchantDisplayName}</h3>
              {payMode === "channel" && (
                <p className="text-[10px] text-emerald-600 font-medium flex items-center justify-center gap-1">
                  <Wifi className="w-3 h-3" /> Terminal Session · {sessionInput}
                </p>
              )}
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
                {payMode === "channel" ? "Authorizing Payment" : "Hold Phone to Terminal"}
              </h3>
              <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                {payMode === "channel"
                  ? "Transmitting cryptographic approval to merchant terminal…"
                  : "Writing signed transaction to merchant hardware..."}
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
                Awaiting merchant confirmation signature…
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
              <h3 className="text-xl font-bold text-slate-900">Payment Successful</h3>
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
                <span className="text-slate-900 font-medium">{merchantDisplayName}</span>
              </div>
              {payMode === "channel" && (
                <div className="flex justify-between text-slate-500">
                  <span>Channel</span>
                  <span className="text-emerald-700 font-medium flex items-center gap-1 font-mono">
                    <Wifi className="w-3 h-3" /> {sessionInput}
                  </span>
                </div>
              )}
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
              <h3 className="text-base font-bold text-slate-900">Payment Incomplete</h3>
              <p className="text-xs text-slate-500 px-4 leading-relaxed">
                {errorMsg || "Unable to complete transaction. Balance was NOT deducted."}
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
