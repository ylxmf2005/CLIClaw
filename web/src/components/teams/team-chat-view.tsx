"use client";

import { useEffect, useState, useCallback } from "react";
import { useAppState } from "@/providers/app-state-provider";
import { MessageList } from "@/components/chat/message-list";
import { MessageComposer } from "@/components/chat/message-composer";
import { Button } from "@/components/ui/button";
import { Users, UserPlus, Settings, X } from "lucide-react";
import { listTeamMembers } from "@/lib/api";
import type { TeamMember } from "@/lib/types";

export function TeamChatView() {
  const { state, loadEnvelopes } = useAppState();
  const selection = state.selectedTeam;
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [showMembers, setShowMembers] = useState(false);

  const team = state.teams.find((t) => t.name === selection?.teamName);
  const address = selection ? `team:${selection.teamName}` : "";

  useEffect(() => {
    if (selection) {
      loadEnvelopes(address);
      listTeamMembers(selection.teamName).then((r) => setMembers(r.members));
    }
  }, [selection, address, loadEnvelopes]);

  const handleSent = useCallback(() => {
    if (address) loadEnvelopes(address);
  }, [address, loadEnvelopes]);

  if (!selection || !team) {
    return (
      <div className="flex flex-1 items-center justify-center bg-grid">
        <div className="text-center">
          <Users className="mx-auto mb-4 h-12 w-12 text-lavender-info/20" />
          <p className="text-sm text-muted-foreground/50">
            Select a team to view its chat
          </p>
        </div>
      </div>
    );
  }

  const envelopes = state.envelopes[address] || [];

  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-white/[0.04] bg-[#080c16]/80 px-4 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-lavender-info/10">
            <Users className="h-4 w-4 text-lavender-info" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {team.name}
            </h2>
            <span className="text-[11px] text-muted-foreground/50">
              {members.length} members
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground/50 hover:text-foreground"
            onClick={() => setShowMembers(!showMembers)}
          >
            <UserPlus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground/50 hover:text-foreground"
          >
            <Settings className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Messages */}
        <div className="flex flex-1 flex-col">
          <MessageList envelopes={envelopes} />
          <MessageComposer
            toAddress={address}
            placeholder={`Message ${team.name}... (@agent to mention, @all to broadcast)`}
            onSent={handleSent}
          />
        </div>

        {/* Members panel */}
        {showMembers && (
          <div className="w-56 border-l border-white/[0.04] bg-[#080c16]">
            <div className="flex items-center justify-between border-b border-white/[0.04] px-3 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Members
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-muted-foreground/40"
                onClick={() => setShowMembers(false)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            <div className="space-y-1 p-2">
              {members.map((m) => {
                const agentStatus = state.agentStatuses[m.agentName];
                return (
                  <div
                    key={m.agentName}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5"
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${
                        agentStatus?.agentState === "running"
                          ? "bg-amber-pulse pulse-amber"
                          : agentStatus
                            ? "bg-emerald-signal"
                            : "bg-muted-foreground/30"
                      }`}
                    />
                    <span className="text-xs text-foreground/80">
                      {m.agentName}
                    </span>
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
