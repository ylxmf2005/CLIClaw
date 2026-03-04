"use client";

import { useDemoContext } from "./page";

export function DemoTeamChat() {
  const { state } = useDemoContext();
  const team = state.teams.find((t) => t.name === state.selectedTeam?.teamName);
  if (!team) return null;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex h-14 items-center justify-between border-b border-white/[0.04] bg-[#080c16]/80 px-4 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-lavender-info/10">
            <svg className="h-4 w-4 text-lavender-info" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">{team.name}</h2>
            <p className="text-[11px] text-muted-foreground/50">{team.members.length} members</p>
          </div>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center bg-grid">
        <div className="text-center">
          <p className="text-sm text-muted-foreground/50">Team group chat for <span className="text-lavender-info">{team.name}</span></p>
          <p className="mt-1 text-xs text-muted-foreground/30">Members: {team.members.join(", ")}</p>
        </div>
      </div>
      <div className="border-t border-white/[0.04] bg-[#080c16] px-4 py-3">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
            <div className="min-h-[32px] flex-1 text-sm text-muted-foreground/30">@mention an agent in {team.name}...</div>
            <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-muted-foreground/30">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
