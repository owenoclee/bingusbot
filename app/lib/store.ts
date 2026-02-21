import { create } from "zustand";
import type { ServerFrame, StoredMessage } from "./types";

export interface ChatMessage {
  id: string;
  role: "user" | "agent" | "system";
  content: string;
  createdAt: number;
  streaming?: boolean;
}

interface ChatState {
  messages: ChatMessage[];
  connected: boolean;

  setConnected: (connected: boolean) => void;
  addMessage: (msg: ChatMessage) => void;
  handleFrame: (frame: ServerFrame) => void;
  getLastSeenTimestamp: () => number;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  connected: false,

  setConnected: (connected) => set({ connected }),

  addMessage: (msg) =>
    set((state) => {
      // Dedup by id
      if (state.messages.some((m) => m.id === msg.id)) return state;
      return { messages: [...state.messages, msg].sort((a, b) => a.createdAt - b.createdAt) };
    }),

  handleFrame: (frame) => {
    switch (frame.type) {
      case "message": {
        get().addMessage({
          id: frame.id,
          role: frame.role,
          content: frame.content,
          createdAt: frame.createdAt,
        });
        break;
      }

      case "message_start": {
        // Add a placeholder streaming message
        set((state) => ({
          messages: [
            ...state.messages,
            {
              id: frame.messageId,
              role: "agent",
              content: "",
              createdAt: Date.now(),
              streaming: true,
            },
          ],
        }));
        break;
      }

      case "token": {
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === frame.messageId
              ? { ...m, content: m.content + frame.token }
              : m
          ),
        }));
        break;
      }

      case "message_end": {
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === frame.messageId
              ? { ...m, content: frame.content, streaming: false }
              : m
          ),
        }));
        break;
      }

      case "sync_response": {
        const existing = get().messages;
        const existingIds = new Set(existing.map((m) => m.id));
        const newMsgs: ChatMessage[] = frame.messages
          .filter((m) => !existingIds.has(m.id))
          .map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.createdAt,
          }));
        if (newMsgs.length > 0) {
          set({
            messages: [...existing, ...newMsgs].sort((a, b) => a.createdAt - b.createdAt),
          });
        }
        break;
      }
    }
  },

  getLastSeenTimestamp: () => {
    const msgs = get().messages;
    if (msgs.length === 0) return 0;
    return msgs[msgs.length - 1].createdAt;
  },
}));
