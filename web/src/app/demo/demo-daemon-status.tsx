"use client";

import { useDemoContext } from "./page";

export function DemoDaemonStatus() {
  const { state } = useDemoContext();
  const ds = state.daemonStatus;
  const runningAgents = state.agents.filter(
    (a) => state.agentStatuses[a.name]?.agentState === "running"
  );

  return (
    <div className="flex flex-1 flex-col bg-grid">
      <div className="flex h-14 items-center border-b border-white/[0.04] bg-[#080c16]/80 px-6 backdrop-blur-sm">
        <svg className="mr-3 h-5 w-5 text-cyan-glow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" />
          <circle cx="6" cy="6" r="1" fill="currentColor" /><circle cx="6" cy="18" r="1" fill="currentColor" />
        </svg>
        <h2 className="font-display text-lg font-semibold">Daemon Status</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          <div className="flex items-center gap-3 rounded-xl border border-emerald-signal/20 bg-emerald-signal/5 p-4">
            <svg className="h-5 w-5 text-emerald-signal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M5 12.55a11 11 0 0114.08 0M1.42 9a16 16 0 0121.16 0M8.53 16.11a6 6 0 016.95 0M12 20h.01" />
            </svg>
            <div>
              <p className="text-sm font-medium">Connected to daemon</p>
              {ds?.startTimeMs && <p className="text-xs text-muted-foreground">Uptime: 2d 5h</p>}
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Agents", value: state.agents.length, sub: `${runningAgents.length} running` },
              { label: "Teams", value: state.teams.length },
              { label: "Cron Jobs", value: state.cronSchedules.filter((c) => c.enabled).length, sub: `${state.cronSchedules.length} total` },
              { label: "Adapters", value: ds?.adapters.length ?? 0 },
            ].map((s, i) => (
              <div key={i} className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-4">
                <p className="text-2xl font-bold tabular-nums text-foreground">{s.value}</p>
                <p className="text-[11px] text-muted-foreground/60">{s.label}</p>
                {s.sub && <p className="mt-0.5 text-[10px] text-muted-foreground/40">{s.sub}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
