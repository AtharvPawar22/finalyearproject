import { db, DEFAULT_CUSTOMER_ID, DEFAULT_CUSTOMER_NAME, ensureWalletInitialized } from "./db";
import { TransactionRecord, UserWallet } from "@/types";

export interface DeductResult {
  success: boolean;
  newBalancePaise: number;
  error?: string;
  transaction?: TransactionRecord;
}

async function getOrInitWallet(): Promise<UserWallet> {
  const existing = await db.wallet.get(DEFAULT_CUSTOMER_ID);
  if (existing) return existing;

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

/**
 * Deducts amount from the local offline wallet in a transactional manner.
 */
export async function deductWalletBalance(
  amountPaise: number,
  tid: string,
  merchantId: string,
  nonce?: string
): Promise<DeductResult> {
  if (amountPaise <= 0 || !Number.isInteger(amountPaise)) {
    return { success: false, newBalancePaise: 0, error: "Invalid transaction amount" };
  }

  return await db.transaction("rw", db.wallet, db.transactions, db.syncQueue, async () => {
    let wallet = await db.wallet.get(DEFAULT_CUSTOMER_ID);
    if (!wallet) {
      wallet = {
        customerId: DEFAULT_CUSTOMER_ID,
        name: DEFAULT_CUSTOMER_NAME,
        balancePaise: 50000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await db.wallet.put(wallet);
    }

    // Check if this transaction was already processed
    const existingTxn = await db.transactions.where("tid").equals(tid).first();
    if (existingTxn && existingTxn.status === "COMPLETED") {
      return {
        success: true,
        newBalancePaise: wallet.balancePaise,
        transaction: existingTxn,
      };
    }

    if (wallet.balancePaise < amountPaise) {
      return {
        success: false,
        newBalancePaise: wallet.balancePaise,
        error: `Insufficient wallet balance. Required: ₹${(amountPaise / 100).toFixed(2)}, Available: ₹${(wallet.balancePaise / 100).toFixed(2)}`,
      };
    }

    const newBalance = wallet.balancePaise - amountPaise;
    const now = Date.now();

    // Update wallet
    await db.wallet.update(DEFAULT_CUSTOMER_ID, {
      balancePaise: newBalance,
      updatedAt: now,
    });

    // Record completed offline transaction
    const txnRecord: TransactionRecord = {
      tid,
      type: "PAYMENT",
      amountPaise,
      merchantId,
      merchantName: merchantId === "DEMO_STORE_01" ? "Campus Canteen Terminal" : merchantId,
      customerId: DEFAULT_CUSTOMER_ID,
      status: "COMPLETED",
      timestamp: now,
      nonce,
    };

    const recordId = await db.transactions.put(txnRecord);
    txnRecord.id = recordId;

    // Enqueue for later backend sync
    await db.syncQueue.put({
      tid,
      payload: { ...txnRecord },
      createdAt: now,
      attempts: 0,
    });

    return {
      success: true,
      newBalancePaise: newBalance,
      transaction: txnRecord,
    };
  });
}

/**
 * Simulates adding funds to the local demo wallet (Demo purposes only).
 */
export async function addSimulatedFunds(amountPaise: number): Promise<number> {
  if (amountPaise <= 0 || !Number.isInteger(amountPaise)) {
    throw new Error("Invalid deposit amount");
  }

  return await db.transaction("rw", db.wallet, db.transactions, db.syncQueue, async () => {
    let wallet = await db.wallet.get(DEFAULT_CUSTOMER_ID);
    if (!wallet) {
      wallet = {
        customerId: DEFAULT_CUSTOMER_ID,
        name: DEFAULT_CUSTOMER_NAME,
        balancePaise: 50000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await db.wallet.put(wallet);
    }

    const newBalance = wallet.balancePaise + amountPaise;
    const now = Date.now();
    const tid = `SIM_ADD_${now}_${Math.floor(Math.random() * 1000)}`;

    await db.wallet.update(DEFAULT_CUSTOMER_ID, {
      balancePaise: newBalance,
      updatedAt: now,
    });

    const txnRecord: TransactionRecord = {
      tid,
      type: "CREDIT_SIMULATION",
      amountPaise,
      customerId: DEFAULT_CUSTOMER_ID,
      status: "COMPLETED",
      timestamp: now,
      notes: "Demo simulated top-up",
    };

    await db.transactions.put(txnRecord);

    await db.syncQueue.put({
      tid,
      payload: { ...txnRecord },
      createdAt: now,
      attempts: 0,
    });

    return newBalance;
  });
}

/**
 * Resets local demo wallet to default ₹500.00 balance and clears logs.
 */
export async function resetDemoWallet(): Promise<void> {
  await db.transaction("rw", db.wallet, db.transactions, db.syncQueue, async () => {
    await db.transactions.clear();
    await db.syncQueue.clear();
    await db.wallet.put({
      customerId: DEFAULT_CUSTOMER_ID,
      name: DEFAULT_CUSTOMER_NAME,
      balancePaise: 50000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
}
