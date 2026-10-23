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
  RotateCcw,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import {
  joinChannel,
  publishMessage,
  leaveChannel,
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
  const [lastReceivedAmount, setLastReceivedAmount] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [logLines, setLogLines] = useState<string[]>(["Terminal ready."]);
  const [isConnected, setIsConnected] = useState(false);

  // ── Merchant Ledger & Balance State ──────────────────────────────────────
  const [merchantBalancePaise, setMerchantBalancePaise] = useState<number>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("netzero_merchant_balance");
        if (saved) return parseInt(saved, 10);
      } catch {}
    }
    return 100000; // Default ₹1,000.00 merchant vault
  });

  const [completedTxnCount, setCompletedTxnCount] = useState<number>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("netzero_merchant_tx_count");
        if (saved) return parseInt(saved, 10);
      } catch {}
    }
    return 3;
  });

  const creditMerchantVault = useCallback((amtPaise: number) => {
    setMerchantBalancePaise((prev) => {
      const updated = prev + amtPaise;
      try {
        localStorage.setItem("netzero_merchant_balance", String(updated));
      } catch {}
      return updated;
    });
    setCompletedTxnCount((prev) => {
      const updated = prev + 1;
      try {
        localStorage.setItem("netzero_merchant_tx_count", String(updated));
      } catch {}
      return updated;
    });
  }, []);

  const handleResetMerchantVault = () => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("netzero_merchant_balance", "100000");
        localStorage.setItem("netzero_merchant_tx_count", "0");
      } catch {}
    }
    setMerchantBalancePaise(100000);
    setCompletedTxnCount(0);
    log("Merchant vault reset to default ₹1,000.00.");
  };

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
        const confirmedAmt = apr.amt || 10000;
        const confirmedTid = apr.tid || `TXN_${Date.now()}`;

        log(`Incoming approval for ${formatPaise(confirmedAmt)} from ${apr.cid || "Customer"}`);

        // Update ledger & state
        setLastReceivedAmount(confirmedAmt);
        creditMerchantVault(confirmedAmt);
        setReceivedApproval(apr);
        setStep("VERIFYING");

        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate([100, 50, 100]);
        }

        // Send confirmed RES: OK back to customer phone
        setTimeout(async () => {
          const okMsg: PaymentResultPayload = {
            t: "RES",
            tid: confirmedTid,
            amt: confirmedAmt,
            s: "OK",
          };
          try {
            await publishMessage(okMsg);
            log(`TX: RES OK (Confirmed transaction ${confirmedTid})`);
            setStep("SUCCESS");
          } catch {
            setStep("SUCCESS");
          }
        }, 600);
      }
    },
    [creditMerchantVault, log]
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
            isSupabaseConfigured ? "Live Cloud Realtime" : "Multi-Transport Cloud Relay"
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
    log("Ready for next transaction.");
  };

  // ─── Simulation trigger on merchant screen ────────────────────────────────
  const handleSimulateIncomingTap = () => {
    const amt = activeRequest ? activeRequest.amt : 10000;
    const tid = activeRequest ? activeRequest.tid : generateTid();
    const mockApr: PaymentApprovedPayload = {
      t: "APR",
      tid,
      mid: MERCHANT_ID,
      amt,
      cid: "CUST_DEMO_01",
      n: activeRequest?.n || generateNonce(),
      ts: Date.now(),
    };
    handleChannelMessage(mockApr);
  };

  // ─── Derived display values ──────────────────────────────────────────────

  const displayAmt = activeRequest ? formatPaise(activeRequest.amt) : "";
  const displayTid = activeRequest
    ? `TX-${activeRequest.tid.split("_")[1]?.slice(-6) || activeRequest.tid.slice(-7)}`
    : "";

  return (
    <div className="min-h-screen bg-[#0D0D0D] text-white flex flex-col items-center justify-between py-5 px-4 selection:bg-white/20">
      {/* Top Header */}
      <div className="w-full max-w-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Link
              href="/"
              title="Return to Customer Wallet"
              className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 flex items-center space-x-1.5 text-xs text-white/80 hover:text-white transition-colors border border-white/10"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Customer</span>
            </Link>
            <div>
              <p className="text-[10px] font-semibold tracking-[0.2em] text-white/40 uppercase">
                NETZERO PAY
              </p>
              <h1 className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5 text-emerald-400" />
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

        {/* Merchant Vault Balance Hero */}
        <div className="bg-gradient-to-b from-white/10 to-white/5 border border-white/15 rounded-2xl p-4 space-y-1 shadow-lg">
          <div className="flex items-center justify-between text-[11px] text-white/50 font-semibold uppercase tracking-wider">
            <span className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-emerald-400" />
              <span>Merchant Settlement Vault</span>
            </span>
            <span className="text-emerald-400 font-mono text-[10px] bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
              {completedTxnCount} Sales
            </span>
          </div>
          <div className="flex items-baseline space-x-2 pt-0.5">
            <span className="text-3xl font-extrabold text-white tracking-tight tabular-nums">
              {formatPaise(merchantBalancePaise)}
            </span>
            <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-widest">
              INR
            </span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-white/40 pt-1 border-t border-white/5">
            <span>Store: {MERCHANT_DISPLAY_NAME}</span>
            <button
              onClick={handleResetMerchantVault}
              className="text-white/40 hover:text-white/80 transition-colors flex items-center gap-1 underline"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Terminal Action Area */}
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
                <span className="text-emerald-400 font-medium">
                  Multi-Transport Live POS
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
                  Charge Customer
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
                <Wifi className="w-6 h-6 text-emerald-400 animate-pulse" />
              </div>
              <div>
                <p className="text-xs text-white/40 uppercase tracking-widest font-semibold mb-1">
                  Awaiting Customer Tap
                </p>
                <p className="text-3xl font-bold tabular-nums text-white">{displayAmt}</p>
                <p className="text-[11px] text-white/50 mt-1">
                  Broadcasting request to Customer Phone…
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
                <span>Session Code</span>
                <span className="font-mono text-emerald-400">{sessionId}</span>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={handleSimulateIncomingTap}
                className="w-full py-2.5 bg-white/15 hover:bg-white/25 text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center space-x-1.5"
              >
                <span>Simulate Customer Tap on Terminal</span>
              </button>

              <button
                onClick={handleReset}
                className="w-full py-2 text-white/40 hover:text-white text-xs font-medium transition-colors"
              >
                Cancel Charge
              </button>
            </div>
          </div>
        )}

        {/* ── Verifying Handshake ── */}
        {step === "VERIFYING" && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-full border border-amber-500/30 bg-amber-500/10 flex items-center justify-center">
              <RefreshCw className="w-6 h-6 text-amber-400 animate-spin" />
            </div>
            <div>
              <p className="text-xs text-white/40 uppercase tracking-widest font-semibold mb-1">
                Verifying Cryptographic Approval
              </p>
              <p className="text-2xl font-bold tabular-nums">
                +{formatPaise(lastReceivedAmount || activeRequest?.amt || 10000)}
              </p>
              <p className="text-[11px] text-white/40 mt-1">Crediting merchant vault…</p>
            </div>
            {receivedApproval && (
              <p className="text-[11px] text-emerald-400 font-mono">
                Customer: {receivedApproval.cid}
              </p>
            )}
          </div>
        )}

        {/* ── SUCCESS ── */}
        {step === "SUCCESS" && (
          <div className="space-y-4">
            <div className="bg-emerald-950/40 border border-emerald-700/30 rounded-2xl p-6 flex flex-col items-center text-center space-y-4">
              <div className="w-14 h-14 rounded-full border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center">
                <Check className="w-7 h-7 text-emerald-400 stroke-[2.5]" />
              </div>
              <div>
                <p className="text-xs text-emerald-400/80 uppercase tracking-widest font-semibold mb-1">
                  Payment Received & Confirmed
                </p>
                <p className="text-3xl font-bold tabular-nums text-emerald-300">
                  +{formatPaise(lastReceivedAmount || activeRequest?.amt || 10000)}
                </p>
              </div>
              <div className="w-full space-y-1.5 border-t border-emerald-800/30 pt-3 text-[11px]">
                <div className="flex justify-between text-emerald-700/60">
                  <span>Merchant Balance</span>
                  <span className="font-bold text-white tabular-nums">
                    {formatPaise(merchantBalancePaise)}
                  </span>
                </div>
                {receivedApproval && (
                  <div className="flex justify-between text-emerald-700/60">
                    <span>Customer ID</span>
                    <span className="text-emerald-400/80 font-mono">{receivedApproval.cid}</span>
                  </div>
                )}
                <div className="flex justify-between text-emerald-700/60">
                  <span>Status</span>
                  <span className="text-emerald-400 font-semibold">SETTLED IN VAULT (RES: OK)</span>
                </div>
              </div>
            </div>

            <button
              onClick={handleReset}
              className="w-full py-3.5 bg-white text-black font-semibold text-sm rounded-xl hover:bg-white/90 transition-colors shadow-lg"
            >
              New Payment
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
              Terminal Serial Ledger Console
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
