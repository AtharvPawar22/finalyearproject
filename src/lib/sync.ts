import { db } from "./db";
import { supabase, isSupabaseConfigured } from "./supabase";
import { TransactionRecord } from "@/types";

export interface SyncReport {
  totalPending: number;
  syncedCount: number;
  failedCount: number;
  errors: string[];
}

let isSyncInProgress = false;

/**
 * Synchronizes all pending offline transactions to the remote backend or mock sync.
 * Thread-safe with concurrency lock to prevent duplicate sync executions.
 */
export async function syncPendingTransactions(): Promise<SyncReport> {
  if (isSyncInProgress) {
    const currentCount = await db.syncQueue.count();
    return {
      totalPending: currentCount,
      syncedCount: 0,
      failedCount: 0,
      errors: ["A sync operation is already in progress."],
    };
  }

  isSyncInProgress = true;

  try {
    const pendingItems = await db.syncQueue.toArray();
    const report: SyncReport = {
      totalPending: pendingItems.length,
      syncedCount: 0,
      failedCount: 0,
      errors: [],
    };

    if (pendingItems.length === 0) {
      return report;
    }

    for (const item of pendingItems) {
      try {
        const payload = item.payload as unknown as TransactionRecord;

        if (isSupabaseConfigured) {
          const { error } = await supabase.from("transactions").upsert({
            tid: payload.tid,
            customer_id: payload.customerId,
            merchant_id: payload.merchantId || null,
            amount_paise: payload.amountPaise,
            type: payload.type,
            status: "SYNCED",
            client_timestamp: new Date(payload.timestamp).toISOString(),
            synced_at: new Date().toISOString(),
            nonce: payload.nonce || null,
          });

          if (error) {
            throw new Error(error.message);
          }
        } else {
          // Simulated network delay
          await new Promise((resolve) => setTimeout(resolve, 300));
        }

        // Mark transaction as synced in local Dexie DB
        await db.transaction("rw", db.transactions, db.syncQueue, async () => {
          const existing = await db.transactions.where("tid").equals(item.tid).first();
          if (existing && existing.id) {
            await db.transactions.update(existing.id, {
              status: "SYNCED",
              syncedAt: Date.now(),
            });
          }
          if (item.id) {
            await db.syncQueue.delete(item.id);
          }
        });

        report.syncedCount += 1;
      } catch (err: unknown) {
        report.failedCount += 1;
        const errMsg = err instanceof Error ? err.message : String(err);
        report.errors.push(`TID ${item.tid}: ${errMsg}`);

        if (item.id) {
          await db.syncQueue.update(item.id, {
            attempts: (item.attempts || 0) + 1,
            lastAttempt: Date.now(),
            error: errMsg,
          });
        }
      }
    }

    return report;
  } finally {
    isSyncInProgress = false;
  }
}

/**
 * Returns count of items pending remote synchronization.
 */
export async function getPendingSyncCount(): Promise<number> {
  return await db.syncQueue.count();
}
