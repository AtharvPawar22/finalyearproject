"use client";

import React, { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import { db, ensureWalletInitialized } from "@/lib/db";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Header } from "@/components/Header";
import { BalanceCard } from "@/components/BalanceCard";
import { TransactionList } from "@/components/TransactionList";
import { NfcPaymentModal } from "@/components/NfcPaymentModal";
import { AddMoneyModal } from "@/components/AddMoneyModal";
import { SyncModal } from "@/components/SyncModal";
import { DemoLoginModal } from "@/components/DemoLoginModal";
import { TransactionRecord, UserWallet } from "@/types";

export default function DashboardPage() {
  const isOnline = useOnlineStatus();

  // Authentication state
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(true);
  const [activeBalancePaise, setActiveBalancePaise] = useState<number | null>(null);

  // Modals state
  const [isPayOpen, setIsPayOpen] = useState(false);
  const [isAddMoneyOpen, setIsAddMoneyOpen] = useState(false);
  const [isSyncOpen, setIsSyncOpen] = useState(false);
  const [selectedTxn, setSelectedTxn] = useState<TransactionRecord | null>(null);

  useEffect(() => {
    ensureWalletInitialized().then((w) => {
      if (w && typeof w.balancePaise === "number") {
        setActiveBalancePaise(w.balancePaise);
      }
    });

    // Check local session safely
    try {
      const authSession =
        sessionStorage.getItem("netzero_auth_session") ||
        localStorage.getItem("netzero_auth_session");
      if (!authSession) {
        setIsLoggedIn(false);
      }
    } catch {
      setIsLoggedIn(true);
    }
  }, []);

  const wallet = useLiveQuery(async () => {
    return await db.wallet.toCollection().first();
  });

  useEffect(() => {
    if (wallet && typeof wallet.balancePaise === "number") {
      setActiveBalancePaise(wallet.balancePaise);
    }
  }, [wallet]);

  const transactions =
    useLiveQuery(async () => {
      return await db.transactions.orderBy("timestamp").reverse().toArray();
    }, []) || [];

  const pendingSyncCount =
    useLiveQuery(async () => {
      return await db.syncQueue.count();
    }, []) ?? 0;

  const handleLoginSuccess = async (name: string) => {
    try {
      sessionStorage.setItem("netzero_auth_session", "true");
      localStorage.setItem("netzero_auth_session", "true");
    } catch {
      // Storage restricted, proceed anyway
    }
    await db.wallet.update("CUST_DEMO_01", { name, updatedAt: Date.now() });
    setIsLoggedIn(true);
  };

  // Resolved wallet with active instantaneous balance
  const resolvedWallet: UserWallet | null = wallet
    ? {
        ...wallet,
        balancePaise: activeBalancePaise ?? wallet.balancePaise,
      }
    : activeBalancePaise !== null
    ? {
        customerId: "CUST_DEMO_01",
        name: "Atharv (Student Demo)",
        balancePaise: activeBalancePaise,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
    : null;

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-slate-900 flex flex-col justify-between selection:bg-slate-900 selection:text-white">
      {/* Top Header */}
      <Header isOnline={isOnline} />

      {/* Main Container */}
      <main className="flex-1 w-full max-w-md mx-auto px-4 py-3 space-y-4">
        {/* Wallet Balance Hero */}
        <BalanceCard
          wallet={resolvedWallet}
          onOpenPay={() => setIsPayOpen(true)}
          onOpenAddMoney={() => setIsAddMoneyOpen(true)}
          onOpenSync={() => setIsSyncOpen(true)}
          pendingSyncCount={pendingSyncCount}
          isOnline={isOnline}
        />

        {/* Transaction History Feed */}
        <TransactionList
          transactions={transactions}
          onSelectTransaction={(txn) => setSelectedTxn(txn)}
        />
      </main>

      {/* Footer */}
      <footer className="w-full py-4 text-center text-[11px] text-slate-400">
        <span>Protected by Local Web Cryptography & Hardware SE</span>
      </footer>

      {/* Demo Login Modal */}
      <DemoLoginModal
        isOpen={!isLoggedIn}
        onLoginSuccess={handleLoginSuccess}
      />

      {/* Payment Sheet */}
      <NfcPaymentModal
        isOpen={isPayOpen}
        onClose={() => setIsPayOpen(false)}
        wallet={resolvedWallet}
        onPaymentComplete={(newBal) => {
          setActiveBalancePaise(newBal);
        }}
      />

      {/* Add Funds Sheet */}
      <AddMoneyModal
        isOpen={isAddMoneyOpen}
        onClose={() => setIsAddMoneyOpen(false)}
        onSuccess={(newBal) => {
          setActiveBalancePaise(newBal);
        }}
      />

      {/* Sync Sheet */}
      <SyncModal
        isOpen={isSyncOpen}
        onClose={() => setIsSyncOpen(false)}
        isOnline={isOnline}
        pendingSyncCount={pendingSyncCount}
        onSyncCompleted={() => {}}
      />
    </div>
  );
}
