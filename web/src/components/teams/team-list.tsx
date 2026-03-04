"use client";

import { useAppState } from "@/providers/app-state-provider";
import { Button } from "@/components/ui/button";
import { Plus, Search, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Input } from "@/components/ui/input";

interface TeamListProps {
  onCreateTeam: () => void;
}

export function TeamList({ onCreateTeam }: TeamListProps) {
  const { state, dispatch } = useAppState();
  const [search, setSearch] = useState("");

  const filtered = state.teams.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
          Teams
          <span className="ml-1.5 text-muted-foreground/40">
            {state.teams.length}
          </span>
        </h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-cyan-glow"
          onClick={onCreateTeam}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {state.teams.length > 3 && (
        <div className="relative px-3 pb-2">
          <Search className="absolute left-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search teams..."
            className="h-7 border-none bg-white/[0.03] pl-7 text-xs placeholder:text-muted-foreground/40"
          />
        </div>
      )}

      <div className="animate-stagger space-y-0.5 px-1.5">
        {filtered.map((team) => (
          <button
            key={team.name}
            onClick={() =>
              dispatch({
                type: "SELECT_TEAM",
                selection: { teamName: team.name },
              })
            }
            className={cn(
              "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-150",
              state.selectedTeam?.teamName === team.name
                ? "bg-cyan-glow/8 glow-cyan"
                : "hover:bg-white/[0.03]"
            )}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-lavender-info/10">
              <Users className="h-4 w-4 text-lavender-info" />
            </div>
            <div className="min-w-0 flex-1">
              <span
                className={cn(
                  "block truncate text-sm font-medium",
                  state.selectedTeam?.teamName === team.name
                    ? "text-cyan-glow"
                    : "text-foreground"
                )}
              >
                {team.name}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {team.members.length} member{team.members.length !== 1 ? "s" : ""}
                {team.description ? ` \u00B7 ${team.description}` : ""}
              </span>
            </div>
          </button>
        ))}

        {state.teams.length === 0 && (
          <button
            onClick={onCreateTeam}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/[0.06] px-3 py-6 text-xs text-muted-foreground/50 transition-colors hover:border-cyan-glow/20 hover:text-cyan-glow/70"
          >
            <Plus className="h-4 w-4" />
            Create your first team
          </button>
        )}
      </div>
    </div>
  );
}
