"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { Search, TerminalSquare, Trash2, X } from "lucide-react";
import type { WsEvent } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/providers/ws-provider";

const MAX_CHUNKS = 5000;

const TERMINAL_THEME = {
  background: "#0d0f14",
  foreground: "#c9d1d9",
  cursor: "#58a6ff",
  cursorAccent: "#0d0f14",
  selectionBackground: "#264f78",
  selectionForeground: "#ffffff",
  black: "#484f58",
  red: "#f85149",
  green: "#3fb950",
  yellow: "#d29922",
  blue: "#58a6ff",
  magenta: "#bc8cff",
  cyan: "#39c5cf",
  white: "#b1bac4",
  brightBlack: "#6e7681",
  brightRed: "#ff7b72",
  brightGreen: "#56d364",
  brightYellow: "#e3b341",
  brightBlue: "#79c0ff",
  brightMagenta: "#d2a8ff",
  brightCyan: "#56d4dd",
  brightWhite: "#ffffff",
};

function countNewlines(text: string): number {
  return (text.match(/\n/g) || []).length;
}

function sumNewlines(chunks: string[]): number {
  return chunks.reduce((total, chunk) => total + countNewlines(chunk), 0);
}

function safeLogLine(line?: string): string | null {
  if (!line || !line.trim()) return null;
  return line.endsWith("\n") ? line : `${line}\n`;
}

export interface AgentTerminalPaneProps {
  agentName: string;
  chatId: string;
  relayOn: boolean;
  onClose: () => void;
  initialPtyOutput?: string[];
  initialLogLine?: string;
  className?: string;
}

