"use client";

import { useParams, useRouter } from "next/navigation";
import { useAppState } from "@/providers/app-state-provider";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  cn,
  formatMessageTime,
  getEnvelopeSenderKey,
  getEnvelopeSenderName,
  parseAddress,
} from "@/lib/utils";
import { getSenderColor } from "@/lib/colors";
import { deriveMention } from "@/lib/mention-utils";
import { MessageContent } from "@/components/shared/message-content";
import { MessageComposer } from "@/components/chat/message-composer";
import { AgentTerminalPane } from "@/components/terminal/agent-terminal-pane";
import type { AttachmentFile, SlashCommand } from "@/components/chat/message-composer";
import type { Envelope, EnvelopeAttachment, ReasoningEffort } from "@/lib/types";
import * as api from "@/lib/api";
import { useToast } from "@/providers/toast-provider";

const SLASH_COMMANDS: SlashCommand[] = [
  { command: "interrupt", description: "Toggle interrupt mode for urgent messages" },
  { command: "abort", description: "Abort the current agent run" },
  { command: "refresh", description: "Refresh the agent session" },
];

interface ReplyTo {
  envelopeId: string;
  chatKey: string;
  senderName: string;
  preview: string;
}

interface SlashExecution {
  id: string;
  command: string;
  status: "running" | "success" | "error";
  at: number;
  detail?: string;
}

