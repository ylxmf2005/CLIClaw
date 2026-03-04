"use client";

import { useMemo, useState } from "react";
import { useAppState } from "@/providers/app-state-provider";
import { ChatListItem } from "./chat-list-item";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import type { AgentState } from "@/components/shared/status-indicator";

interface ConversationEntry {
  kind: "agent" | "team";
  name: string;
  subtitle?: string;
  lastMessage?: string;
  lastMessageAt?: number;
  agentState?: AgentState;
  pendingCount?: number;
  memberCount?: number;
}

export function ChatListPanel() {
  const { state, dispatch } = useAppState();
  const [search, setSearch] = useState("");

  const conversations = useMemo(() => {
    const entries: ConversationEntry[] = [];

    for (const agent of state.agents) {
      const status = state.agentStatuses[agent.name];
      const envs = state.envelopes[`agent:${agent.name}`];
      const lastEnv = envs?.[envs.length - 1];

      const agentState: AgentState = status
        ? status.agentHealth === "error"
          ? "error"
          : status.agentState === "running"
            ? "running"
            : "idle"
        : "unknown";

      entries.push({
        kind: "agent",
        name: agent.name,
        subtitle: agent.description || agent.provider,
        lastMessage: lastEnv?.content.text,
        lastMessageAt: lastEnv?.createdAt ?? agent.lastSeenAt,
        agentState,
        pendingCount: status?.pendingCount,
      });
    }

    for (const team of state.teams) {
      entries.push({
        kind: "team",
        name: team.name,
        subtitle: team.description,
        memberCount: team.members.length,
        lastMessageAt: team.createdAt,
      });
    }

    // Sort by most recent activity
    entries.sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0));
    return entries;
  }, [state.agents, state.agentStatuses, state.envelopes, state.teams]);

  const filtered = search
    ? conversations.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase())
      )
    : conversations;

  const isSelected = (entry: ConversationEntry) => {
    if (entry.kind === "agent") {
      return state.selectedChat?.agentName === entry.name;
    }
    return state.selectedTeam?.teamName === entry.name;
  };

  return (
    <div className="flex flex-col">
      {/* Search */}
      <div className="relative px-3 py-2">
        <Search className="absolute left-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search conversations..."
          className="h-8 border-none bg-white/[0.03] pl-7 text-xs placeholder:text-muted-foreground/40"
        />
      </div>

      {/* Conversation list */}
      <div className="space-y-0.5 px-1.5">
        {filtered.map((entry) => (
          <ChatListItem
            key={`${entry.kind}:${entry.name}`}
            kind={entry.kind}
            name={entry.name}
            subtitle={entry.subtitle}
            lastMessage={entry.lastMessage}
            lastMessageAt={entry.lastMessageAt}
            agentState={entry.agentState}
            pendingCount={entry.pendingCount}
            memberCount={entry.memberCount}
            isSelected={isSelected(entry)}
            onClick={() => {
              if (entry.kind === "agent") {
                dispatch({
                  type: "SELECT_CHAT",
                  selection: { agentName: entry.name },
                });
              } else {
                dispatch({
                  type: "SELECT_TEAM",
                  selection: { teamName: entry.name },
                });
              }
            }}
          />
        ))}
        {filtered.length === 0 && search && (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground/50">
            No conversations match &ldquo;{search}&rdquo;
          </p>
        )}
        {conversations.length === 0 && (
          <p className="px-3 py-8 text-center text-xs text-muted-foreground/50">
            No conversations yet
          </p>
        )}
      </div>
    </div>
  );
}
