"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useAppState } from "@/providers/app-state-provider";
import { LeftPanel } from "./left-panel";
import { ChatView } from "@/components/chat/chat-view";
import { TeamChatView } from "@/components/teams/team-chat-view";
import { TerminalView } from "@/components/terminal/terminal-view";
import { CronPanel } from "@/components/cron/cron-panel";
import { ThreadView } from "@/components/chat/thread-view";
import { DaemonStatusView } from "@/components/admin/daemon-status";
import { AgentCreateModal } from "@/components/agents/agent-create-modal";

const SPLIT_DEFAULT = 420;
const SPLIT_MIN = 280;
const SPLIT_MAX_RATIO = 0.6;

export function AppShell() {
  const { state } = useAppState();
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [splitWidth, setSplitWidth] = useState(SPLIT_DEFAULT);
  const isDraggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
  }, []);

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!isDraggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const maxWidth = rect.width * SPLIT_MAX_RATIO;
      const newWidth = rect.right - e.clientX;
      setSplitWidth(Math.max(SPLIT_MIN, Math.min(maxWidth, newWidth)));
    }
    function handleMouseUp() {
      isDraggingRef.current = false;
    }
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const renderMainContent = () => {
    switch (state.view) {
      case "admin":
        return <DaemonStatusView />;
      case "settings":
        return (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted-foreground">Settings coming soon</p>
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
      case "thread":
        return <ThreadView />;
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
      <div ref={containerRef} className="flex flex-1 overflow-hidden">
        {/* Main content */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {renderMainContent()}
        </main>

        {/* Split pane with drag handle */}
        {state.splitPane && (
          <>
            {/* Drag handle */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize terminal pane"
              className="group flex w-1 cursor-col-resize items-center justify-center hover:bg-cyan-glow/20 active:bg-cyan-glow/30 transition-colors"
              onMouseDown={handleDragStart}
            >
              <div className="h-8 w-0.5 rounded-full bg-border transition-colors group-hover:bg-cyan-glow/60" />
            </div>
            <div
              className="shrink-0 overflow-hidden"
              style={{ width: splitWidth }}
            >
              {renderSplitPane()}
            </div>
          </>
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
          role="dialog"
          aria-modal="true"
          aria-label="Create team"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowCreateTeam(false)}
          onKeyDown={(e) => { if (e.key === "Escape") setShowCreateTeam(false); }}
        >
          <div
            className="rounded-xl border border-border bg-card p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-muted-foreground">Team creation coming soon</p>
          </div>
        </div>
      )}
    </div>
  );
}
