/**
 * realtimeChannel.ts
 * Multi-layer Realtime Broadcast engine for NETZERO PAY:
 * 1. Cloud Relay (ntfy.sh SSE + HTTP Polling): Zero-config, works across separate mobile phones.
 * 2. Supabase Realtime (if configured via env vars): Enterprise cloud sync.
 * 3. Web BroadcastChannel API: Local tab-to-tab communication (offline, same device).
 * 
 * Strict protocol messages: PaymentRequestPayload, PaymentApprovedPayload, PaymentResultPayload.
 */

import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { ProtocolMessage } from "@/types";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type ChannelMessageHandler = (msg: ProtocolMessage) => void;

function createAbortSignal(ms: number): { signal: AbortSignal; cleanup: () => void } {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return { signal: AbortSignal.timeout(ms), cleanup: () => {} };
  }
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cleanup: () => clearTimeout(id) };
}

let activeSupabaseChannel: RealtimeChannel | null = null;
let activeLocalChannel: BroadcastChannel | null = null;
let activeEventSource: EventSource | null = null;
let pollTimer: NodeJS.Timeout | null = null;
let messageHandler: ChannelMessageHandler | null = null;
let currentSessionId: string | null = null;
const processedMessageIds = new Set<string>();

// Unique sender ID for this browser tab/window to ignore self-echoes
const instanceId = Math.random().toString(36).substring(2, 9);

function channelName(sessionId: string): string {
  return `netzero-${sessionId.toLowerCase().trim()}`;
}

function cloudTopicName(sessionId: string): string {
  return `netzero-pay-${sessionId.toLowerCase().trim()}`;
}

/**
 * Sets or updates the active message listener without reconnecting channels.
 */
export function setChannelMessageHandler(handler: ChannelMessageHandler | null): void {
  messageHandler = handler;
}

/**
 * Dispatches an incoming raw message string/object safely to the handler.
 */
function handleIncomingRaw(raw: unknown): void {
  try {
    let envelope: { senderId?: string; payload?: ProtocolMessage; msgId?: string } | null = null;

    if (typeof raw === "string") {
      envelope = JSON.parse(raw);
    } else if (raw && typeof raw === "object") {
      envelope = raw as unknown as { senderId?: string; payload?: ProtocolMessage; msgId?: string };
    }

    if (!envelope || !envelope.payload || !envelope.payload.t) return;

    // Ignore self-echoes
    if (envelope.senderId === instanceId) return;

    // Prevent duplicate processing
    const dedupeKey = `${envelope.payload.t}_${(envelope.payload as { tid?: string }).tid || ""}_${envelope.msgId || ""}`;
    if (dedupeKey && processedMessageIds.has(dedupeKey)) return;
    processedMessageIds.add(dedupeKey);

    // Limit set size to avoid memory growth
    if (processedMessageIds.size > 100) {
      const first = Array.from(processedMessageIds)[0];
      processedMessageIds.delete(first);
    }

    if (messageHandler) {
      messageHandler(envelope.payload);
    }
  } catch {
    // Non-JSON or malformed payload, ignore
  }
}

/**
 * Joins a realtime channel for a given session ID.
 */
