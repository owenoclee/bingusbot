import { WS_URL, AUTH_TOKEN } from "../constants/config";
import { useChatStore } from "./store";
import type { ClientFrame, ServerFrame } from "./types";

let socket: WebSocket | null = null;
let reconnectDelay = 1000;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let pendingPushToken: string | null = null;

function send(frame: ClientFrame) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(frame));
  }
}

export function sendMessage(text: string) {
  send({ type: "message", text });
}

export function registerPushToken(deviceToken: string) {
  pendingPushToken = deviceToken;
  send({ type: "register_push", deviceToken });
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      // WebSocket ping frames are handled at protocol level,
      // but we send a sync as a keep-alive / missed message check
      const lastSeen = useChatStore.getState().getLastSeenTimestamp();
      send({ type: "sync", after: lastSeen });
    }
  }, 30000);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

export function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  socket = new WebSocket(WS_URL);
  const store = useChatStore.getState();

  socket.onopen = () => {
    console.log("[ws] connected, authenticating...");
    send({ type: "auth", token: AUTH_TOKEN });
  };

  socket.onmessage = (event) => {
    try {
      const frame: ServerFrame = JSON.parse(event.data);

      if (frame.type === "auth_ok") {
        console.log("[ws] authenticated");
        reconnectDelay = 1000;
        useChatStore.getState().setConnected(true);
        startHeartbeat();
        // Re-register push token if we have one
        if (pendingPushToken) {
          send({ type: "register_push", deviceToken: pendingPushToken });
        }
        // Sync missed messages
        const lastSeen = useChatStore.getState().getLastSeenTimestamp();
        send({ type: "sync", after: lastSeen });
        return;
      }

      if (frame.type === "auth_fail") {
        console.error("[ws] auth failed");
        socket?.close();
        return;
      }

      useChatStore.getState().handleFrame(frame);
    } catch (err) {
      console.error("[ws] bad frame:", err);
    }
  };

  socket.onclose = () => {
    console.log("[ws] disconnected");
    useChatStore.getState().setConnected(false);
    stopHeartbeat();
    scheduleReconnect();
  };

  socket.onerror = (err) => {
    console.error("[ws] error:", err);
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  console.log(`[ws] reconnecting in ${reconnectDelay}ms...`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
    // Exponential backoff: 1s → 2s → 4s → 8s → 16s → 30s max
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
  }, reconnectDelay);
}

export function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  stopHeartbeat();
  socket?.close();
  socket = null;
}
