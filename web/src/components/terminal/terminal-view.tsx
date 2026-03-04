"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAppState } from "@/providers/app-state-provider";
import { useWebSocket } from "@/providers/ws-provider";
import { Button } from "@/components/ui/button";
import { X, Search, SquareSlash } from "lucide-react";
import { abortAgent } from "@/lib/api";
import type { WsEvent } from "@/lib/types";

export function TerminalView() {
  const { state, dispatch } = useAppState();
  const { subscribe } = useWebSocket();
  const termContainerRef = useRef<HTMLDivElement>(null);
  const termInstanceRef = useRef<{ term: unknown; fitAddon: unknown } | null>(null);
  const logBufferRef = useRef<string[]>([]);

  const agentName = state.selectedChat?.agentName;

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
        theme: {
          background: "#06080f",
          foreground: "#94a3b8",
          cursor: "#00d4ff",
          cursorAccent: "#06080f",
          selectionBackground: "rgba(0, 212, 255, 0.15)",
          black: "#0f1525",
          red: "#f43f5e",
          green: "#10b981",
          yellow: "#f59e0b",
          blue: "#3b82f6",
          magenta: "#a78bfa",
          cyan: "#00d4ff",
          white: "#e2e8f0",
          brightBlack: "#475569",
          brightRed: "#fb7185",
          brightGreen: "#34d399",
          brightYellow: "#fbbf24",
          brightBlue: "#60a5fa",
          brightMagenta: "#c4b5fd",
          brightCyan: "#22d3ee",
          brightWhite: "#f8fafc",
        },
        fontSize: 12,
        fontFamily: "var(--font-geist-mono), monospace",
        lineHeight: 1.4,
        scrollback: 5000,
        cursorBlink: false,
        cursorStyle: "bar",
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
  }, []);

  // Subscribe to agent log events
  useEffect(() => {
    if (!agentName) return;

    return subscribe((event: WsEvent) => {
      if (
        event.type === "agent.log" &&
        (event.payload as { name: string }).name === agentName
      ) {
        const line = (event.payload as { line: string }).line;
        logBufferRef.current.push(line);
        // Keep buffer bounded
        if (logBufferRef.current.length > 5000) {
          logBufferRef.current = logBufferRef.current.slice(-4000);
        }
        const inst = termInstanceRef.current;
        if (inst) {
          (inst.term as { writeln: (s: string) => void }).writeln(line);
        }
      }
    });
  }, [agentName, subscribe]);

  const handleClose = useCallback(() => {
    dispatch({ type: "SET_SPLIT_PANE", pane: null });
  }, [dispatch]);

  return (
    <div className="flex h-full flex-col border-l border-white/[0.04] bg-[#06080f]">
      {/* Terminal header */}
      <div className="flex h-10 items-center justify-between border-b border-white/[0.04] px-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-signal pulse-emerald" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Terminal
          </span>
          {agentName && (
            <span className="text-[11px] font-mono text-cyan-glow/50">
              {agentName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground/40 hover:text-foreground"
            title="Search terminal"
          >
            <Search className="h-3 w-3" />
          </Button>
          {agentName && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-rose-alert/50 hover:text-rose-alert"
              onClick={() => abortAgent(agentName)}
              title="Interrupt agent"
            >
              <SquareSlash className="h-3 w-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground/40 hover:text-foreground"
            onClick={handleClose}
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
