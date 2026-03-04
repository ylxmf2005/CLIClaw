"use client";

import { useRef, useEffect } from "react";
import type { Envelope } from "@/lib/types";
import { cn } from "@/lib/utils";
import { User, Bot } from "lucide-react";

function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function parseAddress(addr: string): { type: string; name: string } {
  if (addr.startsWith("agent:")) return { type: "agent", name: addr.slice(6).split(":")[0] };
  if (addr.startsWith("team:")) return { type: "team", name: addr.slice(5).split(":")[0] };
  if (addr.startsWith("channel:")) return { type: "channel", name: addr.split(":").slice(1).join(":") };
  return { type: "unknown", name: addr };
}

// Deterministic color for sender
const SENDER_COLORS = [
  "text-cyan-400",
  "text-violet-400",
  "text-amber-400",
  "text-emerald-400",
  "text-rose-400",
  "text-indigo-400",
  "text-lime-400",
  "text-fuchsia-400",
];
function getSenderColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return SENDER_COLORS[Math.abs(hash) % SENDER_COLORS.length];
}

interface MessageListProps {
  envelopes: Envelope[];
  currentAgent?: string;
}

export function MessageList({ envelopes, currentAgent }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [envelopes.length]);

  if (envelopes.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-glow/5 text-cyan-glow/30">
            <Bot className="h-8 w-8" />
          </div>
          <p className="text-sm text-muted-foreground/60">
            No messages yet. Send one to start the conversation.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-4 py-3"
    >
      <div className="mx-auto max-w-3xl space-y-1">
        {envelopes.map((env, i) => {
          const from = parseAddress(env.from);
          const isFromBoss = env.fromBoss;
          const isFromCurrentAgent = from.name === currentAgent;
          const isSameSender =
            i > 0 && parseAddress(envelopes[i - 1].from).name === from.name;

          return (
            <div
              key={env.id}
              className={cn(
                "group relative rounded-lg px-4 py-2 transition-colors hover:bg-white/[0.02]",
                !isSameSender && i > 0 && "mt-3"
              )}
            >
              {/* Sender line (only for first message in group) */}
              {!isSameSender && (
                <div className="mb-1 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.05]">
                    {isFromCurrentAgent || from.type === "agent" ? (
                      <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </span>
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      getSenderColor(from.name)
                    )}
                  >
                    {from.name}
                  </span>
                  {isFromBoss && (
                    <span className="rounded bg-amber-pulse/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-pulse">
                      boss
                    </span>
                  )}
                  <span className="text-[11px] text-muted-foreground/40">
                    {formatTime(env.createdAt)}
                  </span>
                </div>
              )}

              {/* Message body */}
              <div
                className={cn(
                  "message-content text-sm leading-relaxed text-foreground/90",
                  !isSameSender ? "pl-8" : "pl-8"
                )}
              >
                {env.content.text && (
                  <p className="whitespace-pre-wrap break-words">
                    {env.content.text}
                  </p>
                )}

                {/* Attachments */}
                {env.content.attachments && env.content.attachments.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {env.content.attachments.map((att, j) => (
                      <div
                        key={j}
                        className="inline-flex items-center gap-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-xs text-muted-foreground"
                      >
                        <span className="font-mono">
                          {att.filename || att.source.split("/").pop()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Inline timestamp for same-sender messages */}
              {isSameSender && (
                <span className="absolute left-4 top-2 hidden text-[10px] text-muted-foreground/30 group-hover:block">
                  {formatTime(env.createdAt)}
                </span>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
