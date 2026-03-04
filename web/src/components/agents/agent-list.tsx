"use client";

import { useState } from "react";
import { useAppState } from "@/providers/app-state-provider";
import { AgentCard } from "./agent-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Search } from "lucide-react";

interface AgentListProps {
  onCreateAgent: () => void;
}

export function AgentList({ onCreateAgent }: AgentListProps) {
  const { state, dispatch } = useAppState();
  const [search, setSearch] = useState("");

  const filtered = state.agents.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  const sortedAgents = [...filtered].sort((a, b) => {
    // Running agents first, then idle, then unknown
    const stateA = state.agentStatuses[a.name];
    const stateB = state.agentStatuses[b.name];
    const orderA = stateA?.agentState === "running" ? 0 : stateA ? 1 : 2;
    const orderB = stateB?.agentState === "running" ? 0 : stateB ? 1 : 2;
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="flex flex-col">
      {/* Section header */}
      <div className="flex items-center justify-between px-3 py-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
          Agents
          <span className="ml-1.5 text-muted-foreground/40">
            {state.agents.length}
          </span>
        </h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-cyan-glow"
          onClick={onCreateAgent}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Search */}
      {state.agents.length > 3 && (
        <div className="relative px-3 pb-2">
          <Search className="absolute left-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search agents..."
            className="h-7 border-none bg-white/[0.03] pl-7 text-xs placeholder:text-muted-foreground/40"
          />
        </div>
      )}

      {/* Agent list */}
      <div className="animate-stagger space-y-0.5 px-1.5">
        {sortedAgents.map((agent) => (
          <AgentCard
            key={agent.name}
            agent={agent}
            isSelected={state.selectedChat?.agentName === agent.name}
            onClick={() =>
              dispatch({
                type: "SELECT_CHAT",
                selection: { agentName: agent.name },
              })
            }
          />
        ))}
        {sortedAgents.length === 0 && search && (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground/50">
            No agents match &ldquo;{search}&rdquo;
          </p>
        )}
        {state.agents.length === 0 && (
          <button
            onClick={onCreateAgent}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/[0.06] px-3 py-6 text-xs text-muted-foreground/50 transition-colors hover:border-cyan-glow/20 hover:text-cyan-glow/70"
          >
            <Plus className="h-4 w-4" />
            Register your first agent
          </button>
        )}
      </div>
    </div>
  );
}
