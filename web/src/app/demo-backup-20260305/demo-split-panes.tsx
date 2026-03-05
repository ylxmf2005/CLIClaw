"use client";

import { useDemoContext } from "./page";

function terminalLineColor(line: string): string {
  if (line.startsWith("$")) return "text-emerald-signal/60";
  if (line.startsWith(">")) return "text-cyan-glow/40";
  if (/^(warning|warn):/i.test(line)) return "text-amber-pulse/50";
  if (/^(error|issue):/i.test(line)) return "text-rose-alert/50";
  if (line.startsWith("Starting")) return "text-muted-foreground/40";
  return "text-foreground/50";
}

export function DemoTerminal() {
  const { state, dispatch } = useDemoContext();
  const agentName = state.terminalAgent ?? state.selectedChat?.agentName;
  const lines = agentName ? (state.terminalLines[agentName] ?? []) : [];

  return (
    <div className="flex h-full flex-col border-l border-border bg-card">
      <div className="flex h-10 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-signal pulse-emerald" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Terminal</span>
          {agentName && (
            <span className="text-[11px] font-mono text-cyan-glow/50">{agentName}</span>
          )}
        </div>
        <button
          onClick={() => dispatch({ type: "SET_SPLIT_PANE", pane: null })}
          className="flex h-6 w-6 items-center justify-center text-muted-foreground/40 hover:text-foreground"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="flex-1 p-3 font-mono text-xs leading-relaxed text-muted-foreground/60 overflow-y-auto">
        {lines.length === 0 && (
          <p className="text-muted-foreground/30">No terminal output{agentName ? ` for ${agentName}` : ""}</p>
        )}
        {lines.map((line, i) => (
          <p key={i} className={`${i > 0 ? "mt-1" : ""} ${terminalLineColor(line)}`}>{line}</p>
        ))}
        {lines.length > 0 && (
          <span className="inline-block h-3 w-1.5 bg-cyan-glow/50 animate-pulse mt-1" />
        )}
      </div>
    </div>
  );
}

export function DemoCronPanel() {
  const { state, dispatch } = useDemoContext();

  return (
    <div className="flex h-full flex-col border-l border-border bg-card">
      <div className="flex h-10 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2">
          <svg className="h-3.5 w-3.5 text-lavender-info" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Cron Schedules</span>
        </div>
        <button
          onClick={() => dispatch({ type: "SET_SPLIT_PANE", pane: null })}
          className="flex h-6 w-6 items-center justify-center text-muted-foreground/40 hover:text-foreground"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {state.cronSchedules.map((s) => (
          <div key={s.id} className="rounded-lg border border-border bg-background p-3">
            <div className="mb-2 flex items-center justify-between">
              <code className="text-xs font-semibold text-cyan-glow/80">{s.cron}</code>
              <span className={`h-3 w-6 rounded-full ${s.enabled ? "bg-emerald-signal/30" : "bg-accent"} flex items-center ${s.enabled ? "justify-end" : "justify-start"} px-0.5`}>
                <span className={`h-2 w-2 rounded-full ${s.enabled ? "bg-emerald-signal" : "bg-muted-foreground/30"}`} />
              </span>
            </div>
            {s.content.text && <p className="mb-2 truncate text-[11px] text-muted-foreground/60">{s.content.text}</p>}
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground/40">
              <span className={`h-2.5 w-2.5 ${s.enabled ? "text-emerald-signal" : ""}`}>
                {s.enabled ? "\u25B6" : "\u23F8"}
              </span>
              {s.timezone && <span>{s.timezone}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
