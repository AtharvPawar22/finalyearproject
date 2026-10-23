import {
  PaymentRequestPayload,
  PaymentApprovedPayload,
  PaymentResultPayload,
  ProtocolMessage,
} from "@/types";

/**
 * Encodes a JavaScript object into a JSON string suitable for NDEF Text Record.
 */
export function encodeNDEFPayload(payload: ProtocolMessage): string {
  return JSON.stringify(payload);
}

/**
 * Parses and validates an NDEF record raw text into a recognized ProtocolMessage.
 */
export function parseNDEFPayload(rawText: string): ProtocolMessage | null {
  try {
    const trimmed = rawText.trim();
    // Quick boundary sanity check
    const startIdx = trimmed.indexOf("{");
    const endIdx = trimmed.lastIndexOf("}");
    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
      return null;
    }
    const jsonStr = trimmed.slice(startIdx, endIdx + 1);
    const parsed = JSON.parse(jsonStr);

    if (!parsed || typeof parsed !== "object" || typeof parsed.t !== "string") {
      return null;
    }

    if (parsed.t === "REQ") {
      if (
        typeof parsed.v === "number" &&
        typeof parsed.mid === "string" &&
        typeof parsed.tid === "string" &&
        typeof parsed.amt === "number" &&
        Number.isInteger(parsed.amt) &&
        parsed.amt > 0 &&
        typeof parsed.n === "string"
      ) {
        return parsed as PaymentRequestPayload;
      }
    } else if (parsed.t === "APR") {
      if (
        typeof parsed.tid === "string" &&
        typeof parsed.mid === "string" &&
        typeof parsed.amt === "number" &&
        Number.isInteger(parsed.amt) &&
        parsed.amt > 0 &&
        typeof parsed.cid === "string" &&
        typeof parsed.n === "string"
      ) {
        return parsed as PaymentApprovedPayload;
      }
    } else if (parsed.t === "RES") {
      if (
        typeof parsed.tid === "string" &&
        typeof parsed.amt === "number" &&
        (parsed.s === "OK" || parsed.s === "FAIL")
      ) {
        return parsed as PaymentResultPayload;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Formats paise integer into Rupee display string (e.g. 10000 -> "₹100.00", 5050 -> "₹50.50")
 * Strictly handles integer calculations to prevent floating point inaccuracy.
 */
export function formatPaise(paise: number, showSymbol = true): string {
  if (!Number.isFinite(paise)) return showSymbol ? "₹0.00" : "0.00";
  const isNegative = paise < 0;
  const absPaise = Math.abs(Math.round(paise));
  const rupees = Math.floor(absPaise / 100);
  const remainder = absPaise % 100;
  const formattedDecimal = remainder.toString().padStart(2, "0");
  const formattedNumber = `${rupees.toLocaleString("en-IN")}.${formattedDecimal}`;
  
  if (showSymbol) {
    return `${isNegative ? "-" : ""}₹${formattedNumber}`;
  }
  return `${isNegative ? "-" : ""}${formattedNumber}`;
}

/**
 * Converts rupee string/number to integer paise (e.g. 100 -> 10000, 49.50 -> 4950)
 * Safely handles decimals up to 2 places and rejects invalid/negative inputs.
 */
export function rupeesToPaise(rupees: number | string): number {
  if (typeof rupees === "string") {
    const trimmed = rupees.trim();
    if (!trimmed || isNaN(Number(trimmed))) return 0;
    const val = parseFloat(trimmed);
    if (!Number.isFinite(val) || val <= 0) return 0;
    return Math.round(val * 100);
  }
  if (!Number.isFinite(rupees) || rupees <= 0) return 0;
  return Math.round(rupees * 100);
}
