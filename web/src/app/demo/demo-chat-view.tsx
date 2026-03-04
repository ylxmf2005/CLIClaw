"use client";

import { useDemoContext } from "./page";

const SENDER_COLORS = ["text-cyan-400", "text-violet-400", "text-amber-400", "text-emerald-400", "text-rose-400"];

function getSenderColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return SENDER_COLORS[Math.abs(h) % SENDER_COLORS.length];
}

function parseAddr(a: string) {
  if (a.startsWith("agent:")) return { type: "agent", name: a.slice(6).split(":")[0] };
  if (a.startsWith("channel:")) return { type: "channel", name: a.split(":").slice(1).join(":") };
  return { type: "unknown", name: a };
}

function fmtTime(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function DemoChatView() {
  const { state, dispatch } = useDemoContext();
  const sel = state.selectedChat;
  if (!sel) return null;

  const agent = state.agents.find((a) => a.name === sel.agentName);
  const status = state.agentStatuses[sel.agentName];
  const envelopes = state.envelopes[`agent:${sel.agentName}`] || [];
  const logLine = state.agentLogLines[sel.agentName];
  const agentState = status
    ? status.agentHealth === "error" ? "error"
    : status.agentState === "running" ? "running" : "idle"
    : "unknown";

  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-white/[0.04] bg-[#080c16]/80 px-4 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <span className={`h-2.5 w-2.5 rounded-full ${
            agentState === "running" ? "bg-amber-pulse pulse-amber"
            : agentState === "error" ? "bg-rose-alert pulse-rose"
            : "bg-emerald-signal pulse-emerald"
          }`} />
          <div>
            <h2 className="text-sm font-semibold text-foreground">{sel.agentName}</h2>
          </div>
          {agent?.provider && (
            <span className="rounded bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
              {agent.provider}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {[
            { icon: "M12 5v14M5 12h14", label: "New chat", action: () => {} },
            {
              icon: "M4 17l6-6-6-6M12 19h8",
              label: "Terminal",
              active: state.splitPane === "terminal",
              action: () => dispatch({ type: "SET_SPLIT_PANE", pane: state.splitPane === "terminal" ? null : "terminal" }),
            },
            {
              icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
              label: "Cron",
              active: state.splitPane === "cron",
              action: () => dispatch({ type: "SET_SPLIT_PANE", pane: state.splitPane === "cron" ? null : "cron" }),
            },
          ].map((btn, i) => (
            <button
              key={i}
              onClick={btn.action}
              title={btn.label}
              className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                btn.active ? "text-cyan-glow" : "text-muted-foreground/50 hover:text-foreground"
              }`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d={btn.icon} />
              </svg>
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="mx-auto max-w-3xl space-y-1">
          {envelopes.map((env, i) => {
            const from = parseAddr(env.from);
            const isSameSender = i > 0 && parseAddr(envelopes[i - 1].from).name === from.name;

            return (
              <div key={env.id} className={`group relative rounded-lg px-4 py-2 transition-colors hover:bg-white/[0.02] ${!isSameSender && i > 0 ? "mt-3" : ""}`}>
                {!isSameSender && (
                  <div className="mb-1 flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.05]">
                      <svg className="h-3.5 w-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        {from.type === "agent"
                          ? <><rect x="3" y="11" width="18" height="11" rx="2" /><circle cx="12" cy="5" r="3" /></>
                          : <><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></>
                        }
                      </svg>
                    </span>
                    <span className={`text-sm font-semibold ${getSenderColor(from.name)}`}>{from.name}</span>
                    {env.fromBoss && (
                      <span className="rounded bg-amber-pulse/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-pulse">boss</span>
                    )}
                    <span className="text-[11px] text-muted-foreground/40">{fmtTime(env.createdAt)}</span>
                  </div>
                )}
                <div className="pl-8 text-sm leading-relaxed text-foreground/90">
                  <div className="whitespace-pre-wrap break-words message-content">{env.content.text}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Log preview */}
      {agentState === "running" && logLine && (
        <div className="border-t border-amber-pulse/10 bg-amber-pulse/[0.03] px-4 py-2">
          <p className="mx-auto max-w-3xl truncate font-mono text-[11px] text-amber-pulse/60">
            <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-amber-pulse pulse-amber" />
            {logLine}
          </p>
        </div>
      )}

      {/* Composer */}
      <div className="border-t border-white/[0.04] bg-[#080c16] px-4 py-3">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
            <button className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground/40">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <div className="min-h-[32px] flex-1 text-sm text-muted-foreground/30">Message {sel.agentName}...</div>
            <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-muted-foreground/30">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-muted-foreground/30">
            <kbd className="rounded bg-white/[0.04] px-1 py-0.5 font-mono text-[9px]">Enter</kbd> to send, <kbd className="rounded bg-white/[0.04] px-1 py-0.5 font-mono text-[9px]">Shift+Enter</kbd> for new line
          </p>
        </div>
      </div>
    </div>
  );
}
