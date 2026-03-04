"use client";

import { AuthProvider, useAuth } from "@/providers/auth-provider";
import { WebSocketProvider } from "@/providers/ws-provider";
import { AppStateProvider } from "@/providers/app-state-provider";
import { AppShell } from "@/components/layout/app-shell";
import { LoginScreen } from "@/components/shared/login-screen";
import { Loader2 } from "lucide-react";

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();

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
        <AppShell />
      </AppStateProvider>
    </WebSocketProvider>
  );
}

export default function Home() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