export default function AgentChatPage() {
  const { name, chatId } = useParams<{ name: string; chatId: string }>();
  const router = useRouter();
  const { state, dispatch, loadEnvelopes, loadConversations, loadSessions, loadPtyHistory } = useAppState();
  const { toast } = useToast();
  const [splitPane, setSplitPane] = useState<"terminal" | "cron" | null>(null);
  const [replyTo, setReplyTo] = useState<ReplyTo | null>(null);
  const [scheduledEnvelopes, setScheduledEnvelopes] = useState<Envelope[]>([]);
  const [showBindings, setShowBindings] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<EnvelopeAttachment[]>([]);
  const [slashExecutions, setSlashExecutions] = useState<SlashExecution[]>([]);
  const [chatModelOverride, setChatModelOverride] = useState<string | null>(null);
  const [chatReasoningOverride, setChatReasoningOverride] = useState<ReasoningEffort | null>(null);

  const [chatTransition, setChatTransition] = useState(false);
  const scrollPositions = useRef<Map<string, number>>(new Map());
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevChatRef = useRef<string>("");
  const pendingChatSettingsSaveRef = useRef<Promise<void> | null>(null);

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
  const relayAvailable = state.daemonStatus?.relayAvailable ?? false;
  const ptyChunks = state.ptyOutput[relayKey] || [];
  const hasPtyTranscript = ptyChunks.length > 0;

  const resolveFromAddress = useCallback((): string => {
    const sessions = state.sessions[name] || [];
    const session = sessions.find((s) => s.bindings.some((b) => b.chatId === chatId));
    if (!session) return `channel:console:${chatId}`;

    const binding = session.bindings.find((b) => b.chatId === chatId);
    if (!binding || binding.adapterType === "console" || binding.adapterType === "internal") {
      return `channel:console:${chatId}`;
    }
    return `channel:${binding.adapterType}:${binding.chatId}`;
  }, [state.sessions, name, chatId]);

  // Save scroll position when switching away, restore when switching back
  useEffect(() => {
    const chatKey = `${name}:${chatId}`;
    const prevKey = prevChatRef.current;

    // Save scroll position of previous chat
    if (prevKey && prevKey !== chatKey && scrollContainerRef.current) {
      scrollPositions.current.set(prevKey, scrollContainerRef.current.scrollTop);
    }

    // Transition animation
    if (prevKey && prevKey !== chatKey) {
      setChatTransition(true);
      const timer = setTimeout(() => setChatTransition(false), 150);
      prevChatRef.current = chatKey;
      return () => clearTimeout(timer);
    }

    prevChatRef.current = chatKey;
  }, [name, chatId]);

  // Restore scroll position after envelopes load
  useEffect(() => {
    const chatKey = `${name}:${chatId}`;
    const saved = scrollPositions.current.get(chatKey);
    if (saved != null && scrollContainerRef.current && envelopes.length > 0) {
      scrollContainerRef.current.scrollTop = saved;
      scrollPositions.current.delete(chatKey);
    }
  }, [name, chatId, envelopes.length]);

  // Load envelopes, conversations, and scheduled envelopes on mount / param change
  useEffect(() => {
    loadEnvelopes(`agent:${name}`, chatId);
    loadConversations(name);
    loadSessions(name);
    loadPtyHistory(name, chatId);
    // Reset unread
    dispatch({ type: "UPDATE_UNREAD", agentName: name, chatId, delta: 0 });
    // Load scheduled/pending envelopes
    api.listEnvelopes({ to: `agent:${name}`, chatId, status: "pending", limit: 20 })
      .then(({ envelopes }) => setScheduledEnvelopes(envelopes))
      .catch(() => {});
  }, [name, chatId, loadEnvelopes, loadConversations, loadSessions, loadPtyHistory, dispatch]);

  useEffect(() => {
    let cancelled = false;
    api.getRelayState(name, chatId)
      .then((result) => {
        if (!cancelled) {
          dispatch({ type: "SET_RELAY_STATE", key: relayKey, relayOn: result.relayOn });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [name, chatId, relayKey, dispatch]);

  useEffect(() => {
    let cancelled = false;
    setChatModelOverride(null);
    setChatReasoningOverride(null);
    pendingChatSettingsSaveRef.current = null;

    api.getChatSettings(name, chatId)
      .then((result) => {
        if (cancelled) return;
        setChatModelOverride(result.modelOverride ?? null);
        setChatReasoningOverride(result.reasoningEffortOverride ?? null);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [name, chatId]);

  const persistChatSettings = useCallback(
    (nextModelOverride: string | null, nextReasoningOverride: ReasoningEffort | null) => {
      setChatModelOverride(nextModelOverride);
      setChatReasoningOverride(nextReasoningOverride);

      const request = api.updateChatSettings(name, chatId, {
        modelOverride: nextModelOverride,
        reasoningEffortOverride: nextReasoningOverride,
      })
        .then((result) => {
          setChatModelOverride(result.modelOverride ?? null);
          setChatReasoningOverride(result.reasoningEffortOverride ?? null);
        })
        .catch((err) => {
          toast({
            title: "Chat settings update failed",
            description: err instanceof Error ? err.message : "Could not update chat model settings",
            variant: "error",
          });
        })
        .finally(() => {
          if (pendingChatSettingsSaveRef.current === request) {
            pendingChatSettingsSaveRef.current = null;
          }
        });

      pendingChatSettingsSaveRef.current = request;
    },
    [name, chatId, toast]
  );

  const handleSend = useCallback(
    async (text: string, composerAttachments?: AttachmentFile[]) => {
      if (!text.trim()) return;
      try {
        const pendingSettingsSave = pendingChatSettingsSaveRef.current;
        if (pendingSettingsSave) {
          await pendingSettingsSave.catch(() => undefined);
        }

        const uploadedAttachments: EnvelopeAttachment[] = [];
        if (composerAttachments && composerAttachments.length > 0) {
          for (const att of composerAttachments) {
            const { path } = await api.uploadFile(att.file);
            uploadedAttachments.push({ source: path, filename: att.file.name });
          }
        }
        const from = resolveFromAddress();
        const attachments = [...pendingAttachments, ...uploadedAttachments];
        await api.sendEnvelope({
          to: `agent:${name}:${chatId}`,
          text,
          from,
          attachments: attachments.length > 0 ? attachments : undefined,
          replyToEnvelopeId: replyTo?.envelopeId,
        });
        setPendingAttachments([]);
        setReplyTo(null);
        // Trust WS `envelope.new` event for real-time update instead of refetching
      } catch (err) {
        toast({
          title: "Send failed",
          description: err instanceof Error ? err.message : "Could not send message",
          variant: "error",
        });
      }
    },
    [name, chatId, pendingAttachments, replyTo, resolveFromAddress, toast]
  );

  const handleScheduleSend = useCallback(
    async (text: string, scheduledAt: Date) => {
      if (!text.trim()) return;
      try {
        const pendingSettingsSave = pendingChatSettingsSaveRef.current;
        if (pendingSettingsSave) {
          await pendingSettingsSave.catch(() => undefined);
        }

        const from = resolveFromAddress();
        await api.sendEnvelope({
          to: `agent:${name}:${chatId}`,
          text,
          from,
          deliverAt: scheduledAt.toISOString(),
          replyToEnvelopeId: replyTo?.envelopeId,
        });
        setReplyTo(null);
        // Refresh scheduled envelopes
        api.listEnvelopes({ to: `agent:${name}`, chatId, status: "pending", limit: 20 })
          .then(({ envelopes }) => setScheduledEnvelopes(envelopes))
          .catch(() => {});
      } catch (err) {
        toast({
          title: "Schedule failed",
          description: err instanceof Error ? err.message : "Could not schedule message",
          variant: "error",
        });
      }
    },
    [name, chatId, replyTo, resolveFromAddress, toast]
  );

  const handleSlashCommand = useCallback(
    async (cmd: string) => {
      const commandText = `/${cmd}`;
      const executionId = `slash-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const runningExecution: SlashExecution = {
        id: executionId,
        command: commandText,
        status: "running",
        at: Date.now(),
      };
      setSlashExecutions((prev) => [runningExecution, ...prev].slice(0, 4));

      try {
        if (cmd === "abort") {
          await api.abortAgent(name);
        } else if (cmd === "refresh") {
          await api.refreshAgent(name);
        } else if (cmd === "interrupt") {
          const from = resolveFromAddress();
          await api.sendEnvelope({
            to: `agent:${name}:${chatId}`,
            text: "Interrupt",
            interruptNow: true,
            from,
          });
        } else {
          throw new Error(`Unsupported slash command: ${commandText}`);
        }

        setSlashExecutions((prev) => prev.map((item) =>
          item.id === executionId ? { ...item, status: "success" as const } : item
        ));
        toast({
          description: `${commandText} executed`,
          variant: "success",
        });
      } catch (err) {
        const detail = err instanceof Error ? err.message : "Unknown error";
        setSlashExecutions((prev) => prev.map((item) =>
          item.id === executionId ? { ...item, status: "error" as const, detail } : item
        ));
        toast({
          title: `${commandText} failed`,
          description: detail,
          variant: "error",
        });
      }
    },
    [name, chatId, resolveFromAddress, toast]
  );

  // Task 9.2: Relay toggle handler that also calls the backend API
  const handleRelayToggle = useCallback(async () => {
    const newState = !relayOn;
    dispatch({ type: "SET_RELAY_STATE", key: relayKey, relayOn: newState });
    try {
      await api.toggleRelay(name, chatId, newState);
    } catch {
      // Revert on failure
      dispatch({ type: "SET_RELAY_STATE", key: relayKey, relayOn: !newState });
    }
  }, [relayOn, relayKey, name, chatId, dispatch]);

  // Task 10.3: File drop handler for the messages area
  const handleFileDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      try {
        const { path } = await api.uploadFile(file);
        setPendingAttachments((prev) => [...prev, { source: path, filename: file.name }]);
      } catch {
        // ignore upload errors
      }
    }
  }, []);

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
            {/* Adapter badges from session bindings */}
            {(() => {
              const sessions = state.sessions[name] || [];
              const session = sessions.find((s) => s.bindings.some((b) => b.chatId === chatId));
              if (!session) return null;
              return (
                <div className="flex items-center gap-1">
                  {session.bindings.map((b) => (
                    <span
                      key={`${b.adapterType}:${b.chatId}`}
                      className="rounded bg-accent px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground"
                      title={`${b.adapterType}: ${b.chatId}`}
                    >
                      {b.adapterType}
                    </span>
                  ))}
                </div>
              );
            })()}
          </div>
          <div className="flex items-center gap-2">
            {/* Relay toggle - Task 9.2: wired to backend API, Task 9.3: disabled when unavailable */}
            <button
              role="switch"
              aria-checked={relayOn}
              aria-label="Toggle relay mode"
              title={!relayAvailable ? "Relay not available" : relayOn ? "Relay ON" : "Relay OFF"}
              disabled={!relayAvailable}
              onClick={handleRelayToggle}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:outline-none",
                !relayAvailable ? "cursor-not-allowed opacity-40" : "",
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
                action: async () => {
                  try {
                    const result = await api.createAgentSession(name, { adapterType: "console" });
                    await loadSessions(name);
                    router.push(`/agents/${name}/${result.chatId}`);
                  } catch {
                    // TODO: show error toast
                  }
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

            {/* Session bindings */}
            <button
              onClick={() => setShowBindings(!showBindings)}
              title="Session bindings"
              aria-label="Session bindings"
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:outline-none",
                showBindings ? "text-cyan-glow" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </button>

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

        {/* Session bindings panel */}
        {showBindings && (() => {
          const sessions = state.sessions[name] || [];
          const session = sessions.find((s) => s.bindings.some((b) => b.chatId === chatId));
          return (
            <div className="border-b border-border bg-accent/30 px-4 py-3">
              <div className="chat-content-shell">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Session Bindings
                  </span>
                  <button
                    onClick={async () => {
                      const adapterType = prompt("Adapter type (e.g., telegram, console):");
                      if (!adapterType) return;
                      const bindChatId = prompt("Chat ID:");
                      if (!bindChatId || !session) return;
                      try {
                        await api.addSessionBinding(name, session.id, { adapterType, chatId: bindChatId });
                        loadSessions(name);
                      } catch (err) {
                        alert(err instanceof Error ? err.message : "Failed to add binding");
                      }
                    }}
                    disabled={!session}
                    className="text-[10px] font-medium text-cyan-glow hover:text-cyan-glow/80 disabled:opacity-50"
                  >
                    + Link adapter
                  </button>
                </div>
                {session ? (
                  <div className="space-y-1">
                    {session.bindings.map((b) => (
                      <div key={`${b.adapterType}:${b.chatId}`} className="flex items-center justify-between rounded-md bg-background/50 px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-accent px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                            {b.adapterType}
                          </span>
                          <span className="font-mono text-xs text-foreground/80">{b.chatId}</span>
                        </div>
                        {session.bindings.length > 1 && (
                          <button
                            onClick={async () => {
                              if (!confirm(`Remove ${b.adapterType}:${b.chatId} binding?`)) return;
                              try {
                                await api.removeSessionBinding(name, session.id, b.adapterType, b.chatId);
                                loadSessions(name);
                              } catch (err) {
                                alert(err instanceof Error ? err.message : "Failed to remove binding");
                              }
                            }}
                            className="text-[10px] text-rose-alert/60 hover:text-rose-alert"
                          >
                            Unlink
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground/50">No session found for this chat.</p>
                )}
              </div>
            </div>
          );
        })()}

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

        {/* Messages - Task 10.3: drag-drop file upload */}
        <div
          ref={scrollContainerRef}
          className={cn(
            "min-h-0 flex-1 overflow-y-auto px-4 py-3 transition-opacity duration-150",
            chatTransition && "opacity-0 translate-y-1"
          )}
          onDrop={handleFileDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <div className="chat-content-shell space-y-1">
            {envelopes.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-background">
                  <svg className="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                  </svg>
                </div>
                <p className="text-sm text-muted-foreground">
                  {hasPtyTranscript ? "No envelope messages yet" : "No messages yet"}
                </p>
                {hasPtyTranscript ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    PTY transcript restored ({ptyChunks.length} chunks). Open Terminal to view history.
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">Start a conversation with {name}</p>
                )}
              </div>
            )}
            {envelopes.map((env, i) => {
              const from = parseAddress(env.from);
              const senderName = getEnvelopeSenderName(env);
              const senderKey = getEnvelopeSenderKey(env);
              const isSameSender =
                i > 0 && getEnvelopeSenderKey(envelopes[i - 1]!) === senderKey;
              const mention = deriveMention(env, name);
              const lastDeliveryError =
                env.metadata &&
                typeof env.metadata === "object" &&
                (env.metadata as Record<string, unknown>).lastDeliveryError;
              const hasOriginBadge = typeof env.origin === "string" && env.origin !== "cli";
              const hasDeliveryError = Boolean(lastDeliveryError);

              return (
                <div key={env.id} className={`group relative rounded-lg px-4 py-2 transition-colors hover:bg-accent/50 ${!isSameSender && i > 0 ? "mt-3" : ""}`}>
                  {/* Reply hover action */}
                  <button
                    onClick={() => setReplyTo({
                      envelopeId: env.id,
                      chatKey: envelopeKey,
                      senderName,
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
                      <span className={`text-sm font-semibold ${getSenderColor(senderName)}`}>{senderName}</span>
                      {env.fromBoss && (
                        <span className="rounded bg-amber-pulse/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-pulse">boss</span>
                      )}
                      <span className="text-[11px] text-muted-foreground">{formatMessageTime(env.createdAt)}</span>
                      {/* Task 10.2: Envelope origin indicator */}
                      {hasOriginBadge && (
                        <span className="rounded bg-accent/80 px-1 py-0.5 text-[8px] font-medium uppercase tracking-wider text-muted-foreground/70">
                          {String(env.origin)}
                        </span>
                      )}
                      {hasDeliveryError && (
                        <span className="rounded bg-rose-alert/15 px-1 py-0.5 text-[8px] font-medium uppercase tracking-wider text-rose-alert">
                          failed
                        </span>
                      )}
                    </div>
                  )}
                  {mention && (
                    <div className="mb-0.5 pl-8">
                      <span className="inline-flex items-center gap-1 rounded bg-cyan-glow/10 px-1.5 py-0.5 text-[11px] font-medium text-cyan-glow">
                        @{mention.target}
                      </span>
                    </div>
                  )}
                  <div className="pl-8 text-sm leading-relaxed text-foreground/90">
                    <MessageContent text={env.content.text ?? ""} />
                    {hasDeliveryError && (
                      <p className="mt-1 text-[11px] text-rose-alert/90">Delivery failed</p>
                    )}
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

        {/* Pending attachments preview - Task 10.3 */}
        {pendingAttachments.length > 0 && (
          <div className="flex items-center gap-2 border-t border-border bg-accent/30 px-4 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Attachments ({pendingAttachments.length})
            </span>
            <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
              {pendingAttachments.map((att, idx) => (
                <span key={idx} className="inline-flex items-center gap-1 rounded bg-background px-2 py-0.5 text-xs text-foreground/80">
                  {att.filename ?? att.source}
                  <button
                    onClick={() => setPendingAttachments((prev) => prev.filter((_, j) => j !== idx))}
                    className="ml-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </span>
              ))}
            </div>
            <button
              onClick={() => setPendingAttachments([])}
              title="Clear all"
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </div>
        )}

        {/* Slash command execution feedback */}
        {slashExecutions.length > 0 && (
          <div className="border-t border-cyan-glow/20 bg-cyan-glow/5 px-4 py-2">
            <div className="chat-content-shell space-y-1">
              {slashExecutions.map((item) => (
                <div key={item.id} className="rounded-md bg-background/40 px-2 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="font-mono text-xs text-foreground">{item.command}</span>
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                          item.status === "running" && "bg-amber-pulse/15 text-amber-pulse",
                          item.status === "success" && "bg-emerald-signal/15 text-emerald-signal",
                          item.status === "error" && "bg-rose-alert/15 text-rose-alert"
                        )}
                      >
                        {item.status}
                      </span>
                    </div>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatMessageTime(item.at)}
                    </span>
                  </div>
                  {item.detail && (
                    <p className="mt-1 truncate text-[10px] text-rose-alert/90">{item.detail}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Composer */}
        <MessageComposer
          placeholder={`Message ${name}...`}
          onSend={(text, attachments) => {
            if (!text) return;
            // Check for slash command
            if (text.startsWith("/")) {
              const cmd = text.slice(1).split(/\s/)[0].toLowerCase();
              if (SLASH_COMMANDS.some((sc) => sc.command === cmd)) {
                void handleSlashCommand(cmd);
                dispatch({ type: "CLEAR_DRAFT", key: envelopeKey });
                return;
              }
            }
            handleSend(text, attachments);
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
          chatModelOverrides={
            agent
              ? {
                  provider: agent.provider,
                  agentDefaultModel: agent.model,
                  agentDefaultReasoningEffort: agent.reasoningEffort,
                  modelOverride: chatModelOverride,
                  reasoningEffortOverride: chatReasoningOverride,
                  onModelOverrideChange: (modelOverride) =>
                    persistChatSettings(modelOverride, chatReasoningOverride),
                  onReasoningEffortOverrideChange: (reasoningEffortOverride) =>
                    persistChatSettings(chatModelOverride, reasoningEffortOverride),
                }
              : undefined
          }
        />
      </div>

      {/* Split pane - Task 9.2 & 9.3: interactive terminal with PTY input */}
      {splitPane === "terminal" && (
        <AgentTerminalPane
          agentName={name}
          chatId={chatId}
          relayOn={relayOn}
          initialPtyOutput={ptyChunks}
          initialLogLine={state.agentLogLines[name]}
          onClose={() => setSplitPane(null)}
          className="w-[420px] shrink-0"
        />
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
