"use client";

import { useDemoContext } from "./page";
import type { BottomTab } from "@/lib/types";
import { User, Users, MessageCircle, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatListItem } from "@/components/chats/chat-list-item";
import type { AgentState } from "@/components/shared/status-indicator";

// ─── Demo Bottom Tab Bar ────────────────────────────────────
const TABS: { id: BottomTab; label: string; icon: typeof User }[] = [
  { id: "agents", label: "Agents", icon: User },
  { id: "teams", label: "Teams", icon: Users },
  { id: "chats", label: "Chats", icon: MessageCircle },
  { id: "settings", label: "Settings", icon: Settings },
];

// ─── Demo Left Panel ────────────────────────────────────────
export function DemoLeftPanel() {
  const { state, dispatch } = useDemoContext();

  return (
    <div className="flex h-full w-80 flex-col border-r border-white/[0.04] bg-sidebar">
      {/* Header */}
      <div className="scanline relative flex h-14 items-center gap-3 border-b border-white/[0.04] px-4 overflow-hidden">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.02]">
          <svg width="16" height="16" viewBox="0 0 32 32" fill="none" className="text-cyan-glow">
            <path d="M16 2L2 9l14 7 14-7-14-7z" fill="currentColor" opacity="0.3" />
            <path d="M16 2L2 9l14 7 14-7-14-7zM2 23l14 7 14-7M2 16l14 7 14-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="flex-1">
          <h1 className="text-sm font-bold tracking-tight text-foreground">Hi-Boss</h1>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-signal pulse-emerald" />
            <span className="text-[10px] text-muted-foreground/50">Connected (demo)</span>
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto py-2">
        {state.activeTab === "chats" && <DemoChatList />}
        {state.activeTab === "agents" && <DemoAgentList />}
        {state.activeTab === "teams" && <DemoTeamList />}
        {state.activeTab === "settings" && <DemoSettingsPanel />}
      </div>

      {/* Bottom tab bar */}
      <div className="flex border-t border-white/[0.04]">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = state.activeTab === id;
          return (
            <button
              key={id}
              onClick={() => dispatch({ type: "SET_TAB", tab: id })}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] transition-colors",
                active
                  ? "text-cyan-glow"
                  : "text-muted-foreground/50 hover:text-muted-foreground"
              )}
            >
              {active && (
                <span className="absolute left-3 right-3 top-0 h-[2px] rounded-b bg-cyan-glow" />
              )}
              <Icon className="h-4 w-4" />
              <span className="font-medium">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Demo Chat List (Chats tab) ─────────────────────────────
function DemoChatList() {
  const { state, dispatch } = useDemoContext();

  // Build conversation entries from agents + teams, sorted by recency
  const entries = [
    ...state.agents.map((agent) => {
      const status = state.agentStatuses[agent.name];
      const envs = state.envelopes[`agent:${agent.name}`];
      const lastEnv = envs?.[envs.length - 1];
      const agentState: AgentState = status
        ? status.agentHealth === "error" ? "error"
        : status.agentState === "running" ? "running" : "idle"
        : "unknown";
      return {
        kind: "agent" as const,
        name: agent.name,
        subtitle: agent.description || agent.provider,
        lastMessage: lastEnv?.content.text,
        lastMessageAt: lastEnv?.createdAt ?? agent.lastSeenAt,
        agentState,
        pendingCount: status?.pendingCount,
      };
    }),
    ...state.teams.map((team) => ({
      kind: "team" as const,
      name: team.name,
      subtitle: team.description,
      memberCount: team.members.length,
      lastMessageAt: team.createdAt,
    })),
  ].sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0));

  return (
    <div className="space-y-0.5 px-1.5">
      {entries.map((entry) => (
        <ChatListItem
          key={`${entry.kind}:${entry.name}`}
          kind={entry.kind}
          name={entry.name}
          subtitle={entry.subtitle}
          lastMessage={"lastMessage" in entry ? entry.lastMessage : undefined}
          lastMessageAt={entry.lastMessageAt}
          agentState={"agentState" in entry ? entry.agentState : undefined}
          pendingCount={"pendingCount" in entry ? entry.pendingCount : undefined}
          memberCount={"memberCount" in entry ? entry.memberCount : undefined}
          isSelected={
            entry.kind === "agent"
              ? state.selectedChat?.agentName === entry.name
              : state.selectedTeam?.teamName === entry.name
          }
          onClick={() => {
            if (entry.kind === "agent") {
              dispatch({ type: "SELECT_CHAT", selection: { agentName: entry.name } });
            } else {
              dispatch({ type: "SELECT_TEAM", selection: { teamName: entry.name } });
            }
          }}
        />
      ))}
    </div>
  );
}

