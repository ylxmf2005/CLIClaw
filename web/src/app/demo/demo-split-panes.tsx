"use client";

import { useDemoContext } from "./page";

export function DemoTerminal() {
  const { state, dispatch } = useDemoContext();

  return (
    <div className="flex h-full flex-col border-l border-white/[0.04] bg-[#06080f]">
      <div className="flex h-10 items-center justify-between border-b border-white/[0.04] px-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-signal pulse-emerald" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Terminal</span>
          <span className="text-[11px] font-mono text-cyan-glow/50">{state.selectedChat?.agentName}</span>
        </div>
        <button
          onClick={() => dispatch({ type: "SET_SPLIT_PANE", pane: null })}
          className="flex h-6 w-6 items-center justify-center text-muted-foreground/40 hover:text-foreground"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="flex-1 p-3 font-mono text-xs leading-relaxed text-muted-foreground/60 overflow-y-auto">
        <p className="text-emerald-signal/60">$ claude --session nex-abc12345</p>
        <p className="text-muted-foreground/40 mt-1">Starting session...</p>
        <p className="text-cyan-glow/40 mt-2">{">"} Reading PR diff for src/daemon/http/server.ts</p>
        <p className="text-foreground/50 mt-1">Found 3 files changed, 248 additions, 12 deletions</p>
        <p className="text-cyan-glow/40 mt-2">{">"} Analyzing CORS configuration...</p>
        <p className="text-amber-pulse/50 mt-1">Warning: origin set to &apos;*&apos; in development mode</p>
        <p className="text-cyan-glow/40 mt-2">{">"} Checking WebSocket auth middleware...</p>
        <p className="text-rose-alert/50 mt-1">Issue: Missing token validation on upgrade request</p>
        <p className="text-cyan-glow/40 mt-2">{">"} Reviewing src/daemon/http/server.ts...</p>
        <p className="text-foreground/50 mt-1">Checking CORS configuration</p>
        <span className="inline-block h-3 w-1.5 bg-cyan-glow/50 animate-pulse" />
      </div>
    </div>
  );
}

export function DemoCronPanel() {
  const { state, dispatch } = useDemoContext();

  return (
    <div className="flex h-full flex-col border-l border-white/[0.04] bg-[#080c16]">
      <div className="flex h-10 items-center justify-between border-b border-white/[0.04] px-3">
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
          <div key={s.id} className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-3">
            <div className="mb-2 flex items-center justify-between">
              <code className="text-xs font-semibold text-cyan-glow/80">{s.cron}</code>
              <span className={`h-3 w-6 rounded-full ${s.enabled ? "bg-emerald-signal/30" : "bg-white/[0.06]"} flex items-center ${s.enabled ? "justify-end" : "justify-start"} px-0.5`}>
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
