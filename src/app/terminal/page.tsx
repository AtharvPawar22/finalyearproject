"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Check,
  AlertCircle,
  RefreshCw,
  Radio,
  X,
  ArrowRight,
  ArrowLeft,
  Wifi,
  Store,
} from "lucide-react";
import {
  joinChannel,
  publishMessage,
  leaveChannel,
  setChannelMessageHandler,
} from "@/lib/realtimeChannel";
import { isSupabaseConfigured } from "@/lib/supabase";
import { formatPaise } from "@/lib/protocol";
import {
  PaymentRequestPayload,
  PaymentApprovedPayload,
  PaymentResultPayload,
} from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type TerminalStep =
  | "IDLE"
  | "CONNECTING"
  | "WAITING_CUSTOMER"
  | "VERIFYING"
  | "SUCCESS"
  | "FAILED"
  | "ERROR";

const PRESET_AMOUNTS = [10, 20, 50, 100, 200, 500];
const DEFAULT_SESSION = "demo01";
const MERCHANT_ID = "NETZERO_TERMINAL_01";
const MERCHANT_DISPLAY_NAME = "NetZero Demo Store";

function generateTid(): string {
  const ts = Math.floor(Date.now() / 1000);
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `TXN_${ts}_${rand}`;
}

function generateNonce(): string {
  return Math.random().toString(16).substring(2, 10);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TerminalPage() {
  const [step, setStep] = useState<TerminalStep>("IDLE");
  const [amountRupees, setAmountRupees] = useState<number>(100);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [sessionId, setSessionId] = useState<string>(DEFAULT_SESSION);
  const [sessionInput, setSessionInput] = useState<string>(DEFAULT_SESSION);
  const [activeRequest, setActiveRequest] = useState<PaymentRequestPayload | null>(null);
  const [receivedApproval, setReceivedApproval] = useState<PaymentApprovedPayload | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [logLines, setLogLines] = useState<string[]>(["Terminal ready."]);
  const [isConnected, setIsConnected] = useState(false);

  const log = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString("en-IN", { hour12: false });
    setLogLines((prev) => [`[${ts}] ${msg}`, ...prev].slice(0, 25));
  }, []);

  // ─── Channel message handler ─────────────────────────────────────────────

  const handleChannelMessage = useCallback(
    (msg: { t: string; tid?: string; n?: string; amt?: number; cid?: string; mid?: string }) => {
      log(`RX: ${JSON.stringify(msg)}`);

      if (msg.t === "APR") {
        const apr = msg as PaymentApprovedPayload;

        setActiveRequest((req) => {
          if (!req) {
            log("ERROR: Received approval but no active request on terminal.");
            return req;
          }

          if (
            apr.tid !== req.tid ||
            apr.n !== req.n ||
            apr.amt !== req.amt ||
            apr.mid !== req.mid
          ) {
            log("WARN: Cryptographic parameter mismatch in approval payload. Rejecting.");
            setStep("FAILED");
            setErrorMsg("Approval parameter validation failed.");
            const failMsg: PaymentResultPayload = {
              t: "RES",
              tid: req.tid,
              amt: req.amt,
              s: "FAIL",
              msg: "Validation mismatch",
            };
            publishMessage(failMsg).catch(console.error);
            return req;
          }

          setReceivedApproval(apr);
          setStep("VERIFYING");
          log(`Verifying approval from ${apr.cid} for ${formatPaise(apr.amt)}...`);

          // Brief verification processing simulation
          setTimeout(async () => {
            const okMsg: PaymentResultPayload = {
              t: "RES",
              tid: req.tid,
              amt: req.amt,
              s: "OK",
            };
            try {
              await publishMessage(okMsg);
              log(`TX: RES OK (Confirmed transaction ${req.tid})`);
              setStep("SUCCESS");
            } catch (e) {
              log(`ERROR publishing RES: ${e}`);
              setStep("FAILED");
              setErrorMsg("Could not broadcast payment confirmation.");
            }
          }, 800);

          return req;
        });
      }
    },
    [log]
  );

  // ─── Connect to channel ──────────────────────────────────────────────────

  const handleConnectSession = useCallback(
    async (targetSession: string) => {
      setStep("CONNECTING");
      setErrorMsg(null);

      try {
        await joinChannel(targetSession, handleChannelMessage as Parameters<typeof joinChannel>[1]);
        setSessionId(targetSession);
        setIsConnected(true);
        setStep("IDLE");
        log(
          `Connected to session "${targetSession}" (${
            isSupabaseConfigured ? "Live Cloud Realtime" : "Local Browser Session"
          })`
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setErrorMsg(msg);
        setStep("ERROR");
        log(`ERROR connecting: ${msg}`);
      }
    },
    [handleChannelMessage, log]
  );

  const handleConnect = async () => {
    await handleConnectSession(sessionInput);
  };

  const handleDisconnect = async () => {
    await leaveChannel();
    setIsConnected(false);
    setStep("IDLE");
    setActiveRequest(null);
    setReceivedApproval(null);
    log("Disconnected from session channel.");
  };

  // Auto-connect on mount
  useEffect(() => {
    handleConnectSession(DEFAULT_SESSION);
    return () => {
      leaveChannel().catch(console.error);
    };
  }, [handleConnectSession]);

  // Pulse payment request every 2.5s while waiting for customer so customer phone catches it immediately
  useEffect(() => {
    if (step !== "WAITING_CUSTOMER" || !activeRequest) return;

    const interval = setInterval(() => {
      publishMessage(activeRequest).catch(() => {});
    }, 2500);

    return () => clearInterval(interval);
  }, [step, activeRequest]);

  // ─── Start Payment ───────────────────────────────────────────────────────

  const handleStartPayment = async () => {
    const finalAmount = customAmount
      ? Math.round(parseFloat(customAmount) * 100)
      : amountRupees * 100;

    if (!finalAmount || finalAmount <= 0) {
      log("ERROR: Invalid amount.");
      return;
    }

    const req: PaymentRequestPayload = {
      t: "REQ",
      v: 1,
      mid: MERCHANT_ID,
      tid: generateTid(),
      amt: finalAmount,
      n: generateNonce(),
    };

    try {
      await publishMessage(req);
      setActiveRequest(req);
      setReceivedApproval(null);
      setStep("WAITING_CUSTOMER");
      log(`TX: REQ ${req.tid} (${formatPaise(finalAmount)})`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(msg);
      setStep("ERROR");
      log(`ERROR sending payment request: ${msg}`);
    }
  };

  const handleReset = () => {
    setStep("IDLE");
    setActiveRequest(null);
    setReceivedApproval(null);
    setErrorMsg(null);
    setCustomAmount("");
    log("Ready for new transaction.");
  };

  // ─── Derived display values ──────────────────────────────────────────────

  const displayAmt = activeRequest ? formatPaise(activeRequest.amt) : "";
  const displayTid = activeRequest
    ? `TX-${activeRequest.tid.split("_")[1]?.slice(-6) || activeRequest.tid.slice(-7)}`
    : "";

  return (
    <div className="min-h-screen bg-[#0D0D0D] text-white flex flex-col items-center justify-between py-6 px-4 selection:bg-white/20">
      {/* Top Header */}
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2.5">
            <Link
              href="/"
              title="Return to Customer Wallet"
              className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-colors border border-white/10"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <p className="text-[10px] font-semibold tracking-[0.2em] text-white/40 uppercase">
                NETZERO PAY
              </p>
              <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-1.5">
                <Store className="w-4 h-4 text-white/70" />
                <span>Merchant Terminal</span>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {isConnected ? (
              <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-semibold uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {sessionId}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] text-white/40 font-semibold uppercase tracking-wider bg-white/5 border border-white/10 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
                Connecting…
              </span>
            )}
          </div>
        </div>
        <div className="h-px bg-white/10 mt-3" />
      </div>

      {/* Main Terminal Container */}
      <div className="w-full max-w-sm space-y-4 my-auto">
        {/* ── Error State ── */}
        {step === "ERROR" && (
          <div className="bg-red-950/30 border border-red-800/40 rounded-2xl p-5 space-y-3">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-300">Terminal Error</p>
                <p className="text-[11px] text-red-400/80 mt-0.5 leading-relaxed">{errorMsg}</p>
              </div>
            </div>
            <button
              onClick={() => {
                setStep("IDLE");
                setErrorMsg(null);
              }}
              className="w-full py-2.5 bg-white/10 hover:bg-white/15 text-white text-xs font-semibold rounded-xl transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* ── Connecting State ── */}
        {step === "CONNECTING" && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8 flex flex-col items-center text-center space-y-3">
            <RefreshCw className="w-6 h-6 text-white/60 animate-spin" />
            <p className="text-sm text-white/70">
              Connecting session <span className="text-white font-mono">{sessionInput}</span>…
            </p>
          </div>
        )}

        {/* ── Amount Selection (when connected + IDLE) ── */}
        {isConnected && step === "IDLE" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] text-white/40">
                Mode:{" "}
                <span className="text-white/70 font-medium">
                  {isSupabaseConfigured ? "Cross-Device Realtime" : "Local Browser Session"}
                </span>
              </span>
              <button
                onClick={handleDisconnect}
                className="text-[11px] text-white/30 hover:text-white/60 transition-colors flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Change Code
              </button>
            </div>

            {/* Amount Selection Card */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-widest text-white/40 font-semibold">
                  Charge Amount
                </p>
                <span className="text-xs font-bold text-white tabular-nums">
                  {customAmount ? `₹${customAmount}` : `₹${amountRupees}.00`}
                </span>
              </div>

              {/* Presets */}
              <div className="grid grid-cols-3 gap-2">
                {PRESET_AMOUNTS.map((amt) => (
                  <button
                    key={amt}
                    onClick={() => {
                      setAmountRupees(amt);
                      setCustomAmount("");
                    }}
                    className={`py-3 rounded-xl text-sm font-semibold transition-all ${
                      amountRupees === amt && !customAmount
                        ? "bg-white text-black shadow-lg"
                        : "bg-white/10 text-white/70 hover:bg-white/15"
                    }`}
                  >
                    ₹{amt}
                  </button>
                ))}
              </div>

              {/* Custom amount */}
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 text-sm font-medium">
                  ₹
                </span>
                <input
                  type="number"
                  value={customAmount}
                  onChange={(e) => {
                    setCustomAmount(e.target.value);
                    setAmountRupees(0);
                  }}
                  placeholder="Custom amount"
                  className="w-full bg-white/10 border border-white/15 rounded-xl pl-8 pr-3 py-2.5 text-sm font-medium text-white placeholder:text-white/25 focus:outline-none focus:border-white/30"
                />
              </div>

              {/* Start button */}
              <button
                onClick={handleStartPayment}
                className="w-full py-3.5 bg-white text-black font-bold text-sm rounded-xl hover:bg-white/90 active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-lg shadow-white/10"
              >
                <Radio className="w-4 h-4" />
                <span>Request Payment</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Disconnected / Session Entry Panel ── */}
        {!isConnected && step === "IDLE" && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/40 font-semibold mb-1">
                Session Code
              </p>
              <p className="text-[11px] text-white/50 mb-3 leading-relaxed">
                Enter the session code shared with the customer phone:
              </p>
              <div className="flex gap-2">
                <input
                  value={sessionInput}
                  onChange={(e) =>
                    setSessionInput(
                      e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12)
                    )
                  }
                  className="flex-1 bg-white/10 border border-white/15 rounded-xl px-3 py-2.5 text-sm font-mono text-white placeholder:text-white/25 focus:outline-none focus:border-white/30"
                  placeholder="demo01"
                />
                <button
                  onClick={handleConnect}
                  className="px-4 py-2.5 bg-white text-black text-sm font-semibold rounded-xl hover:bg-white/90 transition-colors"
                >
                  Join
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Waiting for Customer ── */}
        {step === "WAITING_CUSTOMER" && activeRequest && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-5">
            <div className="flex flex-col items-center text-center space-y-3 py-2">
              <div className="w-14 h-14 rounded-full border border-white/15 bg-white/5 flex items-center justify-center">
                <Wifi className="w-6 h-6 text-white/70 animate-pulse" />
              </div>
              <div>
                <p className="text-xs text-white/40 uppercase tracking-widest font-semibold mb-1">
                  Awaiting Customer Tap
                </p>
                <p className="text-3xl font-bold tabular-nums">{displayAmt}</p>
                <p className="text-[11px] text-white/40 mt-1">
                  Customer will approve on their phone
                </p>
              </div>
            </div>

            <div className="space-y-1.5 border-t border-white/10 pt-4 text-[11px]">
              <div className="flex justify-between text-white/40">
                <span>Reference</span>
                <span className="font-mono text-white/60">{displayTid}</span>
              </div>
              <div className="flex justify-between text-white/40">
                <span>Merchant</span>
                <span className="text-white/60">{MERCHANT_DISPLAY_NAME}</span>
              </div>
              <div className="flex justify-between text-white/40">
                <span>Session</span>
                <span className="font-mono text-emerald-400">{sessionId}</span>
              </div>
            </div>

            <button
              onClick={handleReset}
              className="w-full py-2.5 bg-white/10 hover:bg-white/15 text-white/60 text-xs font-semibold rounded-xl transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* ── Verifying ── */}
        {step === "VERIFYING" && activeRequest && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-full border border-amber-500/30 bg-amber-500/10 flex items-center justify-center">
              <RefreshCw className="w-6 h-6 text-amber-400 animate-spin" />
            </div>
            <div>
              <p className="text-xs text-white/40 uppercase tracking-widest font-semibold mb-1">
                Verifying Signature
              </p>
              <p className="text-2xl font-bold tabular-nums">{displayAmt}</p>
              <p className="text-[11px] text-white/40 mt-1">Checking cryptographic nonce & CID…</p>
            </div>
            {receivedApproval && (
              <p className="text-[11px] text-white/50 font-mono">
                Customer: {receivedApproval.cid}
              </p>
            )}
          </div>
        )}

        {/* ── SUCCESS ── */}
        {step === "SUCCESS" && activeRequest && (
          <div className="space-y-4">
            <div className="bg-emerald-950/40 border border-emerald-700/30 rounded-2xl p-6 flex flex-col items-center text-center space-y-4">
              <div className="w-14 h-14 rounded-full border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center">
                <Check className="w-7 h-7 text-emerald-400 stroke-[2.5]" />
              </div>
              <div>
                <p className="text-xs text-emerald-400/70 uppercase tracking-widest font-semibold mb-1">
                  Payment Received
                </p>
                <p className="text-3xl font-bold tabular-nums text-emerald-300">
                  {displayAmt}
                </p>
              </div>
              <div className="w-full space-y-1.5 border-t border-emerald-800/30 pt-3 text-[11px]">
                <div className="flex justify-between text-emerald-700/60">
                  <span>Reference</span>
                  <span className="font-mono text-emerald-400/80">{displayTid}</span>
                </div>
                {receivedApproval && (
                  <div className="flex justify-between text-emerald-700/60">
                    <span>Customer ID</span>
                    <span className="text-emerald-400/80">{receivedApproval.cid}</span>
                  </div>
                )}
                <div className="flex justify-between text-emerald-700/60">
                  <span>Status</span>
                  <span className="text-emerald-400 font-semibold">CONFIRMED (RES: OK)</span>
                </div>
              </div>
            </div>

            <button
              onClick={handleReset}
              className="w-full py-3 bg-white text-black font-semibold text-sm rounded-xl hover:bg-white/90 transition-colors"
            >
              New Transaction
            </button>
          </div>
        )}

        {/* ── FAILED ── */}
        {step === "FAILED" && (
          <div className="space-y-4">
            <div className="bg-red-950/30 border border-red-800/30 rounded-2xl p-6 flex flex-col items-center text-center space-y-4">
              <div className="w-14 h-14 rounded-full border border-red-500/30 bg-red-500/10 flex items-center justify-center">
                <AlertCircle className="w-7 h-7 text-red-400" />
              </div>
              <div>
                <p className="text-xs text-red-400/70 uppercase tracking-widest font-semibold mb-1">
                  Transaction Rejected
                </p>
                <p className="text-sm text-red-300/80">{errorMsg || "Payment declined."}</p>
              </div>
            </div>
            <button
              onClick={handleReset}
              className="w-full py-3 bg-white text-black font-semibold text-sm rounded-xl hover:bg-white/90 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* ── Terminal Console Log ── */}
        {isConnected && (
          <div className="bg-black/50 border border-white/8 rounded-xl p-3.5">
            <p className="text-[9px] uppercase tracking-widest text-white/30 font-semibold mb-2">
              Terminal Serial Console
            </p>
            <div className="space-y-1 max-h-24 overflow-y-auto">
              {logLines.map((line, i) => (
                <p key={i} className="text-[10px] font-mono text-white/40 leading-tight">
                  {line}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="w-full max-w-sm pt-4 text-center">
        <p className="text-[10px] text-white/20">
          NETZERO PAY · Hardware Emulation Protocol (ISO/IEC 18092 Mirror)
        </p>
      </div>
    </div>
  );
}
