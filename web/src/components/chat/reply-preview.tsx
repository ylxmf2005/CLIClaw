"use client";

import type { Envelope } from "@/lib/types";
import { Reply, X } from "lucide-react";

interface ReplyPreviewProps {
  envelope: Envelope;
  onCancel: () => void;
}

export function ReplyPreview({ envelope, onCancel }: ReplyPreviewProps) {
  const senderName = envelope.from.startsWith("agent:")
    ? envelope.from.slice(6).split(":")[0]
    : envelope.from;

  return (
    <div className="flex items-center gap-2 border-t border-border bg-accent/30 px-4 py-2">
      <Reply className="h-3.5 w-3.5 shrink-0 text-cyan-glow" />
      <div className="min-w-0 flex-1">
        <span className="text-[11px] font-semibold text-cyan-glow">
          Replying to {senderName}
        </span>
        <p className="truncate text-[11px] text-muted-foreground">
          {envelope.content.text?.slice(0, 100)}
        </p>
      </div>
      <button
        onClick={onCancel}
        aria-label="Cancel reply"
        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
