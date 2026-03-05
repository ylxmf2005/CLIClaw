"use client";

import { useEffect, useCallback, useState } from "react";
import { useAppState } from "@/providers/app-state-provider";
import { useToast } from "@/providers/toast-provider";
import { MessageList } from "./message-list";
import { MessageComposer } from "./message-composer";
import { ScheduledEnvelopes } from "./scheduled-envelopes";
import { ReplyPreview } from "./reply-preview";
import { ChatHeader } from "./chat-header";
import { AgentDetailSheet } from "@/components/agents/agent-detail-sheet";
import type { AgentState } from "@/components/shared/status-indicator";
import { Terminal } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { generateChatId } from "@/lib/utils";
import {
  sendEnvelope,
  abortAgent,
  refreshAgent,
  uploadFile,
  listEnvelopes,
  toggleRelay,
} from "@/lib/api";
import type { Envelope } from "@/lib/types";
import type { AttachmentFile } from "./attachment-bar";

export function ChatView() {
  const { state, dispatch, loadEnvelopes } = useAppState();
  const { toast } = useToast();
  const selection = state.selectedChat;
  const [interruptMode, setInterruptMode] = useState(false);
  const [replyTo, setReplyTo] = useState<Envelope | null>(null);
  const [pendingEnvelopes, setPendingEnvelopes] = useState<Envelope[]>([]);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);

  // Load envelopes for selected chat
  useEffect(() => {
    if (selection) {
      loadEnvelopes(`agent:${selection.agentName}`, selection.chatId);
    }
  }, [selection, loadEnvelopes]);

  // Load pending/scheduled envelopes
  useEffect(() => {
    if (!selection) return;
    let cancelled = false;
    async function fetchPending() {
      try {
        const { envelopes } = await listEnvelopes({
          to: `agent:${selection!.agentName}`,
          chatId: selection!.chatId,
          status: "pending",
          limit: 20,
        });
        if (!cancelled) setPendingEnvelopes(envelopes);
      } catch {
        // silent
      }
    }
    fetchPending();
    return () => { cancelled = true; };
  }, [selection]);

  // Reset reply when chat changes
  useEffect(() => {
    setReplyTo(null);
    setInterruptMode(false);
  }, [selection?.agentName, selection?.chatId]);

  const handleSend = useCallback(
    async (text: string, attachments?: AttachmentFile[]) => {
      if (!selection || !text.trim()) return;

      const address = `agent:${selection.agentName}:${selection.chatId}`;

      try {
        // Upload attachments first if any
        let uploadedAttachments: { source: string; filename: string }[] | undefined;
        if (attachments && attachments.length > 0) {
          uploadedAttachments = await Promise.all(
            attachments.map(async (att) => {
              const { path } = await uploadFile(att.file);
              return { source: path, filename: att.file.name };
            })
          );
        }

        await sendEnvelope({
          to: address,
          text,
          attachments: uploadedAttachments,
          interruptNow: interruptMode || undefined,
          replyToEnvelopeId: replyTo?.id,
        });

        dispatch({ type: "CLEAR_DRAFT", key: address });
        setReplyTo(null);
        if (interruptMode) setInterruptMode(false);
      } catch (err) {
        toast({
          title: "Send failed",
          description: err instanceof Error ? err.message : "Could not send message",
          variant: "error",
        });
      }
    },
    [selection, interruptMode, replyTo, dispatch, toast]
  );

  const handleScheduleSend = useCallback(
    async (text: string, scheduledAt: Date) => {
      if (!selection || !text.trim()) return;
      const address = `agent:${selection.agentName}:${selection.chatId}`;
      try {
        await sendEnvelope({
          to: address,
          text,
          deliverAt: scheduledAt.toISOString(),
        });
        dispatch({ type: "CLEAR_DRAFT", key: address });
        toast({
          title: "Scheduled",
          description: `Message scheduled for ${scheduledAt.toLocaleString()}`,
          variant: "success",
        });
      } catch (err) {
        toast({
          title: "Schedule failed",
          description: err instanceof Error ? err.message : "Could not schedule message",
          variant: "error",
        });
      }
    },
    [selection, dispatch, toast]
  );

  const handleAbort = useCallback(async () => {
    if (!selection) return;
    try {
      await abortAgent(selection.agentName);
      toast({ description: `Aborted ${selection.agentName}`, variant: "warning" });
    } catch (err) {
      toast({
        title: "Abort failed",
        description: err instanceof Error ? err.message : "Could not abort agent",
        variant: "error",
      });
    }
  }, [selection, toast]);

  const handleRefresh = useCallback(async () => {
    if (!selection) return;
    try {
      await refreshAgent(selection.agentName);
      toast({ description: `Session refreshed for ${selection.agentName}`, variant: "success" });
    } catch (err) {
      toast({
        title: "Refresh failed",
        description: err instanceof Error ? err.message : "Could not refresh session",
        variant: "error",
      });
    }
  }, [selection, toast]);

  const handleReply = useCallback((envelope: Envelope) => {
    setReplyTo(envelope);
  }, []);

  const handleNewChat = useCallback(() => {
    if (!selection) return;
    dispatch({
      type: "SELECT_CHAT",
      selection: { agentName: selection.agentName, chatId: generateChatId() },
    });
  }, [selection, dispatch]);

  const relayKey = selection ? `${selection.agentName}:${selection.chatId}` : "";
  const relayOn = state.relayStates[relayKey] ?? false;
  const relayAvailable = state.daemonStatus?.relayAvailable ?? false;

  const handleToggleRelay = useCallback(async () => {
    if (!selection || !relayAvailable) return;
    const newState = !relayOn;
    try {
      await toggleRelay(selection.agentName, selection.chatId, newState);
      dispatch({ type: "SET_RELAY_STATE", key: relayKey, relayOn: newState });
    } catch (err) {
      toast({
        title: "Relay toggle failed",
        description: err instanceof Error ? err.message : "Could not toggle relay",
        variant: "error",
      });
    }
  }, [selection, relayAvailable, relayOn, relayKey, dispatch, toast]);

  if (!selection) {
    return (
      <EmptyState
        icon={Terminal}
        title="Hi-Boss Control"
        description="Select an agent to start a conversation"
      />
    );
  }

  const agent = state.agents.find((a) => a.name === selection.agentName);
  const status = state.agentStatuses[selection.agentName];
  const agentState: AgentState = status
    ? status.agentHealth === "error"
      ? "error"
      : status.agentState === "running"
        ? "running"
        : "idle"
    : "unknown";

  const envelopeKey = `agent:${selection.agentName}:${selection.chatId}`;
  const envelopes = state.envelopes[envelopeKey] || [];

  return (
    <div className="flex flex-1 flex-col">
      {/* Chat header */}
      <ChatHeader
        agentName={selection.agentName}
        chatId={selection.chatId}
        agentState={agentState}
        provider={agent?.provider}
        splitPane={state.splitPane}
        interruptMode={interruptMode}
        onToggleInterrupt={() => setInterruptMode((v) => !v)}
        onNewChat={handleNewChat}
        onToggleTerminal={() =>
          dispatch({
            type: "SET_SPLIT_PANE",
            pane: state.splitPane === "terminal" ? null : "terminal",
          })
        }
        onToggleCron={() =>
          dispatch({
            type: "SET_SPLIT_PANE",
            pane: state.splitPane === "cron" ? null : "cron",
          })
        }
        onToggleThread={() =>
          dispatch({
            type: "SET_SPLIT_PANE",
            pane: state.splitPane === "thread" ? null : "thread",
          })
        }
        onRefresh={handleRefresh}
        onAbort={handleAbort}
        isRunning={agentState === "running"}
        agent={agent}
        lastRunError={status?.lastRun?.error}
        onOpenDetail={() => setDetailSheetOpen(true)}
        relayOn={relayOn}
        relayAvailable={relayAvailable}
        onToggleRelay={handleToggleRelay}
      />

      <AgentDetailSheet
        agent={agent ?? null}
        open={detailSheetOpen}
        onOpenChange={setDetailSheetOpen}
      />

      {/* Scheduled envelopes */}
      {pendingEnvelopes.length > 0 && (
        <ScheduledEnvelopes envelopes={pendingEnvelopes} />
      )}

      {/* Message area */}
      <MessageList
        envelopes={envelopes}
        currentAgent={selection.agentName}
        onReply={handleReply}
      />

      {/* Inline log preview when agent is running */}
      {agentState === "running" && state.agentLogLines[selection.agentName] && (
        <div className="border-t border-amber-pulse/20 bg-amber-pulse/5 px-4 py-2">
          <p className="chat-content-shell truncate font-mono text-[11px] text-amber-pulse/80">
            <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-amber-pulse pulse-amber" />
            {state.agentLogLines[selection.agentName]}
          </p>
        </div>
      )}

      {/* Reply preview */}
      {replyTo && (
        <ReplyPreview envelope={replyTo} onCancel={() => setReplyTo(null)} />
      )}

      {/* Composer */}
      <MessageComposer
        onSend={(text, attachments) => handleSend(text, attachments)}
        onScheduleSend={handleScheduleSend}
        placeholder={
          interruptMode
            ? `Urgent message to ${selection.agentName}...`
            : `Message ${selection.agentName}...`
        }
        draft={state.drafts[envelopeKey]}
        onDraftChange={(text) =>
          dispatch({ type: "SET_DRAFT", key: envelopeKey, text })
        }
      />
    </div>
  );
}
