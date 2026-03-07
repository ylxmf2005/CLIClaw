"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { getAuthToken } from "@/lib/api";
import type { WsEvent } from "@/lib/types";

type ConnectionStatus = "connecting" | "connected" | "disconnected";
type EventHandler = (event: WsEvent) => void;

interface WsContextValue {
  status: ConnectionStatus;
  subscribe: (handler: EventHandler) => () => void;
  send: (data: unknown) => void;
  onReconnect: (handler: () => void) => () => void;
}

const WsContext = createContext<WsContextValue | null>(null);

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3889/ws";
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Set<EventHandler>>(new Set());
  const reconnectHandlersRef = useRef<Set<() => void>>(new Set());
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const disposedRef = useRef(false);

  const connect = useCallback(() => {
    if (disposedRef.current) return;

    const token = getAuthToken();
    if (!token) return;

    // Close any existing connection before creating a new one
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.onopen = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    setStatus("connecting");
    const ws = new WebSocket(`${WS_BASE}?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (disposedRef.current) { ws.close(); return; }
      const wasReconnect = reconnectAttemptRef.current > 0;
      setStatus("connected");
      reconnectAttemptRef.current = 0;
      if (wasReconnect) {
        reconnectHandlersRef.current.forEach((h) => h());
      }
    };

    ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as WsEvent;
        handlersRef.current.forEach((h) => h(event));
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (disposedRef.current) return;
      setStatus("disconnected");
      wsRef.current = null;
      // Exponential backoff with jitter
      const attempt = reconnectAttemptRef.current++;
      const delay = Math.min(
        RECONNECT_BASE_MS * Math.pow(2, attempt) + Math.random() * 500,
        RECONNECT_MAX_MS
      );
      reconnectTimerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    disposedRef.current = false;
    connect();
    return () => {
      disposedRef.current = true;
      clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  const subscribe = useCallback((handler: EventHandler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const onReconnect = useCallback((handler: () => void) => {
    reconnectHandlersRef.current.add(handler);
    return () => {
      reconnectHandlersRef.current.delete(handler);
    };
  }, []);

  return (
    <WsContext.Provider value={{ status, subscribe, send, onReconnect }}>
      {children}
    </WsContext.Provider>
  );
}

export function useWebSocket() {
  const ctx = useContext(WsContext);
  if (!ctx) throw new Error("useWebSocket must be within WebSocketProvider");
  return ctx;
}