// ─── Demo Agent List (Agents tab) ───────────────────────────
function DemoAgentList() {
  const { state, dispatch } = useDemoContext();
  const AVATAR_COLORS = [
    "from-cyan-500 to-blue-600", "from-violet-500 to-purple-600",
    "from-amber-500 to-orange-600", "from-emerald-500 to-teal-600",
    "from-rose-500 to-pink-600", "from-indigo-500 to-blue-600",
  ];

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
          Agents <span className="ml-1.5 text-muted-foreground/40">{state.agents.length}</span>
        </h3>
      </div>
      <div className="animate-stagger space-y-0.5 px-1.5">
        {state.agents.map((agent) => {
          const status = state.agentStatuses[agent.name];
          const logLine = state.agentLogLines[agent.name];
          const isSelected = state.selectedChat?.agentName === agent.name;
          const agentState = status
            ? status.agentHealth === "error" ? "error"
            : status.agentState === "running" ? "running" : "idle"
            : "unknown";

          let hash = 0;
          for (let i = 0; i < agent.name.length; i++) hash = agent.name.charCodeAt(i) + ((hash << 5) - hash);
          const avatarColor = AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
          const parts = agent.name.split(/[-_]/);
          const initials = parts.length > 1
            ? (parts[0][0] + parts[1][0]).toUpperCase()
            : agent.name.slice(0, 2).toUpperCase();

          return (
            <button
              key={agent.name}
              onClick={() => dispatch({ type: "SELECT_CHAT", selection: { agentName: agent.name } })}
              className={cn(
                "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-150",
                isSelected ? "bg-cyan-glow/8 glow-cyan" : "hover:bg-white/[0.03]"
              )}
            >
              <div className={cn("relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-[11px] font-bold text-white shadow-lg", avatarColor)}>
                {initials}
                <span className={cn("absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full",
                  agentState === "running" ? "bg-amber-pulse pulse-amber"
                  : agentState === "error" ? "bg-rose-alert pulse-rose"
                  : agentState === "idle" ? "bg-emerald-signal pulse-emerald"
                  : "bg-muted-foreground"
                )} />
              </div>
              <div className="min-w-0 flex-1">
                <span className={cn("block truncate text-sm font-medium", isSelected ? "text-cyan-glow" : "text-foreground")}>
                  {agent.name}
                </span>
                {logLine && agentState === "running" ? (
                  <p className="truncate text-[11px] text-amber-pulse/70 font-mono">{logLine}</p>
                ) : (
                  <p className="truncate text-[11px] text-muted-foreground">{agent.description || agent.provider}</p>
                )}
              </div>
              {status?.pendingCount ? (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-glow/15 px-1.5 text-[10px] font-bold text-cyan-glow">
                  {status.pendingCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Demo Team List (Teams tab) ─────────────────────────────
function DemoTeamList() {
  const { state, dispatch } = useDemoContext();

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
          Teams <span className="ml-1.5 text-muted-foreground/40">{state.teams.length}</span>
        </h3>
      </div>
      <div className="space-y-0.5 px-1.5">
        {state.teams.map((team) => (
          <button
            key={team.name}
            onClick={() => dispatch({ type: "SELECT_TEAM", selection: { teamName: team.name } })}
            className={cn(
              "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-150",
              state.selectedTeam?.teamName === team.name ? "bg-cyan-glow/8 glow-cyan" : "hover:bg-white/[0.03]"
            )}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-lavender-info/10">
              <Users className="h-4 w-4 text-lavender-info" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">{team.name}</span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {team.members.length} members
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Demo Settings Panel ────────────────────────────────────
function DemoSettingsPanel() {
  const { dispatch } = useDemoContext();

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-center gap-2.5 rounded-lg border border-emerald-signal/20 bg-emerald-signal/5 p-3">
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-signal pulse-emerald" />
        <div>
          <p className="text-xs font-medium text-foreground">Connected</p>
          <p className="text-[10px] text-muted-foreground/50">WebSocket connected (demo)</p>
        </div>
      </div>
      <button
        onClick={() => dispatch({ type: "SET_VIEW", view: "admin" })}
        className="flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-xs text-muted-foreground transition-colors hover:bg-white/[0.03] hover:text-foreground"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" />
          <circle cx="6" cy="6" r="1" fill="currentColor" /><circle cx="6" cy="18" r="1" fill="currentColor" />
        </svg>
        Daemon Status
      </button>
      <button className="flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-xs text-muted-foreground/50 transition-colors hover:bg-white/[0.03] hover:text-rose-alert">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
        </svg>
        Disconnect
      </button>
    </div>
  );
}
