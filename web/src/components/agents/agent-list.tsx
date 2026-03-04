"use client";

import { useState } from "react";
import { useAppState } from "@/providers/app-state-provider";
import { AgentCard } from "./agent-card";
import { AgentDetailSheet } from "./agent-detail-sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Search } from "lucide-react";
import type { Agent } from "@/lib/types";

interface AgentListProps {
  onCreateAgent: () => void;
}

export function AgentList({ onCreateAgent }: AgentListProps) {
  const { state, dispatch } = useAppState();
  const [search, setSearch] = useState("");
  const [detailAgent, setDetailAgent] = useState<Agent | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const filtered = state.agents.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  const sortedAgents = [...filtered].sort((a, b) => {
    const stateA = state.agentStatuses[a.name];
    const stateB = state.agentStatuses[b.name];
    const orderA = stateA?.agentState === "running" ? 0 : stateA ? 1 : 2;
    const orderB = stateB?.agentState === "running" ? 0 : stateB ? 1 : 2;
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name);
  });

  const handleOpenDetail = (agent: Agent) => {
    setDetailAgent(agent);
    setDetailOpen(true);
  };

  return (
    <div className="flex flex-col">
      {/* Section header */}
      <div className="flex items-center justify-between px-3 py-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Agents
          <span className="ml-1.5 text-muted-foreground/60">
            {state.agents.length}
          </span>
        </h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-cyan-glow"
          onClick={onCreateAgent}
          aria-label="Create agent"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Search */}
      {state.agents.length > 3 && (
        <div className="relative px-3 pb-2">
          <Search className="absolute left-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search agents..."
            className="h-7 border-none bg-sidebar-accent pl-7 text-xs placeholder:text-muted-foreground"
          />
        </div>
      )}

      {/* Agent list */}
      <div className="animate-stagger space-y-0.5 px-1.5" role="list" aria-label="Agents">
        {sortedAgents.map((agent) => (
          <AgentCard
            key={agent.name}
            agent={agent}
            isSelected={state.selectedChat?.agentName === agent.name}
            onClick={() =>
              dispatch({
                type: "SELECT_CHAT",
                selection: { agentName: agent.name, chatId: "default" },
              })
            }
            onDetailClick={() => handleOpenDetail(agent)}
          />
        ))}
        {sortedAgents.length === 0 && search && (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
            No agents match &ldquo;{search}&rdquo;
          </p>
        )}
        {state.agents.length === 0 && (
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
