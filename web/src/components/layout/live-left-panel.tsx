"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAppState } from "@/providers/app-state-provider";
import { useRouteSelection } from "@/hooks/use-route-selection";
import { useActiveTab } from "@/hooks/use-active-tab";
import { useWebSocket } from "@/providers/ws-provider";
import { useAuth } from "@/providers/auth-provider";
import { useTheme } from "@/providers/theme-provider";
import * as api from "@/lib/api";
import { ChatListItem } from "@/components/chats/chat-list-item";
import type { BottomTab } from "@/lib/types";
import type { AgentState } from "@/components/shared/status-indicator";
import { cn, formatTime } from "@/lib/utils";
import { getAvatarColor, getInitials } from "@/lib/colors";
import {
  User,
  Users,
  MessageCircle,
  Settings,
  Settings2,
  Plus,
  ChevronDown,
  ChevronRight,
  Sun,
  Moon,
  Wifi,
  WifiOff,
  Trash2,
  Pin,
  PinOff,
  Check,
  X,
  ChevronsDown,
} from "lucide-react";
import { AgentDetailSheet } from "@/components/agents/agent-detail-sheet";
import type { Agent } from "@/lib/types";

// ─── Bottom Tab Bar ────────────────────────────────────────
const TABS: { id: BottomTab; label: string; icon: typeof User }[] = [
  { id: "agents", label: "Agents", icon: User },
  { id: "teams", label: "Teams", icon: Users },
  { id: "settings", label: "Settings", icon: Settings },
];

interface LiveLeftPanelProps {
  onCreateAgent?: () => void;
  onCreateTeam?: () => void;
}

