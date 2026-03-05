"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAppState } from "@/providers/app-state-provider";
import { useWebSocket } from "@/providers/ws-provider";
import { useTheme } from "@/providers/theme-provider";
import { Button } from "@/components/ui/button";
import { X, SquareSlash } from "lucide-react";
import { abortAgent } from "@/lib/api";
import type { WsEvent } from "@/lib/types";

const DARK_THEME = {
  background: "#2b2d31",
  foreground: "#b5bac1",
  cursor: "#00d4ff",
  cursorAccent: "#2b2d31",
  selectionBackground: "rgba(0, 212, 255, 0.15)",
  black: "#1e1f22",
  red: "#ed4245",
  green: "#23a55a",
  yellow: "#f0b232",
  blue: "#5865f2",
  magenta: "#a78bfa",
  cyan: "#00d4ff",
  white: "#dbdee1",
  brightBlack: "#6d6f78",
  brightRed: "#fb7185",
  brightGreen: "#57f287",
  brightYellow: "#fee75c",
  brightBlue: "#7289da",
  brightMagenta: "#c4b5fd",
  brightCyan: "#22d3ee",
  brightWhite: "#f2f3f5",
};

const LIGHT_THEME = {
  background: "#f2f3f5",
  foreground: "#313338",
  cursor: "#0891b2",
  cursorAccent: "#f2f3f5",
  selectionBackground: "rgba(8, 145, 178, 0.15)",
  black: "#e3e5e8",
  red: "#da373c",
  green: "#16a34a",
  yellow: "#d97706",
  blue: "#4f46e5",
  magenta: "#a855f7",
  cyan: "#0891b2",
  white: "#313338",
  brightBlack: "#5c5e66",
  brightRed: "#ef4444",
  brightGreen: "#22c55e",
  brightYellow: "#eab308",
  brightBlue: "#6366f1",
  brightMagenta: "#c084fc",
  brightCyan: "#06b6d4",
  brightWhite: "#1e1f22",
};

export function TerminalView() {
  const { state, dispatch } = useAppState();
  const { subscribe, send } = useWebSocket();
  const { theme } = useTheme();
  const termContainerRef = useRef<HTMLDivElement>(null);
  const termInstanceRef = useRef<{ term: unknown; fitAddon: unknown } | null>(null);
  const logBufferRef = useRef<string[]>([]);
  const prevSelectionRef = useRef<string | null>(null);

  const agentName = state.selectedChat?.agentName;
  const chatId = state.selectedChat?.chatId;
  const relayKey = agentName && chatId ? `${agentName}:${chatId}` : "";
  const relayOn = relayKey ? (state.relayStates[relayKey] ?? false) : false;

  // 14.5: Clear terminal on agent/chat switch
  useEffect(() => {
    const currentKey = agentName && chatId ? `${agentName}:${chatId}` : null;
    if (currentKey !== prevSelectionRef.current) {
      prevSelectionRef.current = currentKey;
      logBufferRef.current = [];
      const inst = termInstanceRef.current;
      if (inst) {
        (inst.term as { clear: () => void }).clear();
      }
    }
  }, [agentName, chatId]);

  // Initialize xterm
  useEffect(() => {
    if (!termContainerRef.current) return;

    let mounted = true;

    async function initTerm() {
      const { Terminal } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");
      if (!mounted || !termContainerRef.current) return;

      const fitAddon = new FitAddon();
      const term = new Terminal({
        theme: theme === "dark" ? DARK_THEME : LIGHT_THEME,
        fontSize: 12,
        fontFamily: "var(--font-geist-mono), monospace",
        lineHeight: 1.4,
        scrollback: 5000,
        cursorBlink: relayOn,
        cursorStyle: "bar",
        disableStdin: !relayOn,
        allowProposedApi: true,
      });

      term.loadAddon(fitAddon);
      term.open(termContainerRef.current!);
      fitAddon.fit();

      termInstanceRef.current = { term, fitAddon };

      // Write buffered lines
      for (const line of logBufferRef.current) {
        term.writeln(line);
      }

      // Handle resize
      const observer = new ResizeObserver(() => {
        fitAddon.fit();
      });
      observer.observe(termContainerRef.current!);

      return () => {
        observer.disconnect();
        term.dispose();
      };
    }

    const cleanup = initTerm();

    return () => {
      mounted = false;
      cleanup.then((fn) => fn?.());
      termInstanceRef.current = null;
    };
  }, [theme, relayOn]);

  // 14.6: Wire agent.pty.input — xterm onData -> WS send
  useEffect(() => {
    if (!relayOn || !agentName || !chatId) return;
    const inst = termInstanceRef.current;
    if (!inst) return;

    const term = inst.term as { onData: (cb: (data: string) => void) => { dispose: () => void } };
    const disposable = term.onData((data: string) => {
      send({
        type: "agent.pty.input",
        payload: { name: agentName, chatId, data },
      });
    });

    return () => disposable.dispose();
  }, [relayOn, agentName, chatId, send]);

  // Subscribe to agent log events (read-only mode)
  useEffect(() => {
    if (!agentName || relayOn) return;

    return subscribe((event: WsEvent) => {
      if (
        event.type === "agent.log" &&
        (event.payload as { name: string }).name === agentName
      ) {
        const line = (event.payload as { line: string }).line;
        logBufferRef.current.push(line);
        if (logBufferRef.current.length > 5000) {
          logBufferRef.current = logBufferRef.current.slice(-4000);
        }
        const inst = termInstanceRef.current;
        if (inst) {
          (inst.term as { writeln: (s: string) => void }).writeln(line);
        }
      }
    });
  }, [agentName, relayOn, subscribe]);

  // Subscribe to PTY output events (interactive mode)
  useEffect(() => {
    if (!agentName || !chatId || !relayOn) return;

    return subscribe((event: WsEvent) => {
      if (event.type === "agent.pty.output") {
        const p = event.payload as { name: string; chatId?: string; data: string };
        if (p.name === agentName && (!p.chatId || p.chatId === chatId)) {
          const inst = termInstanceRef.current;
          if (inst) {
            (inst.term as { write: (s: string) => void }).write(p.data);
          }
        }
      }
    });
  }, [agentName, chatId, relayOn, subscribe]);

  const handleClose = useCallback(() => {
    dispatch({ type: "SET_SPLIT_PANE", pane: null });
  }, [dispatch]);

  // 14.3: Terminal mode indicator
  const modeLabel = relayOn ? "Interactive" : "Read-only";
  const modeColor = relayOn ? "text-emerald-signal" : "text-muted-foreground";

  return (
    <div className="flex h-full flex-col border-l border-border bg-card">
      {/* Terminal header */}
      <div className="flex h-10 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-signal pulse-emerald" aria-hidden="true" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Terminal
          </span>
          <span className={`text-[10px] font-medium ${modeColor}`}>
            ({modeLabel})
          </span>
          {agentName && (
            <span className="text-[11px] font-mono text-cyan-glow/70">
              {agentName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {agentName && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-rose-alert/60 hover:text-rose-alert"
              onClick={() => abortAgent(agentName)}
              title="Interrupt agent"
              aria-label="Interrupt agent"
            >
              <SquareSlash className="h-3 w-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={handleClose}
            aria-label="Close terminal"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Terminal body */}
      <div ref={termContainerRef} className="xterm-container flex-1" />
    </div>
  );
}
