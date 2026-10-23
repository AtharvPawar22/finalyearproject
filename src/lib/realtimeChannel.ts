/**
 * realtimeChannel.ts
 * Dual-layer Realtime Broadcast wrapper for NETZERO PAY:
 * 1. Supabase Realtime: Enables real-time cross-device communication between Phone A & Phone B.
 * 2. Web BroadcastChannel API: Seamless local tab-to-tab communication (zero setup, works offline).
 * 
 * Uses exact protocol messages: PaymentRequestPayload, PaymentApprovedPayload, PaymentResultPayload.
 */

import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { ProtocolMessage } from "@/types";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type ChannelMessageHandler = (msg: ProtocolMessage) => void;

let activeSupabaseChannel: RealtimeChannel | null = null;
let activeLocalChannel: BroadcastChannel | null = null;
let messageHandler: ChannelMessageHandler | null = null;
let currentSessionId: string | null = null;
const instanceId = Math.random().toString(36).substring(2, 9);

function channelName(sessionId: string): string {
  return `netzero-${sessionId}`;
}

/**
 * Sets or updates the active message listener without reconnecting the channel.
 */
export function setChannelMessageHandler(handler: ChannelMessageHandler | null): void {
  messageHandler = handler;
}

/**
 * Joins a realtime channel for a given session ID.
 * Connects both local BroadcastChannel (for same-device tabs) and Supabase (for cross-device).
 */
export async function joinChannel(
  sessionId: string,
  onMessage: ChannelMessageHandler
): Promise<void> {
  // If already connected to the same session, simply update the handler
  if (currentSessionId === sessionId && (activeSupabaseChannel || activeLocalChannel)) {
    messageHandler = onMessage;
    return;
  }

  // Clean up any existing connection
  await leaveChannel();

  messageHandler = onMessage;
  currentSessionId = sessionId;
  const name = channelName(sessionId);

  // 1. Initialize local browser BroadcastChannel (same-device tabs / offline testing)
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

  // 2. Initialize Supabase Realtime (if configured) for cross-device mobile support
  if (isSupabaseConfigured) {
    const ch = supabase.channel(name, {
      config: { broadcast: { self: false } },
    });

    ch.on("broadcast", { event: "netzero_msg" }, ({ payload }) => {
      const msg = payload as ProtocolMessage;
      if (messageHandler && msg && msg.t) {
        messageHandler(msg);
      }
    });

    await new Promise<void>((resolve, reject) => {
      ch.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          activeSupabaseChannel = ch;
          resolve();
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(`[Realtime] Supabase channel status: ${status}. Falling back to local.`);
          // If Supabase fails or is unreachable, don't throw if local channel is active
          if (activeLocalChannel) {
            resolve();
          } else {
            reject(new Error(`Channel subscription failed: ${status}`));
          }
        }
      });
    });
  }
}

/**
 * Publishes a protocol message to both Supabase Realtime and local BroadcastChannel.
 */
export async function publishMessage(msg: ProtocolMessage): Promise<void> {
  let published = false;

  // Broadcast to local tabs
  if (activeLocalChannel) {
    try {
      activeLocalChannel.postMessage({
        senderId: instanceId,
        payload: msg,
      });
      published = true;
    } catch (e) {
      console.warn("[Realtime] Local broadcast error:", e);
    }
  }

  // Broadcast across devices via Supabase
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

  if (!published && !activeLocalChannel && !activeSupabaseChannel) {
    throw new Error("No active channel. Connect to a session first.");
  }
}

/**
 * Leaves and cleans up the active channels.
 */
export async function leaveChannel(): Promise<void> {
  if (activeLocalChannel) {
    activeLocalChannel.close();
    activeLocalChannel = null;
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
  return activeLocalChannel !== null || activeSupabaseChannel !== null;
}
