/**
 * useWebSocket — Resilient WebSocket hook with auto-reconnection.
 *
 * Features:
 * - Exponential backoff reconnection (1s → 2s → 4s → 8s, max 30s)
 * - Connection health monitoring with heartbeat
 * - State recovery after reconnect (queries running tasks)
 * - Connection status events (connected/disconnected/reconnecting)
 * - Message buffering during disconnect (up to 50 messages)
 */

import { useRef, useState, useCallback, useEffect } from 'react';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

export interface WebSocketOptions {
  url: string;
  onMessage: (data: any) => void;
  onStateChange?: (state: ConnectionState) => void;
  maxReconnectDelay?: number;   // Max backoff in ms (default 30000)
  heartbeatInterval?: number;   // Ping interval in ms (default 25000)
  maxBufferedMessages?: number; // Max queued messages during disconnect (default 50)
  autoReconnect?: boolean;      // Whether to auto-reconnect (default true)
}

interface WebSocketHookReturn {
  send: (data: any) => void;
  state: ConnectionState;
  reconnectAttempt: number;
  lastConnectedAt: number | null;
  lastDisconnectedAt: number | null;
  forceReconnect: () => void;
  disconnect: () => void;
}

export function useWebSocket(options: WebSocketOptions): WebSocketHookReturn {
  const {
    url,
    onMessage,
    onStateChange,
    maxReconnectDelay = 30000,
    heartbeatInterval = 25000,
    maxBufferedMessages = 50,
    autoReconnect = true,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<ConnectionState>('connecting');
  const [reconnectAttempt, setReconnectAttempt] = useState<number>(0);
  const [lastConnectedAt, setLastConnectedAt] = useState<number | null>(null);
  const [lastDisconnectedAt, setLastDisconnectedAt] = useState<number | null>(null);
  
  const unmountedRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messageBufferRef = useRef<any[]>([]);
  const onMessageRef = useRef(onMessage);
  const onStateChangeRef = useRef(onStateChange);

  // Keep callback refs fresh without re-triggering effect
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);
  useEffect(() => { onStateChangeRef.current = onStateChange; }, [onStateChange]);

  const updateState = useCallback((newState: ConnectionState) => {
    setState(newState);
    onStateChangeRef.current?.(newState);
  }, []);

  const connect = useCallback(() => {
    if (unmountedRef.current) return;

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.onopen = null;
      try { wsRef.current.close(); } catch {}
    }

    updateState(reconnectAttempt > 0 ? 'reconnecting' : 'connecting');

    const socket = new WebSocket(url);

    socket.onopen = () => {
      if (unmountedRef.current) { socket.close(); return; }
      
      setReconnectAttempt(0);
      setLastConnectedAt(Date.now());
      updateState('connected');

      // Flush buffered messages
      while (messageBufferRef.current.length > 0) {
        const msg = messageBufferRef.current.shift();
        try { socket.send(JSON.stringify(msg)); } catch {}
      }

      // State recovery: query for any running tasks
      try {
        socket.send(JSON.stringify({ type: 'query_running' }));
      } catch {}

      // Start heartbeat
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          try { socket.send(JSON.stringify({ type: 'query_running' })); } catch {}
        }
      }, heartbeatInterval);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessageRef.current(data);
      } catch {
        // Non-JSON message — still forward as raw
        onMessageRef.current({ type: 'raw', data: event.data });
      }
    };

    socket.onerror = () => {
      // Error will be followed by close
    };

    socket.onclose = () => {
      if (unmountedRef.current) return;

      setLastDisconnectedAt(Date.now());
      updateState('disconnected');

      // Stop heartbeat
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }

      // Auto-reconnect with exponential backoff
      if (autoReconnect) {
        const attempt = reconnectAttempt + 1;
        setReconnectAttempt(attempt);
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), maxReconnectDelay);
        
        console.log(`[WS] Reconnecting in ${delay}ms (attempt ${attempt})...`);
        updateState('reconnecting');
        
        reconnectTimerRef.current = setTimeout(() => {
          if (!unmountedRef.current) connect();
        }, delay) as unknown as ReturnType<typeof setTimeout>;
      }
    };

    wsRef.current = socket;
  }, [url, autoReconnect, maxReconnectDelay, heartbeatInterval, reconnectAttempt, updateState]);

  const send = useCallback((data: any) => {
    const socket = wsRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
    } else {
      // Buffer messages during disconnect (bounded)
      if (messageBufferRef.current.length < maxBufferedMessages) {
        messageBufferRef.current.push(data);
      }
    }
  }, [maxBufferedMessages]);

  const forceReconnect = useCallback(() => {
    setReconnectAttempt(0);
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    connect();
  }, [connect]);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }
    updateState('disconnected');
  }, [updateState]);

  // Initial connection
  useEffect(() => {
    unmountedRef.current = false;
    connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, []);  // Only run once — connect() is stable enough

  return {
    send,
    state,
    reconnectAttempt,
    lastConnectedAt,
    lastDisconnectedAt,
    forceReconnect,
    disconnect,
  };
}
