"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppState } from "@/providers/app-state-provider";
import { ChatListItem } from "./chat-list-item";
import { Input } from "@/components/ui/input";
import { Search, ChevronDown, ChevronRight, Plus } from "lucide-react";
import { cn, generateChatId, resolveDefaultChatId, formatTime } from "@/lib/utils";
import type { AgentState } from "@/components/shared/status-indicator";
import { Avatar } from "@/components/shared/avatar";

export function ChatListPanel() {
  const { state, dispatch, loadConversations } = useAppState();
  const [search, setSearch] = useState("");
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());

  // Auto-expand the selected agent
  useEffect(() => {
    if (state.selectedChat) {
      setExpandedAgents((prev) => {
        if (prev.has(state.selectedChat!.agentName)) return prev;
        const next = new Set(prev);
        next.add(state.selectedChat!.agentName);
        return next;
      });
    }
  }, [state.selectedChat]);

  const toggleAgent = useCallback(
    (agentName: string) => {
      setExpandedAgents((prev) => {
        const next = new Set(prev);
        if (next.has(agentName)) {
          next.delete(agentName);
        } else {
          next.add(agentName);
          // Load conversations on first expand
          loadConversations(agentName);
        }
        return next;
      });
    },
    [loadConversations]
  );

  const handleAgentClick = useCallback(
    (agentName: string) => {
      const convos = state.conversations[agentName] || [];
      const chatId = resolveDefaultChatId(convos, agentName) || "default";
      dispatch({
        type: "SELECT_CHAT",
        selection: { agentName, chatId },
      });
      // Expand if not expanded
      if (!expandedAgents.has(agentName)) {
        toggleAgent(agentName);
      }
    },
    [state.conversations, dispatch, expandedAgents, toggleAgent]
  );

  const handleNewChat = useCallback(
    (agentName: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const chatId = generateChatId();
      dispatch({
        type: "SELECT_CHAT",
        selection: { agentName, chatId },
      });
    },
    [dispatch]
  );

  const handleConversationClick = useCallback(
    (agentName: string, chatId: string) => {
      dispatch({
        type: "SELECT_CHAT",
        selection: { agentName, chatId },
      });
      // Reset unread for this conversation
      dispatch({
        type: "UPDATE_UNREAD",
        agentName,
        chatId,
        delta: -(state.conversations[agentName]?.find((c) => c.chatId === chatId)?.unreadCount ?? 0),
      });
    },
    [dispatch, state.conversations]
  );

  const getAgentState = useCallback(
    (agentName: string): AgentState => {
      const status = state.agentStatuses[agentName];
      if (!status) return "unknown";
      if (status.agentHealth === "error") return "error";
      if (status.agentState === "running") return "running";
      return "idle";
    },
    [state.agentStatuses]
  );

  // Build agent entries sorted by most recent activity
  const sortedAgents = useMemo(() => {
    return [...state.agents].sort((a, b) => {
      const aConvos = state.conversations[a.name] || [];
      const bConvos = state.conversations[b.name] || [];
      const aTime = aConvos[0]?.lastMessageAt ?? a.lastSeenAt ?? a.createdAt;
      const bTime = bConvos[0]?.lastMessageAt ?? b.lastSeenAt ?? b.createdAt;
      return bTime - aTime;
    });
  }, [state.agents, state.conversations]);

  // Filter by search
  const filtered = search
    ? sortedAgents.filter((a) =>
        a.name.toLowerCase().includes(search.toLowerCase())
      )
    : sortedAgents;

  // Also include teams at the bottom
  const filteredTeams = search
    ? state.teams.filter((t) =>
        t.name.toLowerCase().includes(search.toLowerCase())
      )
    : state.teams;

  return (
    <div className="flex flex-col">
      {/* Search */}
      <div className="relative px-3 py-2">
        <Search className="absolute left-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search conversations..."
          className="h-8 border-none bg-sidebar-accent pl-7 text-xs placeholder:text-muted-foreground"
        />
      </div>

      {/* Agent conversation list */}
      <div className="space-y-0.5 px-1.5" role="list" aria-label="Conversations">
        {filtered.map((agent) => {
          const isExpanded = expandedAgents.has(agent.name);
          const convos = state.conversations[agent.name] || [];
          const agentState = getAgentState(agent.name);
          const status = state.agentStatuses[agent.name];
          const isAgentSelected =
            state.selectedChat?.agentName === agent.name;

          // Compute total unread across all conversations
          const totalUnread = convos.reduce(
            (sum, c) => sum + (c.unreadCount ?? 0),
            0
          );

          // Get latest message preview from conversations or envelopes
          const latestConvo = convos[0];
          const lastMessage = latestConvo?.lastMessage;
          const lastMessageAt = latestConvo?.lastMessageAt ?? agent.lastSeenAt;

          return (
            <div key={agent.name}>
              {/* Agent row */}
              <AgentRow
                name={agent.name}
                subtitle={agent.description || agent.provider}
                lastMessage={lastMessage}
                lastMessageAt={lastMessageAt}
                agentState={agentState}
                pendingCount={status?.pendingCount}
                unreadCount={totalUnread}
                isSelected={isAgentSelected && !isExpanded}
                isExpanded={isExpanded}
                hasConversations={convos.length > 0}
                onClick={() => handleAgentClick(agent.name)}
                onToggle={() => toggleAgent(agent.name)}
                onNewChat={(e) => handleNewChat(agent.name, e)}
              />

              {/* Expanded conversations */}
              {isExpanded && convos.length > 0 && (
                <div className="ml-4 space-y-0.5 border-l border-border/50 pl-2">
                  {convos.map((convo) => (
                    <ChatListItem
                      key={convo.chatId}
                      kind="agent"
                      name={agent.name}
                      chatLabel={convo.label || convo.chatId}
                      subtitle={convo.lastMessage}
                      lastMessage={convo.lastMessage}
                      lastMessageAt={convo.lastMessageAt}
                      agentState={agentState}
                      unreadCount={convo.unreadCount}
                      isSelected={
                        state.selectedChat?.agentName === agent.name &&
                        state.selectedChat?.chatId === convo.chatId
                      }
                      onClick={() =>
                        handleConversationClick(agent.name, convo.chatId)
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Teams */}
        {filteredTeams.map((team) => (
          <ChatListItem
            key={`team:${team.name}`}
            kind="team"
            name={team.name}
            subtitle={team.description}
            memberCount={team.members.length}
            lastMessageAt={team.createdAt}
            isSelected={state.selectedTeam?.teamName === team.name}
            onClick={() =>
              dispatch({
                type: "SELECT_TEAM",
                selection: { teamName: team.name },
              })
            }
          />
        ))}

        {filtered.length === 0 && filteredTeams.length === 0 && search && (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground/50">
            No conversations match &ldquo;{search}&rdquo;
          </p>
        )}
        {state.agents.length === 0 && state.teams.length === 0 && (
          <p className="px-3 py-8 text-center text-xs text-muted-foreground/50">
            No conversations yet
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Agent Row (expandable) ───────────────────────────────────────

interface AgentRowProps {
  name: string;
  subtitle?: string;
  lastMessage?: string;
  lastMessageAt?: number;
  agentState: AgentState;
  pendingCount?: number;
  unreadCount?: number;
  isSelected: boolean;
  isExpanded: boolean;
  hasConversations: boolean;
  onClick: () => void;
  onToggle: () => void;
  onNewChat: (e: React.MouseEvent) => void;
}

function AgentRow({
  name,
  subtitle,
  lastMessage,
  lastMessageAt,
  agentState,
  pendingCount,
  unreadCount,
  isSelected,
  isExpanded,
  hasConversations,
  onClick,
  onToggle,
  onNewChat,
}: AgentRowProps) {
  const isUnread = !!unreadCount && unreadCount > 0;

  return (
    <div className="group relative flex w-full items-center gap-1">
      {/* Expand toggle */}
      {hasConversations && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          aria-label={isExpanded ? "Collapse conversations" : "Expand conversations"}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </button>
      )}
      {!hasConversations && <div className="w-5 shrink-0" />}

      {/* Main clickable area */}
      <button
        onClick={onClick}
        className={cn(
          "flex flex-1 items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-all duration-150 focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:outline-none",
          isSelected ? "bg-cyan-glow/10 glow-cyan" : "hover:bg-sidebar-accent"
        )}
      >
        {/* Avatar */}
        <Avatar name={name} size="md" status={agentState} />

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <span
              className={cn(
                "truncate text-sm",
                isSelected
                  ? "text-cyan-glow font-medium"
                  : isUnread
                    ? "text-foreground font-semibold"
                    : "text-foreground font-medium"
              )}
            >
              {name}
            </span>
            {lastMessageAt && (
              <span
                className={cn(
                  "shrink-0 text-[10px]",
                  isUnread ? "text-cyan-glow font-medium" : "text-muted-foreground/70"
                )}
              >
                {formatTime(lastMessageAt)}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <p
              className={cn(
                "truncate text-[11px]",
                isUnread
                  ? "text-foreground/80 font-medium"
                  : "text-muted-foreground"
              )}
            >
              {lastMessage || subtitle || ""}
            </p>
            {isUnread ? (
              <span className="ml-1 flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full bg-cyan-glow px-1 text-[10px] font-bold text-background">
                {unreadCount}
              </span>
            ) : !!pendingCount && pendingCount > 0 ? (
              <span className="ml-1 flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full bg-cyan-glow/15 px-1 text-[10px] font-bold text-cyan-glow">
                {pendingCount}
              </span>
            ) : null}
          </div>
        </div>
      </button>

      {/* New chat button (visible on hover) */}
      <button
        onClick={onNewChat}
        aria-label={`New chat with ${name}`}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100 hover:text-muted-foreground focus-visible:opacity-100"
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}
