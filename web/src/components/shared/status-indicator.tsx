"use client";

import { cn } from "@/lib/utils";

export type AgentState = "idle" | "running" | "error" | "unknown";

const stateConfig: Record<
  AgentState,
  { color: string; pulse: string; label: string }
> = {
  idle: {
    color: "bg-emerald-signal",
    pulse: "pulse-emerald",
    label: "Idle",
  },
  running: {
    color: "bg-amber-pulse",
    pulse: "pulse-amber",
    label: "Running",
  },
  error: {
    color: "bg-rose-alert",
    pulse: "pulse-rose",
    label: "Error",
  },
  unknown: {
    color: "bg-muted-foreground",
    pulse: "",
    label: "Unknown",
  },
};

interface StatusIndicatorProps {
  state: AgentState;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

export function StatusIndicator({
  state,
  size = "md",
  showLabel = false,
  className,
}: StatusIndicatorProps) {
  const config = stateConfig[state];
  const sizeClasses = {
    sm: "h-2 w-2",
    md: "h-2.5 w-2.5",
    lg: "h-3 w-3",
  };

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        className={cn(
          "rounded-full",
          sizeClasses[size],
          config.color,
          state !== "unknown" && config.pulse
        )}
      />
      {showLabel && (
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {config.label}
        </span>
      )}
    </span>
  );
}