export function LiveLeftPanel({ onCreateAgent, onCreateTeam }: LiveLeftPanelProps) {
  const [activeTab, setActiveTab] = useActiveTab();
  const { status: wsStatus } = useWebSocket();
  const isConnected = wsStatus === "connected";

  return (
    <div className="flex h-full w-80 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Header */}
      <div className="scanline relative flex h-14 items-center gap-3 border-b border-sidebar-border px-4 overflow-hidden">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-accent/30">
          <svg width="16" height="16" viewBox="0 0 32 32" fill="none" className="text-cyan-glow">
            <path d="M16 2L2 9l14 7 14-7-14-7z" fill="currentColor" opacity="0.3" />
            <path d="M16 2L2 9l14 7 14-7-14-7zM2 23l14 7 14-7M2 16l14 7 14-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="flex-1">
          <h1 className="text-sm font-bold tracking-tight text-foreground">Hi-Boss</h1>
          <div className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${isConnected ? "bg-emerald-signal pulse-emerald" : "bg-rose-alert"}`} />
            <span className="text-[10px] text-muted-foreground">
              {isConnected ? "Connected" : "Disconnected"}
            </span>
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto py-2">
        {activeTab === "agents" && <LiveAgentList onCreateAgent={onCreateAgent} />}
        {activeTab === "teams" && <LiveTeamList onCreateTeam={onCreateTeam} />}
        {activeTab === "settings" && <LiveSettingsPanel />}
      </div>

      {/* Bottom tab bar */}
      <nav aria-label="Main navigation" role="tablist" className="flex border-t border-sidebar-border">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={active}
              aria-label={label}
              onClick={() => setActiveTab(id)}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] transition-colors focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:outline-none",
                active ? "text-cyan-glow" : "text-muted-foreground hover:text-muted-foreground"
              )}
            >
              {active && <span className="absolute left-3 right-3 top-0 h-[2px] rounded-b bg-cyan-glow" />}
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span className="font-medium">{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

// ─── Chat List (Chats tab) ─────────────────────────────────
function LiveChatList() {
  const { state } = useAppState();
  const router = useRouter();
  const { agentName: selAgent, chatId: selChat, teamName: selTeam } = useRouteSelection();

  const sessionEntries = Object.entries(state.sessions).flatMap(([agentName, sessions]) => {
    const convos = state.conversations[agentName] || [];
    const status = state.agentStatuses[agentName];
    const agentState: AgentState = status
      ? status.agentHealth === "error" ? "error"
      : status.agentState === "running" ? "running" : "idle"
      : "unknown";

    return sessions
      .filter((session) => (session.bindings || []).some((b) => b.adapterType !== "internal"))
      .map((session) => {
      const bindings = (session.bindings || []).filter((b) => b.adapterType !== "internal");
      const primaryBinding =
        bindings.find((b) => b.adapterType !== "console") ??
        bindings[0];
      const routeChatId = primaryBinding?.chatId ?? session.id;
      const convo =
        convos.find((c) => bindings.some((b) => b.chatId === c.chatId)) ??
        convos.find((c) => c.chatId === routeChatId);
      const adapterTypes = Array.from(new Set(bindings.map((b) => b.adapterType)));

      return {
        kind: "agent" as const,
        id: session.id,
        name: agentName,
        chatId: routeChatId,
        chatLabel: routeChatId,
        subtitle: convo?.lastMessage,
        lastMessage: convo?.lastMessage,
        lastMessageAt: convo?.lastMessageAt ?? session.lastActivityAt ?? session.createdAt,
        agentState,
        pendingCount: status?.pendingCount,
        unreadCount: convo?.unreadCount,
        adapterTypes,
        hasSelectedBinding:
          selAgent === agentName &&
          !!selChat &&
          bindings.some((b) => b.chatId === selChat),
      };
    });
  });

  // Build entries from session chats + teams, sorted by recency
  const entries = [
    ...sessionEntries,
    ...state.teams.map((team) => {
      const meta = team.metadata as { lastMessage?: string; lastMessageAt?: number } | undefined;
      return {
        kind: "team" as const,
        id: `team:${team.name}`,
        name: team.name,
        chatId: undefined as string | undefined,
        chatLabel: undefined as string | undefined,
        subtitle: team.description,
        lastMessage: meta?.lastMessage,
        memberCount: team.members.length,
        lastMessageAt: meta?.lastMessageAt ?? team.createdAt,
      };
    }),
  ].sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0));

  return (
    <div className="space-y-0.5 px-1.5">
      {entries.map((entry) => (
        <ChatListItem
          key={`${entry.kind}:${entry.id}`}
          kind={entry.kind}
          name={entry.name}
          chatLabel={entry.chatLabel}
          subtitle={entry.subtitle}
          lastMessage={"lastMessage" in entry ? entry.lastMessage : undefined}
          lastMessageAt={entry.lastMessageAt}
          agentState={"agentState" in entry ? entry.agentState : undefined}
          pendingCount={"pendingCount" in entry ? entry.pendingCount : undefined}
          memberCount={"memberCount" in entry ? entry.memberCount : undefined}
          unreadCount={"unreadCount" in entry ? entry.unreadCount : undefined}
          adapterTypes={"adapterTypes" in entry ? entry.adapterTypes : undefined}
          isSelected={
            entry.kind === "agent"
              ? ("hasSelectedBinding" in entry && entry.hasSelectedBinding) || (selAgent === entry.name && selChat === entry.chatId)
              : selTeam === entry.name
          }
          onClick={() => {
            if (entry.kind === "agent" && entry.chatId) {
              router.push(`/agents/${entry.name}/${entry.chatId}`);
            } else if (entry.kind === "team") {
              router.push(`/teams/${entry.name}`);
            }
          }}
        />
      ))}
    </div>
  );
}

// ─── Agent List (Agents tab) ───────────────────────────────

const CHATS_PER_PAGE = 8;

function LiveAgentList({ onCreateAgent }: { onCreateAgent?: () => void }) {
  const { state, loadSessions, loadConversations } = useAppState();
  const router = useRouter();
  const { agentName: selAgent, chatId: selChat } = useRouteSelection();
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [detailAgent, setDetailAgent] = useState<Agent | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [chatLimits, setChatLimits] = useState<Record<string, number>>({});
  const [confirmDelete, setConfirmDelete] = useState<{ agentName: string; chatId: string; sessionId: string } | null>(null);
  const [renamingChat, setRenamingChat] = useState<{ agentName: string; chatId: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const handleOpenDetail = (agent: Agent) => {
    setDetailAgent(agent);
    setDetailOpen(true);
  };

  const handleDeleteChat = useCallback(async (agentName: string, sessionId: string, chatId: string) => {
    try {
      await api.deleteSession(agentName, sessionId);
      await loadSessions(agentName);
      await loadConversations(agentName);
      // Navigate away if the deleted chat was selected
      if (selAgent === agentName && selChat === chatId) {
        const convos = state.conversations[agentName]?.filter(c => c.chatId !== chatId) || [];
        if (convos.length > 0) {
          router.push(`/agents/${agentName}/${convos[0].chatId}`);
        } else {
          router.push(`/agents/${agentName}/default`);
        }
      }
    } catch {
      // silent
    }
    setConfirmDelete(null);
  }, [loadSessions, loadConversations, selAgent, selChat, state.conversations, router]);

  const handlePinChat = useCallback(async (agentName: string, sessionId: string, currentPinned: boolean) => {
    try {
      await api.updateSession(agentName, sessionId, { pinned: !currentPinned });
      await loadSessions(agentName);
    } catch {
      // silent
    }
  }, [loadSessions]);

  const handleRenameChat = useCallback(async (agentName: string, sessionId: string, newLabel: string) => {
    try {
      await api.updateSession(agentName, sessionId, { label: newLabel || null });
      await loadSessions(agentName);
      await loadConversations(agentName);
    } catch {
      // silent
    }
    setRenamingChat(null);
  }, [loadSessions, loadConversations]);

  const startRename = useCallback((agentName: string, chatId: string, currentLabel: string) => {
    setRenamingChat({ agentName, chatId });
    setRenameValue(currentLabel);
    setTimeout(() => renameInputRef.current?.focus(), 50);
  }, []);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
          Agents <span className="ml-1.5 text-muted-foreground">{state.agents.length}</span>
        </h3>
        {onCreateAgent && (
          <button
            onClick={onCreateAgent}
            title="Create agent"
            aria-label="Create agent"
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:outline-none"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="animate-stagger space-y-0.5 px-1.5">
        {state.agents.map((agent) => {
          const status = state.agentStatuses[agent.name];
          const logLine = state.agentLogLines[agent.name];
          const isSelected = selAgent === agent.name;
          const agentState = status
            ? status.agentHealth === "error" ? "error"
            : status.agentState === "running" ? "running" : "idle"
            : "unknown";
          const avatarColor = getAvatarColor(agent.name);
          const initials = getInitials(agent.name);
          const agentConvos = state.conversations[agent.name] || [];
          const sessions = state.sessions[agent.name] || [];
          const hasChats = agentConvos.length > 0;
          const isExpanded = expandedAgents.has(agent.name);

          // Sort: pinned first, then by recency
          const sortedConvos = [...agentConvos].sort((a, b) => {
            const aSession = sessions.find(s => s.bindings.some(bind => bind.chatId === a.chatId));
            const bSession = sessions.find(s => s.bindings.some(bind => bind.chatId === b.chatId));
            const aPinned = aSession?.pinned ? 1 : 0;
            const bPinned = bSession?.pinned ? 1 : 0;
            if (aPinned !== bPinned) return bPinned - aPinned;
            return (b.lastMessageAt ?? b.createdAt) - (a.lastMessageAt ?? a.createdAt);
          });

          const limit = chatLimits[agent.name] || CHATS_PER_PAGE;
          const visibleConvos = sortedConvos.slice(0, limit);
          const hasMore = sortedConvos.length > limit;

          return (
            <div key={agent.name}>
              <button
                onClick={() => {
                  if (hasChats) {
                    setExpandedAgents((prev) => {
                      const next = new Set(prev);
                      next.has(agent.name) ? next.delete(agent.name) : next.add(agent.name);
                      return next;
                    });
                  } else {
                    router.push(`/agents/${agent.name}/default`);
                  }
                }}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-150 focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:outline-none",
                  isSelected ? "bg-cyan-glow/10 glow-cyan" : "hover:bg-sidebar-accent"
                )}
              >
                <div className={cn("relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-[11px] font-bold text-white shadow-lg", avatarColor)}>
                  {initials}
                  <span aria-label={`Status: ${agentState}`} className={cn("absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full",
                    agentState === "running" ? "bg-amber-pulse pulse-amber"
                    : agentState === "error" ? "bg-rose-alert pulse-rose"
                    : agentState === "idle" ? "bg-emerald-signal pulse-emerald"
                    : "bg-muted-foreground"
                  )} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("block truncate text-sm font-medium", isSelected ? "text-cyan-glow" : "text-foreground")}>
                      {agent.name}
                    </span>
                    {status?.pendingCount ? (
                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-cyan-glow/15 px-1 text-[10px] font-bold leading-none text-cyan-glow">
                        {status.pendingCount}
                      </span>
                    ) : null}
                  </div>
                  {logLine && agentState === "running" ? (
                    <p className="truncate text-[11px] text-amber-pulse/70 font-mono">{logLine}</p>
                  ) : (
                    <p className="truncate text-[11px] text-muted-foreground">{agent.description || agent.provider}</p>
                  )}
                </div>
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Settings for ${agent.name}`}
                  className="shrink-0 rounded-md p-1.5 text-muted-foreground/50 transition-all hover:bg-accent hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenDetail(agent);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.stopPropagation();
                      e.preventDefault();
                      handleOpenDetail(agent);
                    }
                  }}
                >
                  <Settings2 className="h-4 w-4" />
                </span>
                {hasChats && (isExpanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />)}
              </button>

              {hasChats && isExpanded && (
                <div className="ml-6 space-y-0.5 border-l border-sidebar-border pl-3 py-1">
                  {visibleConvos.map((convo) => {
                    const isChatSelected = selAgent === agent.name && selChat === convo.chatId;
                    const session = sessions.find(s => s.bindings.some(b => b.chatId === convo.chatId));
                    const isPinned = session?.pinned ?? false;
                    const sessionLabel = session?.label || convo.label;
                    const displayLabel = sessionLabel || convo.chatId;
                    const isRenaming = renamingChat?.agentName === agent.name && renamingChat?.chatId === convo.chatId;
                    const isDeleting = confirmDelete?.agentName === agent.name && confirmDelete?.chatId === convo.chatId;
                    const adapterTypes = session ? Array.from(new Set(session.bindings.map(b => b.adapterType).filter(t => t !== "internal"))) : [];

                    return (
                      <div key={convo.chatId} className="group/chat relative">
                        {/* Delete confirmation overlay */}
                        {isDeleting && (
                          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-background/95 backdrop-blur-sm px-2">
                            <span className="text-[10px] text-rose-alert mr-2">Delete?</span>
                            <button
                              onClick={() => handleDeleteChat(agent.name, confirmDelete.sessionId, convo.chatId)}
                              className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-rose-alert/15 text-rose-alert hover:bg-rose-alert/25 transition-colors mr-1"
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-accent text-muted-foreground hover:text-foreground transition-colors"
                            >
                              No
                            </button>
                          </div>
                        )}

                        <button
                          onClick={() => router.push(`/agents/${agent.name}/${convo.chatId}`)}
                          onDoubleClick={(e) => {
                            e.preventDefault();
                            if (session) startRename(agent.name, convo.chatId, sessionLabel || "");
                          }}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors",
                            isChatSelected ? "bg-cyan-glow/10 text-cyan-glow" : "hover:bg-sidebar-accent text-muted-foreground"
                          )}
                        >
                          <MessageCircle className="h-3 w-3 shrink-0" />
                          <div className="min-w-0 flex-1">
                            {/* Chat label row */}
                            <div className="flex items-center gap-1">
                              {isPinned && <Pin className="h-2.5 w-2.5 shrink-0 text-cyan-glow/60" />}
                              {isRenaming ? (
                                <form
                                  className="flex items-center gap-1 flex-1"
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    if (session) handleRenameChat(agent.name, session.id, renameValue);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <input
                                    ref={renameInputRef}
                                    value={renameValue}
                                    onChange={(e) => setRenameValue(e.target.value)}
                                    className="h-5 flex-1 rounded border border-cyan-glow/30 bg-background px-1 text-xs text-foreground outline-none focus:border-cyan-glow"
                                    onKeyDown={(e) => {
                                      if (e.key === "Escape") setRenamingChat(null);
                                    }}
                                    onBlur={() => {
                                      if (session) handleRenameChat(agent.name, session.id, renameValue);
                                    }}
                                  />
                                </form>
                              ) : (
                                <span className={cn(
                                  "block truncate text-xs font-medium",
                                  convo.unreadCount ? "font-semibold text-foreground" : ""
                                )}>
                                  {displayLabel}
                                </span>
                              )}
                              {/* Adapter badges */}
                              {adapterTypes.length > 0 && (
                                <span className="flex items-center gap-0.5 shrink-0">
                                  {adapterTypes.map((at) => (
                                    <span
                                      key={at}
                                      className="rounded bg-accent/80 px-0.5 py-0 text-[7px] font-medium uppercase tracking-wider text-muted-foreground/60"
                                    >
                                      {at === "telegram" ? "TG" : at === "console" ? "WEB" : at.slice(0, 3).toUpperCase()}
                                    </span>
                                  ))}
                                </span>
                              )}
                            </div>
                            {/* Second row: preview + meta */}
                            <div className="flex items-center justify-between gap-1">
                              <p className="truncate text-[10px] text-muted-foreground">
                                {convo.lastMessage || "No messages yet"}
                              </p>
                              <div className="flex items-center gap-1 shrink-0">
                                {convo.messageCount != null && convo.messageCount > 0 && (
                                  <span className="text-[9px] text-muted-foreground/50">{convo.messageCount}</span>
                                )}
                                {convo.lastMessageAt && (
                                  <span className="text-[9px] text-muted-foreground/50">{formatTime(convo.lastMessageAt)}</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Unread badge */}
                          {!!convo.unreadCount && (
                            <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-cyan-glow px-1 text-[9px] font-bold text-background">
                              {convo.unreadCount}
                            </span>
                          )}

                          {/* Hover action icons */}
                          {!isRenaming && !isDeleting && session && (
                            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover/chat:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePinChat(agent.name, session.id, isPinned);
                                }}
                                title={isPinned ? "Unpin" : "Pin"}
                                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/50 hover:text-cyan-glow hover:bg-cyan-glow/10 transition-colors"
                              >
                                {isPinned ? <PinOff className="h-2.5 w-2.5" /> : <Pin className="h-2.5 w-2.5" />}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDelete({ agentName: agent.name, chatId: convo.chatId, sessionId: session.id });
                                }}
                                title="Delete chat"
                                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/50 hover:text-rose-alert hover:bg-rose-alert/10 transition-colors"
                              >
                                <Trash2 className="h-2.5 w-2.5" />
                              </button>
                            </div>
                          )}
                        </button>
                      </div>
                    );
                  })}

                  {/* Show more button */}
                  {hasMore && (
                    <button
                      onClick={() => setChatLimits(prev => ({ ...prev, [agent.name]: limit + CHATS_PER_PAGE }))}
                      className="flex w-full items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-muted-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-muted-foreground"
                    >
                      <ChevronsDown className="h-3 w-3" />
                      <span className="text-[10px]">Show more ({sortedConvos.length - limit} remaining)</span>
                    </button>
                  )}

                  {/* New chat button */}
                  <button
                    onClick={async () => {
                      try {
                        const created = await api.createAgentSession(agent.name, { adapterType: "console" });
                        await loadSessions(agent.name);
                        router.push(`/agents/${agent.name}/${created.chatId}`);
                      } catch {
                        // silent
                      }
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-muted-foreground transition-colors hover:bg-sidebar-accent"
                  >
                    <Plus className="h-3 w-3" />
                    <span className="text-xs">New chat</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {state.agents.length === 0 && onCreateAgent && (
          <button
            onClick={onCreateAgent}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-6 text-xs text-muted-foreground transition-colors hover:border-cyan-glow/30 hover:text-cyan-glow/80 focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:outline-none"
          >
            <Plus className="h-4 w-4" />
            Register your first agent
          </button>
        )}
      </div>

      <AgentDetailSheet
        agent={detailAgent}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}

// ─── Team List (Teams tab) ─────────────────────────────────
function LiveTeamList({ onCreateTeam }: { onCreateTeam?: () => void }) {
  const { state } = useAppState();
  const router = useRouter();
  const { teamName: selTeam } = useRouteSelection();

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
          Teams <span className="ml-1.5 text-muted-foreground">{state.teams.length}</span>
        </h3>
        {onCreateTeam && (
          <button
            onClick={onCreateTeam}
            title="Create team"
            aria-label="Create team"
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="space-y-0.5 px-1.5">
        {state.teams.map((team) => (
          <button
            key={team.name}
            onClick={() => router.push(`/teams/${team.name}`)}
            className={cn(
              "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-150",
              selTeam === team.name ? "bg-cyan-glow/10 glow-cyan" : "hover:bg-sidebar-accent"
            )}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-lavender-info/10">
              <Users className="h-4 w-4 text-lavender-info" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">{team.name}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{team.members.length} members</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Settings Panel ────────────────────────────────────────
function LiveSettingsPanel() {
  const { theme, toggleTheme } = useTheme();
  const { status: wsStatus } = useWebSocket();
  const isConnected = wsStatus === "connected";
  const { logout } = useAuth();
  const router = useRouter();

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className={cn(
        "flex items-center gap-2.5 rounded-lg border p-3",
        isConnected ? "border-emerald-signal/20 bg-emerald-signal/5" : "border-rose-alert/20 bg-rose-alert/5"
      )}>
        {isConnected ? <Wifi className="h-4 w-4 text-emerald-signal" /> : <WifiOff className="h-4 w-4 text-rose-alert" />}
        <div className="flex-1">
          <p className="text-xs font-medium text-foreground">{isConnected ? "Connected" : "Disconnected"}</p>
          <p className="text-[10px] text-muted-foreground">{isConnected ? "WebSocket active" : "Reconnecting..."}</p>
        </div>
        <span className={`h-2 w-2 rounded-full ${isConnected ? "bg-emerald-signal pulse-emerald" : "bg-rose-alert"}`} />
      </div>
      <button
        onClick={toggleTheme}
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        className="flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
      >
        {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        {theme === "dark" ? "Light Mode" : "Dark Mode"}
      </button>
      <button
        onClick={() => router.push("/admin")}
        className="flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" />
          <circle cx="6" cy="6" r="1" fill="currentColor" /><circle cx="6" cy="18" r="1" fill="currentColor" />
        </svg>
        Daemon Status
      </button>
      <button
        onClick={logout}
        aria-label="Disconnect"
        className="flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-rose-alert"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
        </svg>
        Disconnect
      </button>
    </div>
  );
}
