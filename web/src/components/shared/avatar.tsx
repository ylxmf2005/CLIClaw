"use client";

import { cn } from "@/lib/utils";
import { getAvatarColor, getInitials } from "@/lib/colors";
import { StatusIndicator, type AgentState } from "@/components/shared/status-indicator";
import { Users } from "lucide-react";

export type AvatarSize = "sm" | "md" | "lg";

const sizeClasses: Record<AvatarSize, string> = {
  sm: "h-8 w-8 text-[10px]",
  md: "h-10 w-10 text-xs",
  lg: "h-12 w-12 text-sm",
};

const shapeClasses: Record<AvatarSize, string> = {
  sm: "rounded-lg",
  md: "rounded-full",
  lg: "rounded-xl",
};

interface AvatarProps {
  name: string;
  size?: AvatarSize;
  /** When true, shows a Users icon with lavender background instead of initials. */
  team?: boolean;
  /** Optional agent status badge overlay. */
  status?: AgentState;
  /** Additional CSS classes on the outer element. */
  className?: string;
}

export function Avatar({
  name,
  size = "md",
  team = false,
  status,
  className,
}: AvatarProps) {
  if (team) {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center bg-lavender-info/10",
          sizeClasses[size],
          shapeClasses[size],
          className
        )}
      >
        <Users className="h-4 w-4 text-lavender-info" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center bg-gradient-to-br font-bold text-white shadow-lg",
        sizeClasses[size],
        shapeClasses[size],
        getAvatarColor(name),
        className
      )}
    >
      {getInitials(name)}
      {status && (
        <StatusIndicator
          state={status}
          size="sm"
          className="absolute -bottom-0.5 -right-0.5"
        />
      )}
    </div>
  );
}
