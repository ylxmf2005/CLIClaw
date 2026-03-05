"use client";

import { useDemoContext } from "./page";
import { generateChatId, formatMessageTime } from "@/lib/utils";
import { getSenderColor } from "@/lib/colors";
import { MessageContent } from "@/components/shared/message-content";
import { DemoComposer } from "./demo-composer";

function parseAddr(a: string) {
  if (a.startsWith("agent:")) return { type: "agent", name: a.slice(6).split(":")[0] };
  if (a.startsWith("channel:")) return { type: "channel", name: a.split(":").slice(1).join(":") };
  return { type: "unknown", name: a };
}

export function DemoChatView() {
  const { state, dispatch } = useDemoContext();
  const sel = state.selectedChat;
  if (!sel) return null;

  const agent = state.agents.find((a) => a.name === sel.agentName);
  const status = state.agentStatuses[sel.agentName];
  const currentConversation = state.conversations.find(
    (c) => c.agentName === sel.agentName && c.chatId === sel.chatId
  );
  const envelopes = state.envelopes[`agent:${sel.agentName}:${sel.chatId}`] || [];
  const logLine = state.agentLogLines[sel.agentName];
  const agentState = status
    ? status.agentHealth === "error" ? "error"
    : status.agentState === "running" ? "running" : "idle"
    : "unknown";

  return (
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
          }`} />
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              {sel.agentName}
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
        <div className="flex items-center gap-1">
          {[
            {
              icon: "M12 5v14M5 12h14",
              label: "New chat",
              action: () => {
                const chatId = generateChatId();
                dispatch({
                  type: "ADD_CONVERSATION",
                  conversation: { agentName: sel.agentName, chatId, label: "New Chat", createdAt: Date.now() },
                });
                dispatch({ type: "SELECT_CHAT", selection: { agentName: sel.agentName, chatId } });
              },
            },
            {
              icon: "M4 17l6-6-6-6M12 19h8",
              label: "Terminal",
              active: state.splitPane === "terminal",
              action: () => dispatch({ type: "SET_SPLIT_PANE", pane: state.splitPane === "terminal" ? null : "terminal" }),
            },
            {
              icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
              label: "Cron",
              active: state.splitPane === "cron",
              action: () => dispatch({ type: "SET_SPLIT_PANE", pane: state.splitPane === "cron" ? null : "cron" }),
            },
          ].map((btn, i) => (
            <button
              key={i}
              onClick={btn.action}
              title={btn.label}
              aria-label={btn.label}
              className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:outline-none ${
                btn.active ? "text-cyan-glow" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d={btn.icon} />
              </svg>
            </button>
          ))}
        </div>
      </div>

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
              <p className="mt-1 text-xs text-muted-foreground">Start a conversation with {sel.agentName}</p>
            </div>
          )}
          {envelopes.map((env, i) => {
            const from = parseAddr(env.from);
            const isSameSender = i > 0 && parseAddr(envelopes[i - 1].from).name === from.name;

            return (
              <div key={env.id} className={`group relative rounded-lg px-4 py-2 transition-colors hover:bg-accent/50 ${!isSameSender && i > 0 ? "mt-3" : ""}`}>
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

      {/* Composer */}
      <DemoComposer
        placeholder={`Message ${sel.agentName}...`}
        onSend={(text) => {
          dispatch({ type: "ADD_ENVELOPE", to: `agent:${sel.agentName}`, chatId: sel.chatId, text });
          dispatch({ type: "CLEAR_DRAFT", key: `agent:${sel.agentName}:${sel.chatId}` });
        }}
        draft={state.drafts[`agent:${sel.agentName}:${sel.chatId}`]}
        onDraftChange={(text) =>
          dispatch({ type: "SET_DRAFT", key: `agent:${sel.agentName}:${sel.chatId}`, text })
        }
      />
    </div>
  );
}
