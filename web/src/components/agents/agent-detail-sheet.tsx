"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useToast } from "@/providers/toast-provider";
import { useAppState } from "@/providers/app-state-provider";
import { updateAgent, deleteAgent } from "@/lib/api";
import { getAvatarColor, getInitials } from "@/lib/colors";
import {
  StatusIndicator,
  type AgentState,
} from "@/components/shared/status-indicator";
import type {
  Agent,
  AgentStatus,
  Provider,
  PermissionLevel,
} from "@/lib/types";
import {
  Pencil,
  Trash2,
  Link2,
  Unlink,
  Clock,
  AlertCircle,
} from "lucide-react";
import { AgentEditForm } from "./agent-edit-form";
import { Section, InfoRow } from "./agent-edit-form";

interface AgentDetailSheetProps {
  agent: Agent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatElapsed(startedAt: number): string {
  const elapsed = Math.floor((Date.now() - startedAt) / 1000);
  if (elapsed < 60) return `${elapsed}s`;
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AgentDetailSheet({
  agent,
  open,
  onOpenChange,
}: AgentDetailSheetProps) {
  const { state, refreshAgents, dispatch } = useAppState();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [editDescription, setEditDescription] = useState("");
  const [editProvider, setEditProvider] = useState<Provider>("claude");
  const [editRelayMode, setEditRelayMode] = useState<
    "default-on" | "default-off"
  >("default-off");
  const [editPermission, setEditPermission] =
    useState<PermissionLevel>("standard");
  const [editDailyResetAt, setEditDailyResetAt] = useState("");
  const [editIdleTimeout, setEditIdleTimeout] = useState("");
  const [editMaxContext, setEditMaxContext] = useState("");

  // Binding form
  const [bindAdapterType, setBindAdapterType] = useState("telegram");
  const [bindAdapterToken, setBindAdapterToken] = useState("");
  const [bindLoading, setBindLoading] = useState(false);

  if (!agent) return null;

  const status = state.agentStatuses[agent.name];
  const agentState: AgentState = status
    ? status.agentHealth === "error"
      ? "error"
      : status.agentState === "running"
        ? "running"
        : "idle"
    : "unknown";

  const startEdit = () => {
    setEditDescription(agent.description || "");
    setEditProvider(agent.provider);
    setEditRelayMode(agent.relayMode || "default-off");
    setEditPermission(agent.permissionLevel);
    setEditDailyResetAt(agent.sessionPolicy?.dailyResetAt || "");
    setEditIdleTimeout(agent.sessionPolicy?.idleTimeout || "");
    setEditMaxContext(
      agent.sessionPolicy?.maxContextLength?.toString() || ""
    );
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const sessionPolicy =
        editDailyResetAt || editIdleTimeout || editMaxContext
          ? {
              dailyResetAt: editDailyResetAt || undefined,
              idleTimeout: editIdleTimeout || undefined,
              maxContextLength: editMaxContext
                ? parseInt(editMaxContext, 10)
                : undefined,
            }
          : null;

      await updateAgent(agent.name, {
        description: editDescription || null,
        provider: editProvider,
        permissionLevel: editPermission,
        sessionPolicy,
        metadata: { relayMode: editRelayMode },
      });
      toast({ description: `Agent ${agent.name} updated`, variant: "success" });
      setEditing(false);
      await refreshAgents();
    } catch (err) {
      toast({
        description:
          err instanceof Error ? err.message : "Failed to update agent",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await deleteAgent(agent.name);
      toast({ description: `Agent ${agent.name} deleted`, variant: "success" });
      setDeleteOpen(false);
      onOpenChange(false);
      dispatch({ type: "REMOVE_AGENT", name: agent.name });
      dispatch({ type: "SELECT_CHAT", selection: null });
    } catch (err) {
      toast({
        description:
          err instanceof Error ? err.message : "Failed to delete agent",
        variant: "error",
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleAddBinding = async () => {
    if (!bindAdapterToken.trim()) return;
    setBindLoading(true);
    try {
      await updateAgent(agent.name, {
        bindAdapterType,
        bindAdapterToken: bindAdapterToken.trim(),
      });
      toast({ description: `Binding ${bindAdapterType} added`, variant: "success" });
      setBindAdapterToken("");
      await refreshAgents();
    } catch (err) {
      toast({
        description:
          err instanceof Error ? err.message : "Failed to add binding",
        variant: "error",
      });
    } finally {
      setBindLoading(false);
    }
  };

  const handleRemoveBinding = async (binding: string) => {
    try {
      const adapterType = binding.split(":")[0];
      await updateAgent(agent.name, { unbindAdapterType: adapterType });
      toast({ description: `Binding ${adapterType} removed`, variant: "success" });
      await refreshAgents();
    } catch (err) {
      toast({
        description:
          err instanceof Error ? err.message : "Failed to remove binding",
        variant: "error",
      });
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="overflow-y-auto border-border bg-card sm:max-w-md"
        >
          <SheetHeader>
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br text-sm font-bold text-white ${getAvatarColor(agent.name)}`}
              >
                {getInitials(agent.name)}
              </div>
              <div className="flex-1">
                <SheetTitle className="text-base">{agent.name}</SheetTitle>
                <SheetDescription className="flex items-center gap-2">
                  <StatusIndicator state={agentState} size="sm" showLabel />
                </SheetDescription>
              </div>
              {!editing && (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={startEdit}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-rose-alert"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </SheetHeader>

          {editing ? (
            <AgentEditForm
              editDescription={editDescription}
              setEditDescription={setEditDescription}
              editProvider={editProvider}
              setEditProvider={setEditProvider}
              editRelayMode={editRelayMode}
              setEditRelayMode={setEditRelayMode}
              editPermission={editPermission}
              setEditPermission={setEditPermission}
              editDailyResetAt={editDailyResetAt}
              setEditDailyResetAt={setEditDailyResetAt}
              editIdleTimeout={editIdleTimeout}
              setEditIdleTimeout={setEditIdleTimeout}
              editMaxContext={editMaxContext}
              setEditMaxContext={setEditMaxContext}
              saving={saving}
              onSave={handleSave}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <DetailView
              agent={agent}
              status={status}
              agentState={agentState}
              bindings={agent.bindings}
              bindAdapterType={bindAdapterType}
              setBindAdapterType={setBindAdapterType}
              bindAdapterToken={bindAdapterToken}
              setBindAdapterToken={setBindAdapterToken}
              bindLoading={bindLoading}
              onAddBinding={handleAddBinding}
              onRemoveBinding={handleRemoveBinding}
            />
          )}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Agent"
        description={`Are you sure you want to delete "${agent.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleteLoading}
      />
    </>
  );
}

// ─── Detail View (read-only) ─────────────────────────────────

interface DetailViewProps {
  agent: Agent;
  status: AgentStatus["status"] | undefined;
  agentState: AgentState;
  bindings: string[];
  bindAdapterType: string;
  setBindAdapterType: (v: string) => void;
  bindAdapterToken: string;
  setBindAdapterToken: (v: string) => void;
  bindLoading: boolean;
  onAddBinding: () => void;
  onRemoveBinding: (binding: string) => void;
}

function DetailView({
  agent,
  status,
  agentState,
  bindings,
  bindAdapterType,
  setBindAdapterType,
  bindAdapterToken,
  setBindAdapterToken,
  bindLoading,
  onAddBinding,
  onRemoveBinding,
}: DetailViewProps) {
  return (
    <div className="space-y-5 px-4 pb-4">
      <Section title="Info">
        <InfoRow label="Provider" value={agent.provider} />
        {agent.model && <InfoRow label="Model" value={agent.model} mono />}
        {agent.workspace && (
          <InfoRow label="Workspace" value={agent.workspace} mono truncate />
        )}
        <InfoRow label="Permission" value={agent.permissionLevel} />
        <InfoRow label="Relay Mode" value={agent.relayMode || "default-off"} />
        {agent.lastSeenAt && (
          <InfoRow label="Last Seen" value={formatTimestamp(agent.lastSeenAt)} />
        )}
      </Section>

      {agent.sessionPolicy && (
        <Section title="Session Policy">
          {agent.sessionPolicy.dailyResetAt && (
            <InfoRow label="Daily Reset" value={agent.sessionPolicy.dailyResetAt} />
          )}
          {agent.sessionPolicy.idleTimeout && (
            <InfoRow label="Idle Timeout" value={agent.sessionPolicy.idleTimeout} />
          )}
          {agent.sessionPolicy.maxContextLength && (
            <InfoRow
              label="Max Context"
              value={agent.sessionPolicy.maxContextLength.toLocaleString()}
            />
          )}
        </Section>
      )}

      <Section title="Run Status">
        {agentState === "running" && status?.currentRun && (
          <div className="flex items-center gap-2 rounded-md bg-amber-pulse/10 px-3 py-2 text-sm">
            <Clock className="h-3.5 w-3.5 text-amber-pulse" />
            <span className="text-amber-pulse">
              Running for {formatElapsed(status.currentRun.startedAt)}
            </span>
          </div>
        )}
        {status?.lastRun && (
          <div className="space-y-1.5">
            <InfoRow label="Status" value={status.lastRun.status} />
            {status.lastRun.error && (
              <div className="flex items-start gap-2 rounded-md bg-rose-alert/10 px-3 py-2 text-xs text-rose-alert">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="break-words">{status.lastRun.error}</span>
              </div>
            )}
            {status.lastRun.contextLength != null && (
              <InfoRow
                label="Context"
                value={status.lastRun.contextLength.toLocaleString()}
              />
            )}
            <InfoRow label="Started" value={formatTimestamp(status.lastRun.startedAt)} />
            {status.lastRun.completedAt && (
              <InfoRow label="Completed" value={formatTimestamp(status.lastRun.completedAt)} />
            )}
          </div>
        )}
        {!status?.lastRun && !status?.currentRun && (
          <p className="text-xs text-muted-foreground">No runs yet</p>
        )}
      </Section>

      <Section title="Bindings">
        {bindings.length > 0 ? (
          <div className="space-y-1.5">
            {bindings.map((b) => (
              <div
                key={b}
                className="flex items-center justify-between rounded-md bg-accent/50 px-3 py-1.5 text-xs"
              >
                <span className="font-mono text-foreground">{b}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-rose-alert"
                  onClick={() => onRemoveBinding(b)}
                >
                  <Unlink className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No bindings</p>
        )}
        <div className="mt-2 flex items-center gap-2">
          <Select value={bindAdapterType} onValueChange={setBindAdapterType}>
            <SelectTrigger className="h-8 w-28 border-border bg-input text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-border bg-popover">
              <SelectItem value="telegram">Telegram</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={bindAdapterToken}
            onChange={(e) => setBindAdapterToken(e.target.value)}
            placeholder="Bot token"
            className="h-8 flex-1 border-border bg-input text-xs"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-cyan-glow"
            onClick={onAddBinding}
            disabled={bindLoading || !bindAdapterToken.trim()}
          >
            <Link2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </Section>
    </div>
  );
}
