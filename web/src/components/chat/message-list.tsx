"use client";

import { useRef, useEffect, useCallback } from "react";
import type { Envelope } from "@/lib/types";
import {
  cn,
  formatMessageTime,
  getEnvelopeSenderKey,
  getEnvelopeSenderName,
  parseAddress,
} from "@/lib/utils";
import { getSenderColor } from "@/lib/colors";
import {
  User,
  Bot,
  Reply,
  TerminalSquare,
  MessageSquare,
  Clock,
  Cpu,
  AlertCircle,
  RotateCcw,
  MessageCircle,
} from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { MessageContent } from "@/components/shared/message-content";
import { deriveMention, type MentionInfo } from "@/lib/mention-utils";

/** Returns an icon for the envelope origin */
function OriginIcon({ origin }: { origin?: string }) {
  switch (origin) {
    case "cli":
      return (
        <span title="Sent via CLI" className="text-muted-foreground/50">
          <TerminalSquare className="h-3 w-3" />
        </span>
      );
    case "channel":
      return (
        <span title="Sent via channel" className="text-muted-foreground/50">
          <MessageSquare className="h-3 w-3" />
        </span>
      );
    case "cron":
      return (
        <span title="Sent by cron" className="text-muted-foreground/50">
          <Clock className="h-3 w-3" />
        </span>
      );
    case "internal":
      return (
        <span title="Internal" className="text-muted-foreground/50">
          <Cpu className="h-3 w-3" />
        </span>
      );
    case "console":
      return (
        <span title="Sent via console" className="text-muted-foreground/50">
          <TerminalSquare className="h-3 w-3" />
        </span>
      );
    default:
      return null;
  }
}

interface MessageListProps {
  envelopes: Envelope[];
  currentAgent?: string;
  onReply?: (envelope: Envelope) => void;
}

export function MessageList({
  envelopes,
  currentAgent,
  onReply,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      100;
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [envelopes.length]);

  const handleReply = useCallback(
    (env: Envelope) => {
      onReply?.(env);
    },
    [onReply]
  );

  if (envelopes.length === 0) {
    return (
      <EmptyState
        icon={MessageCircle}
        title="No messages yet"
        description="Send a message to start the conversation."
      />
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-3">
      <div
        className="chat-content-shell space-y-1"
        role="list"
        aria-label="Messages"
      >
        {envelopes.map((env, i) => {
          const from = parseAddress(env.from);
          const senderName = getEnvelopeSenderName(env);
          const senderKey = getEnvelopeSenderKey(env);
          const isFromBoss = env.fromBoss;
          const isFromCurrentAgent =
            from.type === "agent" && from.name === currentAgent;
          const isSameSender =
            i > 0 && getEnvelopeSenderKey(envelopes[i - 1]!) === senderKey;
          const isFailed = env.status === "failed";

          // Derive @mention info
          const mention: MentionInfo | null = currentAgent
            ? deriveMention(env, currentAgent)
            : null;

          return (
            <div
              key={env.id}
              role="listitem"
              className={cn(
                "group relative rounded-lg px-4 py-2 transition-colors hover:bg-accent/50",
                !isSameSender && i > 0 && "mt-3",
                isFailed && "border-l-2 border-rose-alert/50 bg-rose-alert/5"
              )}
            >
              {/* Sender line (only for first message in group) */}
              {!isSameSender && (
                <div className="mb-1 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent">
                    {isFromCurrentAgent || from.type === "agent" ? (
                      <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </span>
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      getSenderColor(senderName)
                    )}
                  >
                    {senderName}
                  </span>
                  {isFromBoss && (
                    <span className="rounded bg-amber-pulse/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-pulse">
                      boss
                    </span>
                  )}
                  <OriginIcon origin={env.origin} />
                  <span className="text-[11px] text-muted-foreground">
                    {formatMessageTime(env.createdAt)}
                  </span>
                </div>
              )}

              {/* @mention prefix */}
              {mention && (
                <div className="mb-0.5 pl-8">
                  <span className="inline-flex items-center gap-1 rounded bg-cyan-glow/10 px-1.5 py-0.5 text-[11px] font-medium text-cyan-glow">
                    @{mention.target}
                  </span>
                </div>
              )}

              {/* Message body */}
              <div
                className={cn(
                  "message-content text-sm leading-relaxed text-foreground/90",
                  "pl-8"
                )}
              >
                {env.content.text && (
                  <MessageContent text={env.content.text} />
                )}

                {/* Attachments */}
                {env.content.attachments &&
                  env.content.attachments.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {env.content.attachments.map((att, j) => (
                        <div
                          key={j}
                          className="inline-flex items-center gap-2 rounded-md border border-border bg-accent/50 px-3 py-1.5 text-xs text-muted-foreground"
                        >
                          <span className="font-mono">
                            {att.filename || att.source.split("/").pop()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                {/* Failed indicator */}
                {isFailed && (
                  <div className="mt-1 flex items-center gap-2">
                    <AlertCircle className="h-3 w-3 text-rose-alert" />
                    <span className="text-[11px] text-rose-alert">
                      Failed to deliver
                    </span>
                    <button
                      onClick={() => {
                        // TODO: implement retry via resend
                      }}
                      className="flex items-center gap-1 text-[11px] text-cyan-glow hover:underline"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Retry
                    </button>
                  </div>
                )}
              </div>

              {/* Inline timestamp for same-sender messages */}
              {isSameSender && (
                <span className="absolute left-4 top-2 hidden text-[10px] text-muted-foreground/60 group-hover:block">
                  {formatMessageTime(env.createdAt)}
                </span>
              )}

              {/* Reply button (hover) */}
              {onReply && (
                <button
                  onClick={() => handleReply(env)}
                  aria-label="Reply to this message"
                  className="absolute right-2 top-2 hidden rounded p-1 text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground group-hover:block"
                >
                  <Reply className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
