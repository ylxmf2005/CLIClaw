"use client";

import { cn } from "@/lib/utils";

/* ── Base Skeleton ── */

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-muted-foreground/10",
        className
      )}
    />
  );
}

/* ── ChatListItemSkeleton ── */

export function ChatListItemSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      {/* Avatar circle */}
      <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
      {/* Text lines */}
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-2.5 w-10" />
        </div>
        <Skeleton className="h-3 w-36" />
      </div>
    </div>
  );
}

/* ── MessageSkeleton ── */

interface MessageSkeletonProps {
  align?: "left" | "right";
}

export function MessageSkeleton({ align = "left" }: MessageSkeletonProps) {
  return (
    <div
      className={cn(
        "flex gap-2 px-4 py-2",
        align === "right" && "flex-row-reverse"
      )}
    >
      {/* Avatar */}
      <Skeleton className="h-6 w-6 shrink-0 rounded-md" />
      {/* Message block */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-2.5 w-10" />
        </div>
        <Skeleton className="h-4 w-52" />
        <Skeleton className="h-4 w-36" />
      </div>
    </div>
  );
}

/* ── AgentCardSkeleton ── */

export function AgentCardSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      {/* Avatar square */}
      <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
      {/* Info lines */}
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
  );
}

/* ── StatCardSkeleton ── */

export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <Skeleton className="mb-3 h-4 w-4" />
      <Skeleton className="mb-1 h-7 w-12" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}
