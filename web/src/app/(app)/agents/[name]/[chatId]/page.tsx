"use client";

import { useParams, useRouter } from "next/navigation";
import { useAppState } from "@/providers/app-state-provider";
import { useEffect, useState, useCallback } from "react";
import { cn, formatMessageTime, generateChatId } from "@/lib/utils";
import { getSenderColor } from "@/lib/colors";
import { MessageContent } from "@/components/shared/message-content";
import { MessageComposer } from "@/components/chat/message-composer";
import type { SlashCommand } from "@/components/chat/message-composer";
import type { Envelope } from "@/lib/types";
import * as api from "@/lib/api";

const SLASH_COMMANDS: SlashCommand[] = [
  { command: "interrupt", description: "Toggle interrupt mode for urgent messages" },
  { command: "abort", description: "Abort the current agent run" },
  { command: "refresh", description: "Refresh the agent session" },
];

function parseAddr(a: string) {
  if (a.startsWith("agent:")) return { type: "agent", name: a.slice(6).split(":")[0] };
  if (a.startsWith("channel:")) return { type: "channel", name: a.split(":").slice(1).join(":") };
  return { type: "unknown", name: a };
}

interface ReplyTo {
  envelopeId: string;
  chatKey: string;
  senderName: string;
  preview: string;
}

