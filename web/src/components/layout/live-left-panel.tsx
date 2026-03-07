"use client";

import { useState, useCallback, useRef, useEffect } from "react";
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
import { cn, formatTime, formatChatLabel } from "@/lib/utils";
import { getAvatarColor, getInitials } from "@/lib/colors";
import {
  User,
  Users,

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
  Pencil,
  ChevronsDown,
} from "lucide-react";
import { AgentDetailSheet } from "@/components/agents/agent-detail-sheet";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Agent, AgentSession } from "@/lib/types";

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
          <h1 className="text-sm font-bold tracking-tight text-foreground">CLIClaw</h1>
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

      {/* Bottom tab bar — taller to align with composer input box */}
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
                "relative flex flex-1 flex-col items-center justify-center gap-1 py-4 text-[10px] transition-colors focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:outline-none",
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
        chatLabel: formatChatLabel(routeChatId),
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

interface SessionChatRow {
  key: string;
  sessionId: string;
  routeChatId: string;
  chatIds: string[];
  pinned: boolean;
  rawLabel: string;
  displayLabel: string;
  lastMessage?: string;
  lastMessageAt: number;
  unreadCount: number;
  adapterTypes: string[];
}

function LiveAgentList({ onCreateAgent }: { onCreateAgent?: () => void }) {
  const { state, loadSessions, loadConversations } = useAppState();
  const router = useRouter();
  const { agentName: selAgent, chatId: selChat } = useRouteSelection();
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [detailAgent, setDetailAgent] = useState<Agent | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [chatLimits, setChatLimits] = useState<Record<string, number>>({});
  const [deleteTarget, setDeleteTarget] = useState<{ agentName: string; sessionId: string; chatIds: string[]; label: string } | null>(null);
  const [renamingChat, setRenamingChat] = useState<{ agentName: string; sessionId: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const handleOpenDetail = (agent: Agent) => {
    setDetailAgent(agent);
    setDetailOpen(true);
  };

  const getVisibleBindings = useCallback((session: AgentSession) => {
    return (session.bindings || []).filter((binding) => binding.adapterType !== "internal");
  }, []);

  const getRouteChatId = useCallback((session: AgentSession): string | null => {
    const bindings = getVisibleBindings(session);
    if (bindings.length === 0) return null;
    const preferred = bindings.find((binding) => binding.adapterType !== "console") ?? bindings[0];
    return preferred?.chatId ?? null;
  }, [getVisibleBindings]);

  const handleDeleteChat = useCallback(async (agentName: string, sessionId: string, sessionChatIds: string[]) => {
    try {
      await api.deleteSession(agentName, sessionId);
      await Promise.all([loadSessions(agentName), loadConversations(agentName)]);

      // Navigate away if current route points at any binding of the deleted session.
      if (selAgent === agentName && selChat && sessionChatIds.includes(selChat)) {
        const remainingSessions = [...(state.sessions[agentName] || [])]
          .filter((session) => session.id !== sessionId)
          .sort((a, b) => (b.lastActivityAt ?? b.createdAt) - (a.lastActivityAt ?? a.createdAt));

        let nextChatId: string | null = null;
        for (const session of remainingSessions) {
          const routeChatId = getRouteChatId(session);
          if (routeChatId) {
            nextChatId = routeChatId;
            break;
          }
        }

        router.push(`/agents/${agentName}/${nextChatId ?? "default"}`);
      }
    } catch {
      // silent
    }
    setDeleteTarget(null);
  }, [getRouteChatId, loadConversations, loadSessions, router, selAgent, selChat, state.sessions]);

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

  const startRename = useCallback((agentName: string, sessionId: string, currentLabel: string) => {
    setRenamingChat({ agentName, sessionId });
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

          const sessionRows = sessions
            .map((session): SessionChatRow | null => {
              const visibleBindings = getVisibleBindings(session);
              const routeChatId = getRouteChatId(session);
              if (visibleBindings.length === 0 || !routeChatId) return null;

              const chatIds = visibleBindings.map((binding) => binding.chatId);
              const matchedConvos = agentConvos.filter((convo) => chatIds.includes(convo.chatId));
              const latestConvo = matchedConvos
                .slice()
                .sort((a, b) => (b.lastMessageAt ?? b.createdAt) - (a.lastMessageAt ?? a.createdAt))[0];
              const unreadCount = matchedConvos.reduce((sum, convo) => sum + (convo.unreadCount ?? 0), 0);
              const rawLabel = session.label?.trim() ?? "";
              const displayLabel = rawLabel || formatChatLabel(routeChatId);

              return {
                key: session.id,
                sessionId: session.id,
                routeChatId,
                chatIds,
                pinned: !!session.pinned,
                rawLabel,
                displayLabel,
                lastMessage: latestConvo?.lastMessage,
                lastMessageAt: latestConvo?.lastMessageAt ?? session.lastActivityAt ?? session.createdAt,
                unreadCount,
                adapterTypes: Array.from(new Set(visibleBindings.map((binding) => binding.adapterType))),
              };
            })
            .filter((row): row is SessionChatRow => row !== null)
            .sort((a, b) => {
              if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
              return b.lastMessageAt - a.lastMessageAt;
            });

          const hasChats = sessionRows.length > 0;
          const isExpanded = expandedAgents.has(agent.name);

          const limit = chatLimits[agent.name] || CHATS_PER_PAGE;
          const visibleRows = sessionRows.slice(0, limit);
          const hasMore = sessionRows.length > limit;

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
                <div className="ml-6 space-y-px border-l border-sidebar-border/50 pl-2 py-0.5">
                  {visibleRows.map((chat) => {
                    const isChatSelected = selAgent === agent.name && !!selChat && chat.chatIds.includes(selChat);
                    const isRenaming = renamingChat?.agentName === agent.name && renamingChat?.sessionId === chat.sessionId;

                    return (
                      <ContextMenu key={chat.key}>
                        <ContextMenuTrigger asChild disabled={isRenaming}>
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              router.push(`/agents/${agent.name}/${chat.routeChatId}`);
                            }}
                            onDoubleClick={(e) => {
                              e.preventDefault();
                              startRename(agent.name, chat.sessionId, chat.rawLabel);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                router.push(`/agents/${agent.name}/${chat.routeChatId}`);
                              }
                            }}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:outline-none",
                              isChatSelected ? "bg-cyan-glow/10 text-cyan-glow" : "hover:bg-sidebar-accent text-muted-foreground"
                            )}
                          >
                              <div className="min-w-0 flex-1">
                                {/* Line 1: label + badges + time */}
                                <div className="flex items-center justify-between gap-1.5">
                                  <span className="flex items-center gap-1.5 min-w-0">
                                    {chat.pinned && <Pin className="h-3 w-3 shrink-0 text-cyan-glow/60" />}
                                    {isRenaming ? (
                                      <form
                                        className="flex items-center gap-1 flex-1"
                                        onSubmit={(e) => {
                                          e.preventDefault();
                                          handleRenameChat(agent.name, chat.sessionId, renameValue);
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <input
                                          ref={renameInputRef}
                                          value={renameValue}
                                          onChange={(e) => setRenameValue(e.target.value)}
                                          className="h-6 flex-1 rounded border border-cyan-glow/30 bg-background px-1.5 text-sm text-foreground outline-none focus:border-cyan-glow"
                                          onKeyDown={(e) => {
                                            if (e.key === "Escape") setRenamingChat(null);
                                          }}
                                          onBlur={() => {
                                            handleRenameChat(agent.name, chat.sessionId, renameValue);
                                          }}
                                        />
                                      </form>
                                    ) : (
                                      <span className={cn(
                                        "block truncate text-sm",
                                        isChatSelected ? "text-cyan-glow font-medium" : chat.unreadCount > 0 ? "font-semibold text-foreground" : "font-medium"
                                      )}>
                                        {chat.displayLabel}
                                      </span>
                                    )}
                                    {chat.adapterTypes.length > 0 && (
                                      <span className="flex items-center gap-0.5 shrink-0">
                                        {chat.adapterTypes.map((at) => (
                                          <span
                                            key={at}
                                            className="rounded bg-accent/60 px-1 py-px text-[8px] font-medium uppercase tracking-wider text-muted-foreground/60"
                                          >
                                            {at === "telegram" ? "TG" : at === "console" ? "WEB" : at.slice(0, 3).toUpperCase()}
                                          </span>
                                        ))}
                                      </span>
                                    )}
                                  </span>
                                  {!!chat.lastMessageAt && (
                                    <span className="text-[10px] text-muted-foreground/50 shrink-0">{formatTime(chat.lastMessageAt)}</span>
                                  )}
                                </div>
                                {/* Line 2: message preview + unread badge */}
                                <div className="mt-0.5 flex items-center justify-between gap-2">
                                  <p className={cn(
                                    "truncate text-xs",
                                    chat.lastMessage ? "text-muted-foreground/70" : "text-muted-foreground/30 italic"
                                  )}>
                                    {chat.lastMessage || "No messages yet"}
                                  </p>
                                  {chat.unreadCount > 0 && (
                                    <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-cyan-glow px-1 text-[9px] font-bold text-background">
                                      {chat.unreadCount}
                                    </span>
                                  )}
                                </div>
                              </div>
                          </div>
                        </ContextMenuTrigger>

                        <ContextMenuContent>
                          <ContextMenuItem
                            onClick={() => startRename(agent.name, chat.sessionId, chat.rawLabel)}
                          >
                            <Pencil className="h-4 w-4" />
                            Rename
                          </ContextMenuItem>
                          <ContextMenuItem
                            onClick={() => handlePinChat(agent.name, chat.sessionId, chat.pinned)}
                          >
                            {chat.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                            {chat.pinned ? "Unpin" : "Pin"}
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                          <ContextMenuItem
                            variant="destructive"
                            onClick={() => setDeleteTarget({ agentName: agent.name, sessionId: chat.sessionId, chatIds: chat.chatIds, label: chat.displayLabel })}
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    );
                  })}

                  {/* Show more button */}
                  {hasMore && (
                    <button
                      onClick={() => setChatLimits(prev => ({ ...prev, [agent.name]: limit + CHATS_PER_PAGE }))}
                      className="flex w-full items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-muted-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-muted-foreground"
                    >
                      <ChevronsDown className="h-3 w-3" />
                      <span className="text-[10px]">Show more ({sessionRows.length - limit} remaining)</span>
                    </button>
                  )}

                  {/* New chat button */}
                  <button
                    onClick={async () => {
                      try {
                        const created = await api.createAgentSession(agent.name, { adapterType: "console" });
                        await Promise.all([loadSessions(agent.name), loadConversations(agent.name)]);
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

      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete chat</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.label}&rdquo;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteTarget) {
                  void handleDeleteChat(deleteTarget.agentName, deleteTarget.sessionId, deleteTarget.chatIds);
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  const { logout, identity } = useAuth();
  const { state } = useAppState();
  const router = useRouter();
  const [profileTokenName, setProfileTokenName] = useState<string>("");
  const [profileName, setProfileName] = useState("");
  const [profileVersion, setProfileVersion] = useState("1");
  const [profileContent, setProfileContent] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileOptions, setProfileOptions] = useState<Array<{
    tokenName: string;
    name: string;
    role: "admin" | "user";
  }>>([]);
  const [selectedSoulAgent, setSelectedSoulAgent] = useState<string>("");
  const [soulVersion, setSoulVersion] = useState("1");
  const [soulContent, setSoulContent] = useState("");
  const [savingSoul, setSavingSoul] = useState(false);

  useEffect(() => {
    if (!identity) return;

    const initialTokenName = identity.tokenName;
    setProfileTokenName(initialTokenName);

    void api.getBossProfile(initialTokenName)
      .then(({ profile }) => {
        setProfileName(profile.name);
        setProfileVersion(profile.version);
        setProfileContent(profile.content);
      })
      .catch(() => {});

    if (identity.role === "admin") {
      void api.listBossProfiles()
        .then((res) => {
          const options = res.profiles
            .filter((p) => !p.error)
            .map((p) => ({
              tokenName: p.tokenName,
              name: p.name,
              role: p.role,
            }));
          setProfileOptions(options);
        })
        .catch(() => {});
    } else {
      setProfileOptions([]);
    }
  }, [identity?.tokenName, identity?.role]);

  useEffect(() => {
    if (!profileTokenName) return;
    void api.getBossProfile(profileTokenName)
      .then(({ profile }) => {
        setProfileName(profile.name);
        setProfileVersion(profile.version);
        setProfileContent(profile.content);
      })
      .catch(() => {});
  }, [profileTokenName]);

  useEffect(() => {
    const firstAgent = state.agents[0]?.name ?? "";
    if (selectedSoulAgent || !firstAgent) return;
    setSelectedSoulAgent(firstAgent);
  }, [state.agents, selectedSoulAgent]);

  useEffect(() => {
    if (!selectedSoulAgent) return;
    void api.getAgentSoul(selectedSoulAgent)
      .then(({ soul }) => {
        setSoulVersion(soul.version);
        setSoulContent(soul.content);
      })
      .catch(() => {});
  }, [selectedSoulAgent]);

  const saveBossProfile = useCallback(async () => {
    if (!profileTokenName) return;
    setSavingProfile(true);
    try {
      await api.updateBossProfile(profileTokenName, {
        name: profileName,
        version: profileVersion,
        content: profileContent,
      });
    } finally {
      setSavingProfile(false);
    }
  }, [profileTokenName, profileName, profileVersion, profileContent]);

  const saveSoul = useCallback(async () => {
    if (!selectedSoulAgent) return;
    setSavingSoul(true);
    try {
      await api.updateAgentSoul(selectedSoulAgent, {
        version: soulVersion,
        content: soulContent,
      });
    } finally {
      setSavingSoul(false);
    }
  }, [selectedSoulAgent, soulVersion, soulContent]);

  return (
    <div className="flex flex-col gap-3 p-3">
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

      {identity && (
        <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3 text-xs">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Current Identity</div>
          <div className="mt-1 font-medium text-foreground">{identity.displayName}</div>
          <div className="text-[11px] text-muted-foreground">
            {identity.tokenName} · {identity.role}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/30 p-3 space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">BOSS.md</div>
        {identity?.role === "admin" && profileOptions.length > 0 && (
          <select
            value={profileTokenName}
            onChange={(e) => setProfileTokenName(e.target.value)}
            className="h-8 w-full rounded border border-border bg-input px-2 text-xs text-foreground"
          >
            {profileOptions.map((option) => (
              <option key={option.tokenName} value={option.tokenName}>
                {option.name} ({option.tokenName})
              </option>
            ))}
          </select>
        )}
        <input
          value={profileName}
          onChange={(e) => setProfileName(e.target.value)}
          placeholder="Display name"
          className="h-8 w-full rounded border border-border bg-input px-2 text-xs text-foreground"
        />
        <input
          value={profileVersion}
          onChange={(e) => setProfileVersion(e.target.value)}
          placeholder="Version"
          className="h-8 w-full rounded border border-border bg-input px-2 text-xs text-foreground"
        />
        <textarea
          value={profileContent}
          onChange={(e) => setProfileContent(e.target.value)}
          rows={5}
          placeholder="BOSS.md content"
          className="w-full rounded border border-border bg-input px-2 py-2 text-xs text-foreground"
        />
        <button
          onClick={saveBossProfile}
          disabled={savingProfile || !profileTokenName}
          className="h-8 w-full rounded bg-cyan-glow text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {savingProfile ? "Saving..." : "Save BOSS.md"}
        </button>
      </div>

      <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/30 p-3 space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">SOUL.md</div>
        <select
          value={selectedSoulAgent}
          onChange={(e) => setSelectedSoulAgent(e.target.value)}
          className="h-8 w-full rounded border border-border bg-input px-2 text-xs text-foreground"
        >
          {state.agents.map((agent) => (
            <option key={agent.name} value={agent.name}>
              {agent.name}
            </option>
          ))}
        </select>
        <input
          value={soulVersion}
          onChange={(e) => setSoulVersion(e.target.value)}
          placeholder="Version"
          className="h-8 w-full rounded border border-border bg-input px-2 text-xs text-foreground"
        />
        <textarea
          value={soulContent}
          onChange={(e) => setSoulContent(e.target.value)}
          rows={4}
          placeholder="SOUL.md content"
          className="w-full rounded border border-border bg-input px-2 py-2 text-xs text-foreground"
        />
        <button
          onClick={saveSoul}
          disabled={savingSoul || !selectedSoulAgent}
          className="h-8 w-full rounded bg-cyan-glow text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {savingSoul ? "Saving..." : "Save SOUL.md"}
        </button>
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
