"use client";

import { useParams } from "next/navigation";
import { useAppState } from "@/providers/app-state-provider";
import { useEffect, useState, useCallback } from "react";
import { MessageList } from "@/components/chat/message-list";
import { MessageComposer } from "@/components/chat/message-composer";
import { Button } from "@/components/ui/button";
import { Users, UserPlus, Settings, X } from "lucide-react";
import { sendEnvelope, listTeamMembers } from "@/lib/api";
import type { TeamMember } from "@/lib/types";

export default function TeamChatPage() {
  const { name } = useParams<{ name: string }>();
  const { state, dispatch, loadEnvelopes } = useAppState();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [showMembers, setShowMembers] = useState(false);

  const team = state.teams.find((t) => t.name === name);
  const address = `team:${name}`;
  const envelopes = state.envelopes[address] || [];

  useEffect(() => {
    loadEnvelopes(address);
    listTeamMembers(name).then((r) => setMembers(r.members)).catch(() => {});
  }, [name, address, loadEnvelopes]);

  const handleSent = useCallback(() => {
    loadEnvelopes(address);
  }, [address, loadEnvelopes]);

  if (!team) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <Users className="mx-auto mb-4 h-12 w-12 text-lavender-info/20" />
          <p className="text-sm text-muted-foreground">Team &quot;{name}&quot; not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-border bg-card/80 px-4 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-lavender-info/10">
            <Users className="h-4 w-4 text-lavender-info" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">{team.name}</h2>
            <span className="text-[11px] text-muted-foreground">{members.length} members</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => setShowMembers(!showMembers)} aria-label="Toggle members panel" aria-pressed={showMembers}>
            <UserPlus className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" aria-label="Team settings">
            <Settings className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col">
          <MessageList envelopes={envelopes} />
          <MessageComposer
            onSend={(text) => {
              if (text) {
                sendEnvelope({ to: address, text }).then(() => handleSent());
              }
              dispatch({ type: "CLEAR_DRAFT", key: address });
            }}
            onScheduleSend={(text, scheduledAt) => {
              if (text) {
                sendEnvelope({ to: address, text, deliverAt: scheduledAt.toISOString() }).then(() => handleSent());
              }
              dispatch({ type: "CLEAR_DRAFT", key: address });
            }}
            placeholder={`Message ${team.name}...`}
            draft={state.drafts[address]}
            onDraftChange={(text) => dispatch({ type: "SET_DRAFT", key: address, text })}
          />
        </div>

        {showMembers && (
          <div className="w-56 border-l border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Members</span>
              <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground" onClick={() => setShowMembers(false)} aria-label="Close members panel">
                <X className="h-3 w-3" />
              </Button>
            </div>
            <div className="space-y-1 p-2">
              {members.map((m) => {
                const agentStatus = state.agentStatuses[m.agentName];
                return (
                  <div key={m.agentName} className="flex items-center gap-2 rounded-md px-2 py-1.5">
                    <span
                      role="status"
                      className={`h-2 w-2 rounded-full ${
                        agentStatus?.agentState === "running"
                          ? "bg-amber-pulse pulse-amber"
                          : agentStatus
                            ? "bg-emerald-signal"
                            : "bg-muted-foreground/40"
                      }`}
                    />
                    <span className="text-xs text-foreground/80">{m.agentName}</span>
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
