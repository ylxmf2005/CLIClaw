"use client";

import { AuthProvider, useAuth } from "@/providers/auth-provider";
import { WebSocketProvider } from "@/providers/ws-provider";
import { AppStateProvider } from "@/providers/app-state-provider";
import { LoginScreen } from "@/components/shared/login-screen";
import { LiveLeftPanel } from "@/components/layout/live-left-panel";
import { AgentCreateModal } from "@/components/agents/agent-create-modal";
import { Loader2 } from "lucide-react";
import { useState } from "react";

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
        <div className="flex h-screen overflow-hidden noise-overlay">
          <LiveLeftPanel
            onCreateAgent={() => setShowCreateAgent(true)}
            onCreateTeam={() => setShowCreateTeam(!showCreateTeam)}
          />
          <div className="flex flex-1 flex-col overflow-hidden">
            {children}
          </div>
          <AgentCreateModal
            open={showCreateAgent}
            onOpenChange={setShowCreateAgent}
          />
        </div>
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
