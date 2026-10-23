import { parseNDEFPayload, encodeNDEFPayload } from "./protocol";
import {
  PaymentRequestPayload,
  PaymentApprovedPayload,
  PaymentResultPayload,
  ProtocolMessage,
} from "@/types";

// Type definitions for Web NFC API (standard in Chrome Android)
declare global {
  interface Window {
    NDEFReader?: {
      new (): NDEFReaderInstance;
    };
  }
}

export interface NDEFRecordData {
  recordType: string;
  mediaType?: string;
  data?: ArrayBuffer | DataView | string;
}

export interface NDEFMessage {
  records: NDEFRecordData[];
}

export interface NDEFReadingEvent extends Event {
  serialNumber: string;
  message: {
    records: Array<{
      recordType: string;
      mediaType?: string;
      data: DataView;
    }>;
  };
}

export interface NDEFReaderInstance extends EventTarget {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
  write(
    message: NDEFMessage | string,
    options?: { signal?: AbortSignal; overwrite?: boolean }
  ): Promise<void>;
  onreading: ((event: NDEFReadingEvent) => void) | null;
  onreadingerror: ((event: Event) => void) | null;
}

/**
 * Checks whether Web NFC (NDEFReader) is available in current browser environment.
 */
export function isWebNFCSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "NDEFReader" in window;
}

/**
 * Formats Web NFC DOMExceptions into human-readable, actionable error messages.
 */
export function formatNFCError(err: unknown): string {
  if (!(err instanceof Error)) return "An unknown NFC error occurred.";

  const name = err.name || "";
  const msg = err.message || "";

  if (name === "NotAllowedError") {
    return "NFC permission denied. Please tap the lock icon in Chrome's address bar to allow NFC access.";
  }
  if (name === "NotSupportedError") {
    return "Web NFC is not supported on this device. Ensure NFC is enabled in Android Settings and you are using Google Chrome.";
  }
  if (name === "SecurityError") {
    return "Web NFC requires a secure HTTPS connection. Please use the HTTPS deployment URL.";
  }
  if (name === "AbortError") {
    return "NFC operation was cancelled.";
  }
  if (name === "NetworkError" || name === "InvalidStateError") {
    return "Tag communication interrupted. Hold phone steady against the terminal coil.";
  }

  return msg || "NFC exchange failed. Please try again.";
}

/**
 * Helper to decode text content from an NDEF record's DataView.
 */
export function decodeNDEFText(dataView: DataView): string {
  const decoder = new TextDecoder("utf-8");
  return decoder.decode(dataView);
}

export class NetzeroNFCController {
  private reader: NDEFReaderInstance | null = null;
  private abortController: AbortController | null = null;
  private onMessageCallback: ((message: ProtocolMessage, rawText: string) => void) | null = null;

  public isSupported(): boolean {
    return isWebNFCSupported();
  }

  /**
   * Starts listening for NFC tags (e.g. PAYMENT_REQUEST from NT3H2111 / ESP32).
   */
  public async startScan(
    onMessage: (message: ProtocolMessage, rawText: string) => void,
    onError: (err: Error) => void
  ): Promise<void> {
    if (!this.isSupported()) {
      throw new Error("Web NFC is not supported on this browser. Please use Google Chrome on an NFC-capable Android phone.");
    }

    try {
      this.stopScan();
      this.abortController = new AbortController();
      this.onMessageCallback = onMessage;

      const NDEFClass = window.NDEFReader!;
      this.reader = new NDEFClass();

      await this.reader.scan({ signal: this.abortController.signal });

      this.reader.onreading = (event: NDEFReadingEvent) => {
        try {
          for (const record of event.message.records) {
            const textContent = decodeNDEFText(record.data);
            const parsed = parseNDEFPayload(textContent);
            if (parsed && this.onMessageCallback) {
              this.onMessageCallback(parsed, textContent);
              return;
            }
          }
        } catch (readErr: unknown) {
          console.error("Failed to parse NFC record data:", readErr);
        }
      };

      this.reader.onreadingerror = () => {
        onError(new Error("Cannot read NFC tag. Ensure the phone is aligned with the terminal coil."));
      };
    } catch (err: unknown) {
      const formatted = new Error(formatNFCError(err));
      onError(formatted);
      throw formatted;
    }
  }

  /**
   * Sets or updates the active message listener.
   */
  public setMessageListener(callback: ((message: ProtocolMessage, rawText: string) => void) | null) {
    this.onMessageCallback = callback;
  }

  /**
   * Writes PAYMENT_APPROVED payload back to the NT3H2111 tag.
   */
  public async writeApproval(approval: PaymentApprovedPayload): Promise<void> {
    if (!this.isSupported()) {
      throw new Error("Web NFC is not supported on this browser.");
    }

    try {
      const payloadJson = encodeNDEFPayload(approval);
      const NDEFClass = window.NDEFReader!;
      const writer = new NDEFClass();

      await writer.write({
        records: [
          {
            recordType: "text",
            data: payloadJson,
          },
        ],
      });
    } catch (err: unknown) {
      throw new Error(formatNFCError(err));
    }
  }

  /**
   * Writes PAYMENT_APPROVED and waits for the merchant terminal to return PAYMENT_RESULT.
   */
  public async writeAndAwaitResult(
    approval: PaymentApprovedPayload,
    timeoutMs: number = 8000
  ): Promise<PaymentResultPayload> {
    await this.writeApproval(approval);

    return new Promise<PaymentResultPayload>((resolve, reject) => {
      let timeoutId: NodeJS.Timeout | null = null;

      const messageHandler = (msg: ProtocolMessage) => {
        if (msg.t === "RES" && msg.tid === approval.tid) {
          if (timeoutId) clearTimeout(timeoutId);
          this.setMessageListener(null);
          resolve(msg);
        }
      };

      this.setMessageListener(messageHandler);

      timeoutId = setTimeout(() => {
        this.setMessageListener(null);
        reject(new Error("Merchant terminal response timed out. Balance was NOT deducted."));
      }, timeoutMs);
    });
  }

  /**
   * Aborts active scan sessions.
   */
  public stopScan(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.reader = null;
    this.onMessageCallback = null;
  }
}

export const nfcController = new NetzeroNFCController();
