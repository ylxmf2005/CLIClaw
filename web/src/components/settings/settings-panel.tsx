"use client";

import { useWebSocket } from "@/providers/ws-provider";
import { useAuth } from "@/providers/auth-provider";
import { useTheme } from "@/providers/theme-provider";
import { Server, LogOut, Wifi, WifiOff, Loader2, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

interface SettingsPanelProps {
  onDaemonStatus: () => void;
}

export function SettingsPanel({ onDaemonStatus }: SettingsPanelProps) {
  const { status } = useWebSocket();
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex flex-col gap-2 p-3">
      {/* Connection status */}
      <div
        role="status"
        aria-label={`Connection status: ${status}`}
        className={cn(
          "flex items-center gap-2.5 rounded-lg border p-3",
          status === "connected"
            ? "border-emerald-signal/20 bg-emerald-signal/5"
            : status === "connecting"
              ? "border-amber-pulse/20 bg-amber-pulse/5"
              : "border-rose-alert/20 bg-rose-alert/5"
        )}
      >
        {status === "connected" ? (
          <Wifi className="h-4 w-4 text-emerald-signal" aria-hidden="true" />
        ) : status === "connecting" ? (
          <Loader2 className="h-4 w-4 animate-spin text-amber-pulse" aria-hidden="true" />
        ) : (
          <WifiOff className="h-4 w-4 text-rose-alert" aria-hidden="true" />
        )}
        <div>
          <p className="text-xs font-medium text-foreground">
            {status === "connected"
              ? "Connected"
              : status === "connecting"
                ? "Reconnecting..."
                : "Disconnected"}
          </p>
          <p className="text-[10px] text-muted-foreground">
            WebSocket {status}
          </p>
        </div>
      </div>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        className="flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:outline-none"
      >
        {theme === "dark" ? (
          <Sun className="h-3.5 w-3.5" />
        ) : (
          <Moon className="h-3.5 w-3.5" />
        )}
        {theme === "dark" ? "Light Mode" : "Dark Mode"}
      </button>

      {/* Actions */}
      <button
        onClick={onDaemonStatus}
        className="flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:outline-none"
      >
        <Server className="h-3.5 w-3.5" />
        Daemon Status
      </button>

      <button
        onClick={logout}
        className="flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-rose-alert focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:outline-none"
      >
        <LogOut className="h-3.5 w-3.5" />
        Disconnect
      </button>
    </div>
  );
}
