"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Terminal,
  Send,
  Download,
  Trash2,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { isWebNFCSupported, nfcController } from "@/lib/nfc";
import { resetDemoWallet } from "@/lib/wallet";

interface LogEntry {
  id: string;
  time: string;
  type: "INFO" | "READ" | "WRITE" | "ERROR";
  text: string;
}

export default function DiagnosticsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [writeText, setWriteText] = useState<string>(
    '{"t":"APR","tid":"TXN_TEST_001","mid":"DEMO_STORE_01","amt":10000,"cid":"CUST_0001","n":"a1b2c3d4"}'
  );
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isWriting, setIsWriting] = useState<boolean>(false);

  const addLog = (type: LogEntry["type"], text: string) => {
    const time = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 2,
    });
    setLogs((prev) => [
      {
        id: Math.random().toString(),
        time,
        type,
        text,
      },
      ...prev,
    ]);
  };

  const handleStartScan = async () => {
    if (!isWebNFCSupported()) {
      addLog("ERROR", "Web NFC API not available. Requires Chrome on Android.");
      return;
    }

    try {
      setIsScanning(true);
      addLog("INFO", "Initializing NDEFReader.scan()...");

      await nfcController.startScan(
        (msg, raw) => {
          addLog("READ", `Decoded: ${JSON.stringify(msg)}`);
          addLog("READ", `Raw Payload: ${raw}`);
        },
        (err) => {
          addLog("ERROR", `Scan: ${err.message}`);
        }
      );
      addLog("INFO", "Scanner active. Hold NT3H2111 antenna coil to phone.");
    } catch (err: unknown) {
      setIsScanning(false);
      addLog("ERROR", `Start failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleStopScan = () => {
    nfcController.stopScan();
    setIsScanning(false);
    addLog("INFO", "Scanner stopped.");
  };

  const handleWriteTag = async () => {
    if (!isWebNFCSupported()) {
      addLog("ERROR", "Web NFC API not supported.");
      return;
    }

    try {
      setIsWriting(true);
      addLog("INFO", `Writing payload: ${writeText}`);

      const NDEFClass = window.NDEFReader!;
      const writer = new NDEFClass();

      await writer.write({
        records: [
          {
            recordType: "text",
            data: writeText,
          },
        ],
      });

      addLog("WRITE", "Payload successfully committed to NT3H2111 tag.");
    } catch (err: unknown) {
      addLog("ERROR", `Write failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsWriting(false);
    }
  };

  const handleResetWallet = async () => {
    if (window.confirm("Reset demo wallet balance to ₹500.00 and clear local transactions?")) {
      await resetDemoWallet();
      addLog("INFO", "Wallet reset to ₹500.00 default balance.");
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-slate-900 flex flex-col selection:bg-slate-900 selection:text-white">
      {/* Header */}
      <header className="w-full bg-[#F8F9FA] px-5 py-4 border-b border-slate-200/80 sticky top-0 z-30">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center space-x-1 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Wallet</span>
          </Link>
          <div className="flex items-center space-x-1 text-xs font-semibold text-slate-900">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Diagnostics & Hardware</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 w-full max-w-md mx-auto px-4 py-4 space-y-4">
        {/* Two-Phone Simulation Terminal Link */}
        <div className="bg-slate-900 text-white rounded-2xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-xs font-bold text-white">Merchant Terminal (Phone A)</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Simulate terminal POS on a 2nd phone</p>
          </div>
          <Link
            href="/terminal"
            className="px-3.5 py-1.5 bg-white text-slate-900 text-xs font-semibold rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap"
          >
            Launch POS
          </Link>
        </div>

        {/* Status Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-semibold text-slate-500">
              Web NFC Driver
            </span>
            <span
              className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                isWebNFCSupported()
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {isWebNFCSupported() ? "AVAILABLE" : "UNAVAILABLE"}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Directly test bidirectional NDEF reading & writing with the ESP32 / NT3H2111 hardware module.
          </p>
        </div>

        {/* Read Controls */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card space-y-3">
          <span className="text-xs font-semibold uppercase text-slate-500 block">
            1. Scan Tag (NDEF Read)
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleStartScan}
              disabled={isScanning}
              className="py-2.5 px-3 rounded-xl bg-slate-900 text-white font-semibold text-xs hover:bg-slate-800 disabled:opacity-40 flex items-center justify-center space-x-1.5 transition-colors shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isScanning ? "Scanning..." : "Start Scan"}</span>
            </button>

            <button
              onClick={handleStopScan}
              disabled={!isScanning}
              className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors"
            >
              <span>Stop</span>
            </button>
          </div>
        </div>

        {/* Write Controls */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card space-y-3">
          <span className="text-xs font-semibold uppercase text-slate-500 block">
            2. Write Tag (NDEF Write)
          </span>
          <textarea
            rows={3}
            value={writeText}
            onChange={(e) => setWriteText(e.target.value)}
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 transition-colors"
          />
          <button
            onClick={handleWriteTag}
            disabled={isWriting}
            className="w-full py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs flex items-center justify-center space-x-1.5 transition-colors shadow-sm"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isWriting ? "Touch Phone to Tag..." : "Write Payload to NT3H2111"}</span>
          </button>
        </div>

        {/* Console Log Terminal */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-700">
              <Terminal className="w-3.5 h-3.5" />
              <span>Diagnostic Console</span>
            </div>
            <button
              onClick={() => setLogs([])}
              className="text-xs text-slate-400 hover:text-slate-700 flex items-center space-x-1 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          </div>

          <div className="h-44 overflow-y-auto bg-slate-900 p-3 rounded-xl font-mono text-[11px] space-y-1 text-slate-300">
            {logs.length === 0 ? (
              <span className="text-slate-500 italic">
                Awaiting NFC hardware activity...
              </span>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="leading-relaxed break-all">
                  <span className="text-slate-500">[{log.time}] </span>
                  <span
                    className={
                      log.type === "READ"
                        ? "text-emerald-400 font-medium"
                        : log.type === "WRITE"
                        ? "text-sky-300 font-medium"
                        : log.type === "ERROR"
                        ? "text-rose-400 font-semibold"
                        : "text-slate-300"
                    }
                  >
                    [{log.type}] {log.text}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Reset Utility */}
        <div className="pt-2 pb-6 text-center">
          <button
            onClick={handleResetWallet}
            className="inline-flex items-center space-x-1.5 text-xs text-slate-500 hover:text-slate-800 font-medium transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Demo Wallet (₹500.00)</span>
          </button>
        </div>
      </main>
    </div>
  );
}
