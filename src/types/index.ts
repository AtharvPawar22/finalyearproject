// NETZERO PAY - Protocol & Data Types

export type MessageType = "REQ" | "APR" | "RES";

// Protocol Message 1: Merchant terminal -> Customer phone (Tap 1)
export interface PaymentRequestPayload {
  t: "REQ";
  v: number;          // Protocol version, e.g. 1
  mid: string;        // Merchant ID, e.g. "DEMO_STORE_01"
  tid: string;        // Unique transaction ID, e.g. "TXN_1727649600_001"
  amt: number;        // Amount in integer paise (e.g. 10000 = ₹100.00)
  n: string;          // Nonce (hex string)
}

// Protocol Message 2: Customer phone -> Merchant terminal (Tap 2)
export interface PaymentApprovedPayload {
  t: "APR";
  tid: string;        // Must match request tid
  mid: string;        // Must match request mid
  amt: number;        // Must match request amt
  cid: string;        // Customer ID, e.g. "CUST_0001"
  n: string;          // Must echo request nonce
  mac?: string;       // Optional HMAC-SHA256 signature
  ts: number;         // Timestamp in ms
}

// Protocol Message 3: Merchant terminal -> Customer phone (Result confirmation)
export interface PaymentResultPayload {
  t: "RES";
  tid: string;        // Transaction ID
  amt: number;        // Confirmed amount
  s: "OK" | "FAIL";   // Status
  msg?: string;       // Optional reason if FAIL
}

export type ProtocolMessage = 
  | PaymentRequestPayload 
  | PaymentApprovedPayload 
  | PaymentResultPayload;

// Local Database Models (Dexie / IndexedDB)

export type TransactionType = "PAYMENT" | "CREDIT_SIMULATION";
export type TransactionStatus = "PENDING_TAP" | "COMPLETED" | "FAILED" | "PENDING_SYNC" | "SYNCED";

export interface TransactionRecord {
  id?: number;               // Local auto-increment ID
  tid: string;               // Transaction ID (TXN_...)
  type: TransactionType;
  amountPaise: number;       // Integer paise
  merchantId?: string;
  merchantName?: string;
  customerId: string;
  status: TransactionStatus;
  timestamp: number;
  nonce?: string;
  syncedAt?: number;
  syncAttempts?: number;
  notes?: string;
}

export interface UserWallet {
  customerId: string;
  name: string;
  balancePaise: number;      // Integer paise (e.g. 50000 = ₹500.00)
  createdAt: number;
  updatedAt: number;
}

export interface SyncQueueItem {
  id?: number;
  tid: string;
  payload: Record<string, unknown>;
  createdAt: number;
  attempts: number;
  lastAttempt?: number;
  error?: string;
}

export interface NFCState {
  supported: boolean;
  permission: "prompt" | "granted" | "denied" | "unsupported";
  scanning: boolean;
  activeMessage: PaymentRequestPayload | null;
  lastError: string | null;
}