export function AgentTerminalPane({
  agentName,
  chatId,
  relayOn,
  onClose,
  initialPtyOutput = [],
  initialLogLine,
  className,
}: AgentTerminalPaneProps) {
  const { send, status, subscribe } = useWebSocket();
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const outputChunksRef = useRef<string[]>([]);
  const seededChatKeyRef = useRef<string | null>(null);

  const [lineCount, setLineCount] = useState(0);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const modeLabel = relayOn ? "interactive" : "read-only";

  const appendOutput = useCallback((chunk: string) => {
    if (!chunk) return;

    outputChunksRef.current.push(chunk);
    let removedLineCount = 0;
    if (outputChunksRef.current.length > MAX_CHUNKS) {
      const overflow = outputChunksRef.current.length - MAX_CHUNKS;
      const removed = outputChunksRef.current.splice(0, overflow);
      removedLineCount = sumNewlines(removed);
    }

    setLineCount((prev) => Math.max(0, prev + countNewlines(chunk) - removedLineCount));
    terminalRef.current?.write(chunk);
  }, []);

  const clearOutput = useCallback(() => {
    outputChunksRef.current = [];
    setLineCount(0);
    terminalRef.current?.clear();
  }, []);

  const findNext = useCallback(() => {
    if (!searchQuery) return;
    searchAddonRef.current?.findNext(searchQuery, { caseSensitive: false });
  }, [searchQuery]);

  const findPrevious = useCallback(() => {
    if (!searchQuery) return;
    searchAddonRef.current?.findPrevious(searchQuery, { caseSensitive: false });
  }, [searchQuery]);

  useEffect(() => {
    const chatKey = `${agentName}:${chatId}`;
    if (seededChatKeyRef.current === chatKey) return;
    seededChatKeyRef.current = chatKey;

    const initialLogChunk = safeLogLine(initialLogLine);
    const history = initialPtyOutput.length > 0
      ? initialPtyOutput
      : (initialLogChunk ? [initialLogChunk] : []);

    outputChunksRef.current = history.length > 0
      ? history.slice(-MAX_CHUNKS)
      : [`\x1b[90m[Attached to ${agentName} terminal (${modeLabel})]\x1b[0m\n`];

    setLineCount(sumNewlines(outputChunksRef.current));
    terminalRef.current?.clear();
    for (const chunk of outputChunksRef.current) {
      terminalRef.current?.write(chunk);
    }
  }, [agentName, chatId, initialLogLine, initialPtyOutput, modeLabel]);

  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      theme: TERMINAL_THEME,
      fontFamily: "ui-monospace, SFMono-Regular, \"SF Mono\", Menlo, Consolas, monospace",
      fontSize: 12,
      lineHeight: 1.4,
      convertEol: true,
      scrollback: 10000,
      cursorBlink: relayOn,
      cursorStyle: relayOn ? "block" : "bar",
      disableStdin: !relayOn,
      allowProposedApi: true,
    });
    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(searchAddon);
    terminal.open(containerRef.current);
    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    for (const chunk of outputChunksRef.current) {
      terminal.write(chunk);
    }

    const scheduleFit = () => {
      requestAnimationFrame(() => {
        try {
          fitAddon.fit();
          if (terminal.cols < 80) {
            terminal.resize(80, terminal.rows);
          }
        } catch {
          // Ignore transient layout errors.
        }
      });
    };

    scheduleFit();
    requestAnimationFrame(scheduleFit);

    const observer = new ResizeObserver(scheduleFit);
    observer.observe(containerRef.current);
    window.addEventListener("resize", scheduleFit);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleFit);
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, [agentName, chatId, relayOn]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;

    terminal.options.disableStdin = !relayOn;
    terminal.options.cursorBlink = relayOn;
    terminal.options.cursorStyle = relayOn ? "block" : "bar";
    if (relayOn) {
      terminal.focus();
    }
  }, [relayOn]);

  useEffect(() => {
    if (!relayOn || !terminalRef.current) return;

    const terminal = terminalRef.current;
    const disposable = terminal.onData((data: string) => {
      const selectedText = terminal.getSelection();
      if (selectedText && selectedText.length > 0) {
        // Match normal terminal behavior: typing should continue even when
        // prior mouse selection exists.
        terminal.clearSelection();
      }
      send({
        type: "agent.pty.input",
        payload: { name: agentName, chatId, data },
      });
    });

    return () => disposable.dispose();
  }, [agentName, chatId, relayOn, send]);

  useEffect(() => {
    return subscribe((event: WsEvent) => {
      if (event.type === "agent.pty.output") {
        const payload = event.payload as { name: string; chatId?: string; data: string };
        if (payload.name !== agentName) return;
        if (payload.chatId && payload.chatId !== chatId) return;
        appendOutput(payload.data);
        return;
      }

      if (!relayOn && event.type === "agent.log") {
        const payload = event.payload as { name: string; line: string };
        if (payload.name !== agentName) return;
        const content = safeLogLine(payload.line);
        if (content) appendOutput(content);
      }
    });
  }, [agentName, chatId, relayOn, subscribe, appendOutput]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setIsSearchOpen(true);
        requestAnimationFrame(() => searchInputRef.current?.focus());
      }

      if (event.key === "Escape" && isSearchOpen) {
        setIsSearchOpen(false);
        setSearchQuery("");
      }

      if (event.key === "Enter" && isSearchOpen) {
        event.preventDefault();
        if (event.shiftKey) {
          findPrevious();
        } else {
          findNext();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [findNext, findPrevious, isSearchOpen]);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden border-l border-[#2a2d35] bg-[#0d0f14]",
        className
      )}
    >
      <div className="flex h-10 items-center justify-between border-b border-[#21262d] px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#3fb950]" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8b949e]">
            Terminal
          </span>
          <span className="text-[10px] font-medium text-[#6e7681]">({modeLabel})</span>
          <span className="truncate text-[11px] font-mono text-[#79c0ff]/80">{agentName}</span>
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
              status === "connected" && "bg-[#238636]/20 text-[#56d364]",
              status === "connecting" && "bg-[#d29922]/20 text-[#d29922]",
              status === "disconnected" && "bg-[#484f58]/20 text-[#6e7681]"
            )}
          >
            {status}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={cn(
              "inline-flex h-6 w-6 items-center justify-center rounded-md text-[#8b949e] transition-colors hover:text-[#c9d1d9]",
              isSearchOpen && "bg-[#1f6feb]/20 text-[#79c0ff]"
            )}
            onClick={() => {
              setIsSearchOpen((prev) => {
                const next = !prev;
                if (next) {
                  requestAnimationFrame(() => searchInputRef.current?.focus());
                } else {
                  setSearchQuery("");
                }
                return next;
              });
            }}
            title="Search terminal (Cmd/Ctrl + F)"
            aria-label="Search terminal"
          >
            <Search className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[#8b949e] transition-colors hover:bg-[#21262d] hover:text-[#c9d1d9]"
            onClick={clearOutput}
            title="Clear output"
            aria-label="Clear output"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[#8b949e] transition-colors hover:bg-[#f85149]/10 hover:text-[#f85149]"
            onClick={onClose}
            title="Close terminal"
            aria-label="Close terminal"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {isSearchOpen && (
        <div className="flex items-center gap-2 border-b border-[#21262d] bg-[#161b22] px-3 py-2">
          <TerminalSquare className="h-3.5 w-3.5 text-[#8b949e]" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(event) => {
              const query = event.target.value;
              setSearchQuery(query);
              if (query) {
                searchAddonRef.current?.findNext(query, { caseSensitive: false });
              }
            }}
            placeholder="Search output..."
            className="w-full bg-transparent text-xs text-[#c9d1d9] outline-none placeholder:text-[#6e7681]"
          />
          <button
            type="button"
            onClick={findPrevious}
            className="rounded bg-[#21262d] px-1.5 py-0.5 text-[10px] text-[#8b949e] hover:text-[#c9d1d9]"
            title="Find previous (Shift + Enter)"
            aria-label="Find previous"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={findNext}
            className="rounded bg-[#21262d] px-1.5 py-0.5 text-[10px] text-[#8b949e] hover:text-[#c9d1d9]"
            title="Find next (Enter)"
            aria-label="Find next"
          >
            ↓
          </button>
        </div>
      )}

      <div
        className="xterm-container min-h-0 flex-1 overflow-hidden"
        onClick={() => terminalRef.current?.focus()}
      >
        <div ref={containerRef} className="h-full w-full" />
      </div>

      <div className="flex items-center justify-between border-t border-[#21262d] bg-[#0d1117] px-3 py-2 text-[10px]">
        <span className="font-mono text-[#6e7681]">{lineCount} lines</span>
        <span className="font-mono uppercase tracking-wider text-[#6e7681]">
          {relayOn ? "PTY interactive" : "Live logs"}
        </span>
      </div>
    </div>
  );
}
