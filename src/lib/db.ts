import Dexie, { type Table } from "dexie";
import { TransactionRecord, UserWallet, SyncQueueItem } from "@/types";

export class NetzeroDatabase extends Dexie {
  wallet!: Table<UserWallet, string>;
  transactions!: Table<TransactionRecord, number>;
  syncQueue!: Table<SyncQueueItem, number>;

  constructor() {
    super("NetzeroPayDB");
    this.version(1).stores({
      wallet: "customerId",
      transactions: "++id, &tid, type, customerId, status, timestamp",
      syncQueue: "++id, &tid, createdAt, attempts",
    });
  }
}

export const db = new NetzeroDatabase();

export const DEFAULT_CUSTOMER_ID = "CUST_DEMO_01";
export const DEFAULT_CUSTOMER_NAME = "Atharv (Student Demo)";

/**
 * Initializes the local wallet with default demo credentials if not existing.
 */
export async function ensureWalletInitialized(): Promise<UserWallet> {
  const existing = await db.wallet.get(DEFAULT_CUSTOMER_ID);
  if (existing) {
    return existing;
  }

  const initialWallet: UserWallet = {
    customerId: DEFAULT_CUSTOMER_ID,
    name: DEFAULT_CUSTOMER_NAME,
    balancePaise: 50000, // ₹500.00 initial dummy demo balance
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await db.wallet.put(initialWallet);
  return initialWallet;
}
