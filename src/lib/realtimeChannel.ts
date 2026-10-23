/**
 * realtimeChannel.ts
 * Multi-layer Realtime Broadcast engine for NETZERO PAY:
 * 1. Cloud Relay (via ntfy.sh SSE/POST): Zero-config, works across separate mobile phones without any API keys.
 * 2. Supabase Realtime (if configured via env vars): Enterprise cloud sync.
 * 3. Web BroadcastChannel API: Local tab-to-tab communication (offline, same device).
 * 
 * Strict protocol messages: PaymentRequestPayload, PaymentApprovedPayload, PaymentResultPayload.
 */

import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { ProtocolMessage } from "@/types";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type ChannelMessageHandler = (msg: ProtocolMessage) => void;

let activeSupabaseChannel: RealtimeChannel | null = null;
let activeLocalChannel: BroadcastChannel | null = null;
let activeEventSource: EventSource | null = null;
let messageHandler: ChannelMessageHandler | null = null;
let currentSessionId: string | null = null;

// Unique sender ID for this browser tab/window to ignore self-echoes
const instanceId = Math.random().toString(36).substring(2, 9);

function channelName(sessionId: string): string {
  return `netzero-${sessionId.toLowerCase().trim()}`;
}

function cloudTopicName(sessionId: string): string {
  // Prefix to avoid collisions on public topics
  return `netzero-pay-${sessionId.toLowerCase().trim()}`;
}

/**
 * Sets or updates the active message listener without reconnecting channels.
 */
export function setChannelMessageHandler(handler: ChannelMessageHandler | null): void {
  messageHandler = handler;
}

/**
 * Joins a realtime channel for a given session ID.
 * Connects Local BroadcastChannel, Cloud Relay (cross-device), and Supabase (if configured).
 */
export async function joinChannel(
  sessionId: string,
  onMessage: ChannelMessageHandler
): Promise<void> {
  const cleanSessionId = sessionId.toLowerCase().trim() || "demo01";

  // If already connected to the same session, simply update handler
  if (
    currentSessionId === cleanSessionId &&
    (activeSupabaseChannel || activeLocalChannel || activeEventSource)
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
        if (!event.data || event.data.senderId === instanceId) return;
        const msg = event.data.payload as ProtocolMessage;
        if (messageHandler && msg && msg.t) {
          messageHandler(msg);
        }
      };
    } catch (e) {
      console.warn("[Realtime] BroadcastChannel init error:", e);
    }
  }

  // 2. Cloud Relay via Server-Sent Events (Zero-config cross-device support for 2 separate phones)
  if (typeof window !== "undefined" && "EventSource" in window) {
    try {
      const sseUrl = `https://ntfy.sh/${encodeURIComponent(cloudTopic)}/sse`;
      const es = new EventSource(sseUrl);

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // ntfy sends JSON wrapped in { event: "message", message: "..." }
          if (data && data.event === "message" && data.message) {
            const envelope = JSON.parse(data.message);
            if (
              envelope &&
              envelope.senderId !== instanceId &&
              envelope.payload &&
              envelope.payload.t
            ) {
              if (messageHandler) {
                messageHandler(envelope.payload as ProtocolMessage);
              }
            }
          }
        } catch {
          // Ignore keepalives or non-JSON messages
        }
      };

      es.onerror = () => {
        // SSE automatically handles reconnects
      };

      activeEventSource = es;
    } catch (e) {
      console.warn("[Realtime] Cloud Relay SSE error:", e);
    }
  }

  // 3. Supabase Realtime (if configured via env vars)
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
            resolve(); // Don't block; cloud relay is already active
          }
        });
      });
    } catch (e) {
      console.warn("[Realtime] Supabase channel error:", e);
    }
  }
}

/**
 * Publishes a protocol message to all active transport layers:
 * - Local BroadcastChannel
 * - Cloud Relay (for cross-device phones)
 * - Supabase Realtime
 */
export async function publishMessage(msg: ProtocolMessage): Promise<void> {
  let published = false;
  const payloadEnvelope = {
    senderId: instanceId,
    payload: msg,
    timestamp: Date.now(),
  };

  // 1. Broadcast locally
  if (activeLocalChannel) {
    try {
      activeLocalChannel.postMessage(payloadEnvelope);
      published = true;
    } catch (e) {
      console.warn("[Realtime] Local broadcast error:", e);
    }
  }

  // 2. Broadcast across phones via Cloud Relay
  if (currentSessionId) {
    const cloudTopic = cloudTopicName(currentSessionId);
    try {
      await fetch(`https://ntfy.sh/${encodeURIComponent(cloudTopic)}`, {
        method: "POST",
        body: JSON.stringify(payloadEnvelope),
        headers: {
          "Content-Type": "application/json",
          Title: `NETZERO_${msg.t}`,
        },
      });
      published = true;
    } catch (e) {
      console.warn("[Realtime] Cloud Relay post error:", e);
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
    throw new Error("Unable to broadcast message: no active connection.");
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
    activeSupabaseChannel !== null
  );
}
