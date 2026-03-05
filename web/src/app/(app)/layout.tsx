"use client";

import { AuthProvider, useAuth } from "@/providers/auth-provider";
import { WebSocketProvider } from "@/providers/ws-provider";
import { AppStateProvider, useAppState } from "@/providers/app-state-provider";
import { LoginScreen } from "@/components/shared/login-screen";
import { LiveLeftPanel } from "@/components/layout/live-left-panel";
import { AgentCreateModal } from "@/components/agents/agent-create-modal";
import { Loader2, RotateCcw } from "lucide-react";
import { useState } from "react";

function AppShell({
  children,
  onCreateAgent,
  onCreateTeam,
  showCreateAgent,
  setShowCreateAgent,
}: {
  children: React.ReactNode;
  onCreateAgent: () => void;
  onCreateTeam: () => void;
  showCreateAgent: boolean;
  setShowCreateAgent: (open: boolean) => void;
}) {
  const { state, retryInitialLoad } = useAppState();

  if (state.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-glow/50" />
          <p className="text-sm text-muted-foreground/70">Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (state.initialLoadError) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-lg rounded-xl border border-border bg-card p-6 text-center">
          <h2 className="mb-2 text-lg font-semibold text-foreground">Cannot Reach Daemon API</h2>
          <p className="mb-5 text-sm text-muted-foreground">
            {state.initialLoadError}
          </p>
          <button
            onClick={() => retryInitialLoad()}
            className="inline-flex items-center gap-2 rounded-md bg-cyan-glow px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            <RotateCcw className="h-4 w-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden noise-overlay">
      <LiveLeftPanel
        onCreateAgent={onCreateAgent}
        onCreateTeam={onCreateTeam}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        {children}
      </div>
      <AgentCreateModal
        open={showCreateAgent}
        onOpenChange={setShowCreateAgent}
      />
    </div>
  );
}

function AppContent({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  const [showCreateTeam, setShowCreateTeam] = useState(false);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-glow/50" />
          <p className="text-sm text-muted-foreground/50">Connecting...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <WebSocketProvider>
      <AppStateProvider>
        <AppShell
          onCreateAgent={() => setShowCreateAgent(true)}
          onCreateTeam={() => setShowCreateTeam(!showCreateTeam)}
          showCreateAgent={showCreateAgent}
          setShowCreateAgent={setShowCreateAgent}
        >
          {children}
        </AppShell>
      </AppStateProvider>
    </WebSocketProvider>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppContent>{children}</AppContent>
    </AuthProvider>
  );
}
