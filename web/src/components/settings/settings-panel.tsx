"use client";

import { useWebSocket } from "@/providers/ws-provider";
import { useAuth } from "@/providers/auth-provider";
import { Server, LogOut, Wifi, WifiOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SettingsPanelProps {
  onDaemonStatus: () => void;
}

export function SettingsPanel({ onDaemonStatus }: SettingsPanelProps) {
  const { status } = useWebSocket();
  const { logout } = useAuth();

  return (
    <div className="flex flex-col gap-2 p-3">
      {/* Connection status */}
      <div
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
          <Wifi className="h-4 w-4 text-emerald-signal" />
        ) : status === "connecting" ? (
          <Loader2 className="h-4 w-4 animate-spin text-amber-pulse" />
        ) : (
          <WifiOff className="h-4 w-4 text-rose-alert" />
        )}
        <div>
          <p className="text-xs font-medium text-foreground">
            {status === "connected"
              ? "Connected"
              : status === "connecting"
                ? "Reconnecting..."
                : "Disconnected"}
          </p>
          <p className="text-[10px] text-muted-foreground/50">
            WebSocket {status}
          </p>
        </div>
      </div>

      {/* Actions */}
      <button
        onClick={onDaemonStatus}
        className="flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-xs text-muted-foreground transition-colors hover:bg-white/[0.03] hover:text-foreground"
      >
        <Server className="h-3.5 w-3.5" />
        Daemon Status
      </button>

      <button
        onClick={logout}
        className="flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-xs text-muted-foreground/50 transition-colors hover:bg-white/[0.03] hover:text-rose-alert"
      >
        <LogOut className="h-3.5 w-3.5" />
        Disconnect
      </button>
    </div>
  );
}