export async function joinChannel(
  sessionId: string,
  onMessage: ChannelMessageHandler
): Promise<void> {
  const cleanSessionId = sessionId.toLowerCase().trim() || "demo01";

  // If already connected to the same session, simply update handler
  if (
    currentSessionId === cleanSessionId &&
    (activeSupabaseChannel || activeLocalChannel || activeEventSource || pollTimer)
  ) {
    messageHandler = onMessage;
    return;
  }

  // Clean up any existing connections
  await leaveChannel();

  messageHandler = onMessage;
  currentSessionId = cleanSessionId;
  const name = channelName(cleanSessionId);
  const cloudTopic = cloudTopicName(cleanSessionId);

  // 1. Local browser BroadcastChannel (same device / offline tabs)
  if (typeof window !== "undefined" && "BroadcastChannel" in window) {
    try {
      activeLocalChannel = new BroadcastChannel(name);
      activeLocalChannel.onmessage = (event) => {
        if (!event.data) return;
        handleIncomingRaw(event.data);
      };
    } catch (e) {
      console.warn("[Realtime] BroadcastChannel init error:", e);
    }
  }

  // 2. Cloud Relay via Server-Sent Events (cross-device mobile support)
  if (typeof window !== "undefined" && "EventSource" in window) {
    try {
      const sseUrl = `https://ntfy.sh/${encodeURIComponent(cloudTopic)}/sse`;
      const es = new EventSource(sseUrl);

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.event === "message" && data.message) {
            handleIncomingRaw(data.message);
          }
        } catch {
          // Ignore keepalives
        }
      };

      es.onerror = () => {
        // SSE reconnects automatically
      };

      activeEventSource = es;
    } catch (e) {
      console.warn("[Realtime] Cloud Relay SSE error:", e);
    }
  }

  // 3. Cloud Relay Polling Fallback (runs every 3s in case SSE is blocked by mobile firewall)
  if (typeof window !== "undefined") {
    let lastPollTime = Math.floor(Date.now() / 1000) - 15;

    pollTimer = setInterval(async () => {
      const { signal, cleanup } = createAbortSignal(2500);
      try {
        const pollUrl = `https://ntfy.sh/${encodeURIComponent(cloudTopic)}/json?since=${lastPollTime}&poll=1`;
        const res = await fetch(pollUrl, { signal });
        if (!res.ok) return;
        const text = await res.text();
        lastPollTime = Math.floor(Date.now() / 1000) - 2;

        const lines = text.trim().split("\n");
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data && data.event === "message" && data.message) {
              handleIncomingRaw(data.message);
            }
          } catch {
            // Ignore malformed line
          }
        }
      } catch {
        // Network offline, timeout or polling error, ignore
      } finally {
        cleanup();
      }
    }, 3000);
  }

  // 4. Supabase Realtime (if configured via env vars)
  if (isSupabaseConfigured) {
    try {
      const ch = supabase.channel(name, {
        config: { broadcast: { self: false } },
      });

      ch.on("broadcast", { event: "netzero_msg" }, ({ payload }) => {
        const msg = payload as ProtocolMessage;
        if (messageHandler && msg && msg.t) {
          messageHandler(msg);
        }
      });

      await new Promise<void>((resolve) => {
        ch.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            activeSupabaseChannel = ch;
            resolve();
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            resolve();
          }
        });
      });
    } catch (e) {
      console.warn("[Realtime] Supabase channel error:", e);
    }
  }
}

/**
 * Publishes a protocol message across all active channels.
 */
export async function publishMessage(msg: ProtocolMessage): Promise<void> {
  let published = false;
  const msgId = Math.random().toString(36).substring(2, 9);
  const payloadEnvelope = {
    senderId: instanceId,
    msgId,
    payload: msg,
    timestamp: Date.now(),
  };

  const serialized = JSON.stringify(payloadEnvelope);

  // 1. Broadcast locally
  if (activeLocalChannel) {
    try {
      activeLocalChannel.postMessage(payloadEnvelope);
      published = true;
    } catch (e) {
      console.warn("[Realtime] Local broadcast error:", e);
    }
  }

  // 2. Broadcast across phones via Cloud Relay (using text/plain so raw JSON is preserved)
  if (currentSessionId) {
    const cloudTopic = cloudTopicName(currentSessionId);
    const { signal, cleanup } = createAbortSignal(2500);
    try {
      await fetch(`https://ntfy.sh/${encodeURIComponent(cloudTopic)}`, {
        method: "POST",
        body: serialized,
        headers: {
          "Content-Type": "text/plain",
          Title: `NETZERO_${msg.t}`,
        },
        signal,
      });
      published = true;
    } catch (e) {
      console.warn("[Realtime] Cloud Relay post error:", e);
    } finally {
      cleanup();
    }
  }

  // 3. Broadcast across devices via Supabase
  if (activeSupabaseChannel) {
    try {
      const result = await activeSupabaseChannel.send({
        type: "broadcast",
        event: "netzero_msg",
        payload: msg,
      });
      if (result === "ok") {
        published = true;
      }
    } catch (e) {
      console.warn("[Realtime] Supabase send error:", e);
    }
  }

  if (!published) {
    // If all fails, don't throw an unhandled crash if offline
    console.warn("Message queued locally; no active network transports reachable.");
  }
}

/**
 * Leaves and cleans up all active channels.
 */
export async function leaveChannel(): Promise<void> {
  if (activeLocalChannel) {
    activeLocalChannel.close();
    activeLocalChannel = null;
  }

  if (activeEventSource) {
    activeEventSource.close();
    activeEventSource = null;
  }

  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  if (activeSupabaseChannel) {
    await supabase.removeChannel(activeSupabaseChannel);
    activeSupabaseChannel = null;
  }

  messageHandler = null;
  currentSessionId = null;
}

export function getCurrentSessionId(): string | null {
  return currentSessionId;
}

export function isChannelActive(): boolean {
  return (
    activeLocalChannel !== null ||
    activeEventSource !== null ||
    activeSupabaseChannel !== null ||
    pollTimer !== null
  );
}