export default function AgentChatPage() {
  const { name, chatId } = useParams<{ name: string; chatId: string }>();
  const router = useRouter();
  const { state, dispatch, loadEnvelopes, loadConversations } = useAppState();
  const [splitPane, setSplitPane] = useState<"terminal" | "cron" | null>(null);
  const [replyTo, setReplyTo] = useState<ReplyTo | null>(null);
  const [scheduledEnvelopes, setScheduledEnvelopes] = useState<Envelope[]>([]);

  const agent = state.agents.find((a) => a.name === name);
  const status = state.agentStatuses[name];
  const envelopeKey = `agent:${name}:${chatId}`;
  const envelopes = state.envelopes[envelopeKey] || [];
  const logLine = state.agentLogLines[name];
  const conversations = state.conversations[name] || [];
  const currentConversation = conversations.find((c) => c.chatId === chatId);

  const agentState = status
    ? status.agentHealth === "error" ? "error"
    : status.agentState === "running" ? "running" : "idle"
    : "unknown";

  const relayKey = `${name}:${chatId}`;
  const relayOn = state.relayStates[relayKey] ?? false;

  // Load envelopes, conversations, and scheduled envelopes on mount / param change
  useEffect(() => {
    loadEnvelopes(`agent:${name}`, chatId);
    loadConversations(name);
    // Reset unread
    dispatch({ type: "UPDATE_UNREAD", agentName: name, chatId, delta: 0 });
    // Load scheduled/pending envelopes
    api.listEnvelopes({ to: `agent:${name}`, chatId, status: "pending", limit: 20 })
      .then(({ envelopes }) => setScheduledEnvelopes(envelopes))
      .catch(() => {});
  }, [name, chatId, loadEnvelopes, loadConversations, dispatch]);

  const handleSend = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      try {
        await api.sendEnvelope({ to: `agent:${name}:${chatId}`, text });
        loadEnvelopes(`agent:${name}`, chatId);
      } catch {
        // TODO: show error toast
      }
    },
    [name, chatId, loadEnvelopes]
  );

  const handleScheduleSend = useCallback(
    async (text: string, scheduledAt: Date) => {
      if (!text.trim()) return;
      try {
        await api.sendEnvelope({
          to: `agent:${name}:${chatId}`,
          text,
          deliverAt: scheduledAt.toISOString(),
        });
        // Refresh scheduled envelopes
        api.listEnvelopes({ to: `agent:${name}`, chatId, status: "pending", limit: 20 })
          .then(({ envelopes }) => setScheduledEnvelopes(envelopes))
          .catch(() => {});
      } catch {
        // TODO: show error toast
      }
    },
    [name, chatId]
  );

  const handleSlashCommand = useCallback(
    (cmd: string) => {
      if (cmd === "abort") {
        api.abortAgent(name).catch(() => {});
      } else if (cmd === "refresh") {
        api.refreshAgent(name).catch(() => {});
      } else if (cmd === "interrupt") {
        api.sendEnvelope({
          to: `agent:${name}:${chatId}`,
          text: "Interrupt",
          interruptNow: true,
        }).then(() => loadEnvelopes(`agent:${name}`, chatId));
      }
    },
    [name, chatId, loadEnvelopes]
  );

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b border-border bg-card/80 px-4 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <span
              role="status"
              aria-label={`Agent status: ${agentState}`}
              className={`h-2.5 w-2.5 rounded-full ${
                agentState === "running" ? "bg-amber-pulse pulse-amber"
                : agentState === "error" ? "bg-rose-alert pulse-rose"
                : "bg-emerald-signal pulse-emerald"
              }`}
            />
            <div>
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                {name}
                {currentConversation?.label && (
                  <>
                    <span className="text-muted-foreground">/</span>
                    <span className="font-normal text-muted-foreground">{currentConversation.label}</span>
                  </>
                )}
              </h2>
            </div>
            {agent?.provider && (
              <span className="rounded bg-accent px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {agent.provider}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Relay toggle */}
            <button
              role="switch"
              aria-checked={relayOn}
              aria-label="Toggle relay mode"
              title={relayOn ? "Relay ON" : "Relay OFF"}
              onClick={() => dispatch({ type: "SET_RELAY_STATE", key: relayKey, relayOn: !relayOn })}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:outline-none",
                relayOn ? "bg-emerald-signal/30" : "bg-accent"
              )}
            >
              <span className={cn(
                "inline-block h-3.5 w-3.5 rounded-full transition-transform",
                relayOn ? "translate-x-[18px] bg-emerald-signal" : "translate-x-[3px] bg-muted-foreground/40"
              )} />
            </button>

            <div className="mx-1 h-5 w-px bg-border" />

            {/* Action buttons */}
            {[
              {
                icon: "M12 5v14M5 12h14",
                label: "New chat",
                action: () => {
                  const newChatId = generateChatId();
                  router.push(`/agents/${name}/${newChatId}`);
                },
              },
              {
                icon: "M4 17l6-6-6-6M12 19h8",
                label: "Terminal",
                active: splitPane === "terminal",
                action: () => setSplitPane(splitPane === "terminal" ? null : "terminal"),
              },
              {
                icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
                label: "Cron",
                active: splitPane === "cron",
                action: () => setSplitPane(splitPane === "cron" ? null : "cron"),
              },
            ].map((btn, i) => (
              <button
                key={i}
                onClick={btn.action}
                title={btn.label}
                aria-label={btn.label}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:outline-none",
                  btn.active ? "text-cyan-glow" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d={btn.icon} />
                </svg>
              </button>
            ))}

            <div className="mx-1 h-5 w-px bg-border" />

            {/* Agent details */}
            <button
              onClick={() => {
                // TODO: open agent detail sheet
              }}
              title="Agent details"
              aria-label="Agent details"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:outline-none"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scheduled envelopes */}
        {scheduledEnvelopes.length > 0 && (
          <div className="border-b border-amber-pulse/10 bg-amber-pulse/[0.03] px-4 py-2">
            <div className="chat-content-shell">
              <div className="mb-1 flex items-center gap-1.5">
                <svg className="h-3 w-3 text-amber-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-pulse">
                  Scheduled ({scheduledEnvelopes.length})
                </span>
              </div>
              <div className="space-y-1">
                {scheduledEnvelopes.map((env) => (
                  <div key={env.id} className="flex items-start gap-2 rounded-md bg-amber-pulse/5 px-2.5 py-1.5">
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-pulse pulse-amber" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-foreground/80">{env.content.text}</p>
                      <p className="text-[10px] text-muted-foreground">
                        Delivers {env.deliverAt ? new Date(env.deliverAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "soon"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="chat-content-shell space-y-1">
            {envelopes.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-background">
                  <svg className="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                  </svg>
                </div>
                <p className="text-sm text-muted-foreground">No messages yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Start a conversation with {name}</p>
              </div>
            )}
            {envelopes.map((env, i) => {
              const from = parseAddr(env.from);
              const isSameSender = i > 0 && parseAddr(envelopes[i - 1].from).name === from.name;

              return (
                <div key={env.id} className={`group relative rounded-lg px-4 py-2 transition-colors hover:bg-accent/50 ${!isSameSender && i > 0 ? "mt-3" : ""}`}>
                  {/* Reply hover action */}
                  <button
                    onClick={() => setReplyTo({
                      envelopeId: env.id,
                      chatKey: envelopeKey,
                      senderName: from.name,
                      preview: (env.content.text ?? "").slice(0, 80),
                    })}
                    title="Reply"
                    className="absolute right-2 top-1 hidden h-6 w-6 items-center justify-center rounded-md bg-background text-muted-foreground shadow-sm transition-colors hover:text-foreground group-hover:flex"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path d="M3 10h10a5 5 0 015 5v6M3 10l6 6M3 10l6-6" />
                    </svg>
                  </button>
                  {!isSameSender && (
                    <div className="mb-1 flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent">
                        <svg className="h-3.5 w-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          {from.type === "agent"
                            ? <><rect x="3" y="11" width="18" height="11" rx="2" /><circle cx="12" cy="5" r="3" /></>
                            : <><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></>
                          }
                        </svg>
                      </span>
                      <span className={`text-sm font-semibold ${getSenderColor(from.name)}`}>{from.name}</span>
                      {env.fromBoss && (
                        <span className="rounded bg-amber-pulse/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-pulse">boss</span>
                      )}
                      <span className="text-[11px] text-muted-foreground">{formatMessageTime(env.createdAt)}</span>
                    </div>
                  )}
                  <div className="pl-8 text-sm leading-relaxed text-foreground/90">
                    <MessageContent text={env.content.text ?? ""} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Log preview */}
        {agentState === "running" && logLine && (
          <div className="border-t border-amber-pulse/10 bg-amber-pulse/[0.03] px-4 py-2">
            <p className="chat-content-shell truncate font-mono text-[11px] text-amber-pulse/60">
              <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-amber-pulse pulse-amber" />
              {logLine}
            </p>
          </div>
        )}

        {/* Reply preview */}
        {replyTo && replyTo.chatKey === envelopeKey && (
          <div className="flex items-center gap-2 border-t border-cyan-glow/20 bg-cyan-glow/5 px-4 py-2">
            <div className="h-8 w-0.5 rounded-full bg-cyan-glow" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold text-cyan-glow">{replyTo.senderName}</p>
              <p className="truncate text-xs text-muted-foreground">{replyTo.preview}</p>
            </div>
            <button
              onClick={() => setReplyTo(null)}
              title="Cancel reply"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Composer */}
        <MessageComposer
          placeholder={`Message ${name}...`}
          onSend={(text) => {
            if (!text) return;
            // Check for slash command
            if (text.startsWith("/")) {
              const cmd = text.slice(1).split(/\s/)[0].toLowerCase();
              if (SLASH_COMMANDS.some((sc) => sc.command === cmd)) {
                handleSlashCommand(cmd);
                return;
              }
            }
            handleSend(text);
            dispatch({ type: "CLEAR_DRAFT", key: envelopeKey });
          }}
          onScheduleSend={(text, scheduledAt) => {
            if (!text) return;
            handleScheduleSend(text, scheduledAt);
            dispatch({ type: "CLEAR_DRAFT", key: envelopeKey });
          }}
          draft={state.drafts[envelopeKey]}
          onDraftChange={(text) => dispatch({ type: "SET_DRAFT", key: envelopeKey, text })}
          slashCommands={SLASH_COMMANDS}
        />
      </div>

      {/* Split pane */}
      {splitPane === "terminal" && (
        <div className="flex w-[420px] shrink-0 flex-col border-l border-border bg-background">
          <div className="flex h-10 items-center justify-between border-b border-border px-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Terminal</span>
            <button onClick={() => setSplitPane(null)} className="text-muted-foreground hover:text-foreground">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-relaxed text-foreground/70">
            {(state.ptyOutput[name] || []).map((line, i) => (
              <div key={i} className="whitespace-pre-wrap">{line}</div>
            ))}
            {(!state.ptyOutput[name] || state.ptyOutput[name].length === 0) && (
              <p className="text-muted-foreground/50">No terminal output yet.</p>
            )}
          </div>
        </div>
      )}
      {splitPane === "cron" && (
        <div className="flex w-[420px] shrink-0 flex-col border-l border-border bg-background">
          <div className="flex h-10 items-center justify-between border-b border-border px-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Cron Schedules</span>
            <button onClick={() => setSplitPane(null)} className="text-muted-foreground hover:text-foreground">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {state.cronSchedules
              .filter((s) => s.agentName === name || s.to === `agent:${name}`)
              .map((schedule) => (
                <div key={schedule.id} className="mb-2 rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-foreground">{schedule.cron}</span>
                    <span className={cn("text-[10px] font-medium", schedule.enabled ? "text-emerald-signal" : "text-muted-foreground")}>
                      {schedule.enabled ? "Active" : "Disabled"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{schedule.content.text}</p>
                </div>
              ))}
            {state.cronSchedules.filter((s) => s.agentName === name || s.to === `agent:${name}`).length === 0 && (
              <p className="text-xs text-muted-foreground/50">No cron schedules for this agent.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
