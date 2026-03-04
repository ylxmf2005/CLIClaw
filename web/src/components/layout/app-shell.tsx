"use client";

import { useState } from "react";
import { useAppState } from "@/providers/app-state-provider";
import { LeftPanel } from "./left-panel";
import { ChatView } from "@/components/chat/chat-view";
import { TeamChatView } from "@/components/teams/team-chat-view";
import { TerminalView } from "@/components/terminal/terminal-view";
import { CronPanel } from "@/components/cron/cron-panel";
import { DaemonStatusView } from "@/components/admin/daemon-status";
import { AgentCreateModal } from "@/components/agents/agent-create-modal";

export function AppShell() {
  const { state } = useAppState();
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  const [showCreateTeam, setShowCreateTeam] = useState(false);

  const renderMainContent = () => {
    switch (state.view) {
      case "admin":
        return <DaemonStatusView />;
      case "settings":
        return (
          <div className="flex flex-1 items-center justify-center bg-grid">
            <p className="text-sm text-muted-foreground/50">Settings coming soon</p>
          </div>
        );
      case "team":
        return <TeamChatView />;
      case "chat":
      default:
        return <ChatView />;
    }
  };

  const renderSplitPane = () => {
    if (!state.splitPane) return null;
    switch (state.splitPane) {
      case "terminal":
        return <TerminalView />;
      case "cron":
        return <CronPanel />;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden noise-overlay">
      {/* Left Panel */}
      <LeftPanel
        onCreateAgent={() => setShowCreateAgent(true)}
        onCreateTeam={() => setShowCreateTeam(true)}
      />

      {/* Main + Split */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {renderMainContent()}
        </div>

        {/* Split pane */}
        {state.splitPane && (
          <div className="w-[420px] shrink-0 overflow-hidden">
            {renderSplitPane()}
          </div>
        )}
      </div>

      {/* Modals */}
      <AgentCreateModal
        open={showCreateAgent}
        onOpenChange={setShowCreateAgent}
      />

      {/* Team create modal placeholder */}
      {showCreateTeam && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowCreateTeam(false)}
        >
          <div
            className="rounded-xl border border-white/[0.06] bg-[#0d1224] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-muted-foreground">Team creation coming soon</p>
          </div>
        </div>
      )}
    </div>
  );
}
