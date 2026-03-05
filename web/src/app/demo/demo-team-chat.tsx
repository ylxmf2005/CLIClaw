"use client";

import { useState } from "react";
import { useDemoContext } from "./page";
import { cn, formatMessageTime } from "@/lib/utils";
import { getSenderColor } from "@/lib/colors";
import { MessageContent } from "@/components/shared/message-content";
import { DemoComposer } from "./demo-composer";
import { MentionChip } from "@/components/chat/mention-chip";

function parseAddr(a: string) {
  if (a.startsWith("agent:")) return { type: "agent", name: a.slice(6).split(":")[0] };
  if (a.startsWith("channel:")) return { type: "channel", name: a.split(":").slice(1).join(":") };
  return { type: "unknown", name: a };
}

/** Small `>_` terminal toggle button reused in member panel + message headers. */
function TerminalButton({ agentName, size = "sm" }: { agentName: string; size?: "sm" | "xs" }) {
  const { state, dispatch } = useDemoContext();
  const isActive = state.splitPane === "terminal" && state.terminalAgent === agentName;
  const iconSize = size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5";
  const btnSize = size === "xs" ? "h-5 w-5" : "h-6 w-6";

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (isActive) {
          dispatch({ type: "SET_SPLIT_PANE", pane: null });
        } else {
          dispatch({ type: "SET_TERMINAL_AGENT", agent: agentName });
          dispatch({ type: "SET_SPLIT_PANE", pane: "terminal" });
        }
      }}
      title={`Terminal: ${agentName}`}
      aria-label={`Open terminal for ${agentName}`}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded transition-colors",
        btnSize,
        isActive
          ? "text-cyan-glow bg-cyan-glow/10"
          : "text-muted-foreground/40 hover:text-foreground hover:bg-accent"
      )}
    >
      <svg className={iconSize} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 17l6-6-6-6M12 19h8" />
      </svg>
    </button>
  );
}


export function DemoTeamChat() {
  const { state, dispatch } = useDemoContext();
  const [showMembers, setShowMembers] = useState(false);

  const team = state.teams.find((t) => t.name === state.selectedTeam?.teamName);
  if (!team) return null;

  const envelopes = state.envelopes[`team:${team.name}`] || [];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-border bg-card/80 px-4 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-lavender-info/10">
            <svg className="h-4 w-4 text-lavender-info" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">{team.name}</h2>
            <p className="text-[11px] text-muted-foreground">{team.members.length} members{team.description ? ` · ${team.description}` : ""}</p>
          </div>
        </div>
        <button
          onClick={() => setShowMembers(!showMembers)}
          title="Toggle members"
          aria-label="Toggle members panel"
          aria-pressed={showMembers}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:outline-none",
            showMembers ? "text-cyan-glow" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
          </svg>
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Messages */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <div className="chat-content-shell space-y-1">
              {envelopes.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-background">
                    <svg className="h-6 w-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-foreground">{team.name}</p>
                  {team.description && (
                    <p className="mt-1 text-xs text-muted-foreground">{team.description}</p>
                  )}
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    {team.members.map((name) => {
                      const st = state.agentStatuses[name];
                      const agentState = st
                        ? st.agentHealth === "error" ? "error" : st.agentState === "running" ? "running" : "idle"
                        : "unknown";
                      return (
                        <span key={name} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground">
                          <span className={cn("h-1.5 w-1.5 rounded-full",
                            agentState === "running" ? "bg-amber-pulse"
                            : agentState === "error" ? "bg-rose-alert"
                            : agentState === "idle" ? "bg-emerald-signal"
                            : "bg-muted-foreground"
                          )} />
                          {name}
                        </span>
                      );
                    })}
                  </div>
                  <p className="mt-4 text-[11px] text-muted-foreground/60">No messages yet</p>
                </div>
              )}
              {envelopes.map((env, i) => {
                const from = parseAddr(env.from);
                const isSameSender = i > 0 && parseAddr(envelopes[i - 1].from).name === from.name;

                return (
                  <div key={env.id} className={`group relative rounded-lg px-4 py-2 transition-colors hover:bg-accent/50 ${!isSameSender && i > 0 ? "mt-3" : ""}`}>
                    {!isSameSender && (
                      <div className="mb-1 flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent">
                          <svg className="h-3.5 w-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <rect x="3" y="11" width="18" height="11" rx="2" /><circle cx="12" cy="5" r="3" />
                          </svg>
                        </span>
                        <span className={`text-sm font-semibold ${getSenderColor(from.name)}`}>{from.name}</span>
                        <span className="text-[11px] text-muted-foreground">{formatMessageTime(env.createdAt)}</span>
                        {from.type === "agent" && (
                          <TerminalButton agentName={from.name} size="xs" />
                        )}
                      </div>
                    )}
                    <div className="pl-8 text-sm leading-relaxed text-foreground/90">
                      <MessageContent text={env.content.text ?? ""} mentions={team.members} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Composer with mock mention chips */}
          <div className="border-t border-border bg-card px-4 pt-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <MentionChip name="@all" onRemove={() => {}} disabled />
              <MentionChip name={team.members[0] ?? "nex"} onRemove={() => {}} disabled />
            </div>
          </div>
          <DemoComposer
            placeholder={`Use @ to mention members or @all`}
            onSend={(text) => {
              dispatch({ type: "ADD_ENVELOPE", to: `team:${team.name}`, text });
              dispatch({ type: "CLEAR_DRAFT", key: `team:${team.name}` });
            }}
            draft={state.drafts[`team:${team.name}`]}
            onDraftChange={(text) =>
              dispatch({ type: "SET_DRAFT", key: `team:${team.name}`, text })
            }
          />
        </div>

        {/* Member panel */}
        {showMembers && (
          <div className="w-60 shrink-0 border-l border-border bg-card/50 overflow-y-auto">
            <div className="px-3 py-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
                Members — {team.members.length}
              </h3>
            </div>
            <div className="space-y-0.5 px-2">
              {team.members.map((name) => {
                const status = state.agentStatuses[name];
                const agentState = status
                  ? status.agentHealth === "error" ? "error"
                  : status.agentState === "running" ? "running" : "idle"
                  : "unknown";
                const agent = state.agents.find((a) => a.name === name);

                return (
                  <div key={name} className="flex items-center gap-2.5 rounded-lg px-2 py-2">
                    <span role="status" aria-label={`Status: ${agentState}`} className={cn("h-2 w-2 rounded-full",
                      agentState === "running" ? "bg-amber-pulse pulse-amber"
                      : agentState === "error" ? "bg-rose-alert"
                      : agentState === "idle" ? "bg-emerald-signal"
                      : "bg-muted-foreground"
                    )} />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{name}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {agentState === "running" ? "Running" : agentState === "error" ? "Error" : "Idle"}
                        {agent?.provider ? ` · ${agent.provider}` : ""}
                      </span>
                    </div>
                    <TerminalButton agentName={name} size="sm" />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
