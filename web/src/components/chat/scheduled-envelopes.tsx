"use client";

import type { Envelope } from "@/lib/types";
import { Clock } from "lucide-react";
import { formatMessageTime } from "@/lib/utils";

interface ScheduledEnvelopesProps {
  envelopes: Envelope[];
}

export function ScheduledEnvelopes({ envelopes }: ScheduledEnvelopesProps) {
  if (envelopes.length === 0) return null;

  return (
    <div className="border-b border-amber-pulse/20 bg-amber-pulse/5 px-4 py-2">
      <div className="mb-1 flex items-center gap-1.5">
        <Clock className="h-3 w-3 text-amber-pulse" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-pulse">
          Scheduled ({envelopes.length})
        </span>
      </div>
      <div className="space-y-1">
        {envelopes.map((env) => (
          <div
            key={env.id}
            className="flex items-center gap-2 text-[11px] text-amber-pulse/80"
          >
            <span className="font-mono">
              {env.deliverAt ? formatMessageTime(env.deliverAt) : "pending"}
            </span>
            <span className="truncate text-foreground/70">
              {env.content.text?.slice(0, 60)}
              {(env.content.text?.length ?? 0) > 60 ? "..." : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
