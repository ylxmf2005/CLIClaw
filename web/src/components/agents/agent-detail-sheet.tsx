"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DetailSection } from "@/components/ui/detail-section";
import { InfoRow } from "@/components/ui/info-row";
import { FieldGroup } from "@/components/ui/field-group";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Avatar } from "@/components/shared/avatar";
import { useToast } from "@/providers/toast-provider";
import { useAppState } from "@/providers/app-state-provider";
import { updateAgent, deleteAgent, abortAgent, refreshAgent } from "@/lib/api";
import type { AgentState } from "@/components/shared/status-indicator";
import type {
  Agent,
  Provider,
  PermissionLevel,
  ReasoningEffort,
} from "@/lib/types";
import {
  Save,
  Trash2,
  RotateCcw,
  StopCircle,
  Link2,
  Unlink,
  Clock,
  AlertCircle,
  HelpCircle,
  Plus,
} from "lucide-react";
import { PERMISSION_DESCRIPTIONS } from "./permission-descriptions";

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

const STATUS_COLORS: Record<string, string> = {
  running: "bg-amber-pulse/15 text-amber-pulse border-amber-pulse/30",
  idle: "bg-emerald-signal/15 text-emerald-signal border-emerald-signal/30",
  error: "bg-rose-alert/15 text-rose-alert border-rose-alert/30",
  unknown: "bg-muted-foreground/15 text-muted-foreground border-muted-foreground/30",
};

const STATUS_LABELS: Record<string, string> = {
  running: "Running",
  idle: "Idle",
  error: "Error",
  unknown: "Offline",
};

export function AgentDetailSheet({
  agent,
  open,
  onOpenChange,
}: AgentDetailSheetProps) {
  const { state, refreshAgents, dispatch } = useAppState();
  const { toast } = useToast();

  // Form state
  const [description, setDescription] = useState("");
  const [provider, setProvider] = useState<Provider>("claude");
  const [model, setModel] = useState("");
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>("medium");
  const [workspace, setWorkspace] = useState("");
  const [permissionLevel, setPermissionLevel] = useState<PermissionLevel>("standard");
  const [relayMode, setRelayMode] = useState<"default-on" | "default-off">("default-off");
  const [dailyResetAt, setDailyResetAt] = useState("");
  const [idleTimeout, setIdleTimeout] = useState("");
  const [maxContextLength, setMaxContextLength] = useState("");

  // Action state
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Binding form
  const [showBindForm, setShowBindForm] = useState(false);
  const [bindAdapterType, setBindAdapterType] = useState("telegram");
  const [bindAdapterToken, setBindAdapterToken] = useState("");
  const [bindLoading, setBindLoading] = useState(false);

  const initForm = useCallback((a: Agent) => {
    setDescription(a.description || "");
    setProvider(a.provider);
    setModel(a.model || "");
    setReasoningEffort(a.reasoningEffort || "medium");
    setWorkspace(a.workspace || "");
    setPermissionLevel(a.permissionLevel);
    setRelayMode(a.relayMode || "default-off");
    setDailyResetAt(a.sessionPolicy?.dailyResetAt || "");
    setIdleTimeout(a.sessionPolicy?.idleTimeout || "");
    setMaxContextLength(a.sessionPolicy?.maxContextLength?.toString() || "");
  }, []);

  useEffect(() => {
    if (agent && open) {
      initForm(agent);
      setShowBindForm(false);
    }
  }, [agent, open, initForm]);

  if (!agent) return null;

  const status = state.agentStatuses[agent.name];
  const agentState: AgentState = status
    ? status.agentHealth === "error"
      ? "error"
      : status.agentState === "running"
        ? "running"
        : "idle"
    : "unknown";

  // Dirty check
  const isDirty =
    description !== (agent.description || "") ||
    provider !== agent.provider ||
    model !== (agent.model || "") ||
    reasoningEffort !== (agent.reasoningEffort || "medium") ||
    workspace !== (agent.workspace || "") ||
    permissionLevel !== agent.permissionLevel ||
    relayMode !== (agent.relayMode || "default-off") ||
    dailyResetAt !== (agent.sessionPolicy?.dailyResetAt || "") ||
    idleTimeout !== (agent.sessionPolicy?.idleTimeout || "") ||
    maxContextLength !== (agent.sessionPolicy?.maxContextLength?.toString() || "");

  const handleSave = async () => {
    setSaving(true);
    try {
      const sessionPolicy =
        dailyResetAt || idleTimeout || maxContextLength
          ? {
              dailyResetAt: dailyResetAt || undefined,
              idleTimeout: idleTimeout || undefined,
              maxContextLength: maxContextLength
                ? parseInt(maxContextLength, 10)
                : undefined,
            }
          : null;

      await updateAgent(agent.name, {
        description: description.trim() || null,
        provider,
        model: model.trim() || null,
        reasoningEffort,
        workspace: workspace.trim() || null,
        permissionLevel,
        relayMode,
        sessionPolicy,
      });
      toast({ description: `Agent ${agent.name} updated`, variant: "success" });
      await refreshAgents();
    } catch (err) {
      toast({
        description: err instanceof Error ? err.message : "Failed to update",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAbort = async () => {
    try {
      const result = await abortAgent(agent.name);
      toast({
        description: result.cancelledRun
          ? `Aborted ${agent.name}'s run`
          : `Cleared ${result.clearedPendingCount} pending`,
        variant: "success",
      });
      await refreshAgents();
    } catch (err) {
      toast({
        description: err instanceof Error ? err.message : "Abort failed",
        variant: "error",
      });
    }
  };

  const handleRefresh = async () => {
    try {
      await refreshAgent(agent.name);
      toast({ description: `Session refresh requested`, variant: "success" });
    } catch (err) {
      toast({
        description: err instanceof Error ? err.message : "Refresh failed",
        variant: "error",
      });
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
        description: err instanceof Error ? err.message : "Delete failed",
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
      toast({ description: `${bindAdapterType} binding added`, variant: "success" });
      setBindAdapterToken("");
      setShowBindForm(false);
      await refreshAgents();
    } catch (err) {
      toast({
        description: err instanceof Error ? err.message : "Failed to add binding",
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
      toast({ description: `${adapterType} binding removed`, variant: "success" });
      await refreshAgents();
    } catch (err) {
      toast({
        description: err instanceof Error ? err.message : "Failed to remove binding",
        variant: "error",
      });
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="flex flex-col gap-0 overflow-hidden border-border bg-card p-0 sm:max-w-[420px]"
        >
          {/* ─── Sticky Header ──────────────────────────── */}
          <div className="shrink-0 border-b border-border px-5 pb-4 pt-5">
            <SheetHeader className="mb-3">
              <div className="flex items-center gap-3">
                <Avatar name={agent.name} size="md" status={agentState} />
                <div className="min-w-0 flex-1">
                  <SheetTitle className="text-base leading-tight">{agent.name}</SheetTitle>
                  <SheetDescription className="flex items-center gap-1.5 pt-1">
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[agentState]}`}>
                      {STATUS_LABELS[agentState]}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 uppercase">
                      {agent.provider}
                    </Badge>
                    {agent.model && (
                      <span className="truncate text-[10px] font-mono text-muted-foreground">
                        {agent.model}
                      </span>
                    )}
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            {/* Action bar */}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || !isDirty}
                className="h-8 bg-cyan-glow text-primary-foreground hover:bg-cyan-glow/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-50"
              >
                <Save className="mr-1.5 h-3 w-3" />
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRefresh}
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="mr-1.5 h-3 w-3" />
                Refresh
              </Button>
              {agentState === "running" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAbort}
                  className="h-8 text-xs text-amber-pulse border-amber-pulse/30 hover:bg-amber-pulse/10"
                >
                  <StopCircle className="mr-1.5 h-3 w-3" />
                  Abort
                </Button>
              )}
              <div className="flex-1" />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setDeleteOpen(true)}
                className="h-8 w-8 text-muted-foreground/50 hover:text-rose-alert"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* ─── Scrollable Content ─────────────────────── */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

            {/* Configuration */}
            <DetailSection title="Configuration">
              <FieldGroup label="Description">
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="What does this agent do?"
                  className="border-border bg-input resize-none text-sm"
                />
              </FieldGroup>

              <div className="grid grid-cols-2 gap-3">
                <FieldGroup label="Provider">
                  <Select value={provider} onValueChange={(v) => setProvider(v as Provider)}>
                    <SelectTrigger className="w-full border-border bg-input">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-border bg-popover">
                      <SelectItem value="claude">Claude</SelectItem>
                      <SelectItem value="codex">Codex</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldGroup>

                <FieldGroup label="Reasoning">
                  <Select
                    value={reasoningEffort}
                    onValueChange={(v) => setReasoningEffort(v as ReasoningEffort)}
                  >
                    <SelectTrigger className="w-full border-border bg-input">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-border bg-popover">
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="xhigh">X-High</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldGroup>
              </div>

              <FieldGroup label="Model Override">
                <Input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="Default (provider decides)"
                  className="border-border bg-input font-mono text-sm"
                />
              </FieldGroup>

              <FieldGroup label="Workspace">
                <Input
                  value={workspace}
                  onChange={(e) => setWorkspace(e.target.value)}
                  placeholder="/path/to/project"
                  className="border-border bg-input font-mono text-sm"
                />
              </FieldGroup>

              <div className="grid grid-cols-2 gap-3">
                <FieldGroup label="Permission">
                  <Select
                    value={permissionLevel}
                    onValueChange={(v) => setPermissionLevel(v as PermissionLevel)}
                  >
                    <SelectTrigger className="w-full border-border bg-input">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-border bg-popover">
                      {(["restricted", "standard", "privileged", "admin"] as const).map((level) => (
                        <SelectItem key={level} value={level}>
                          <div className="flex items-center gap-2">
                            <span className="capitalize">{level}</span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-3 w-3 text-muted-foreground" />
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-48">
                                {PERMISSION_DESCRIPTIONS[level]}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldGroup>

                <FieldGroup label="Relay Mode">
                  <Select
                    value={relayMode}
                    onValueChange={(v) => setRelayMode(v as "default-on" | "default-off")}
                  >
                    <SelectTrigger className="w-full border-border bg-input">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-border bg-popover">
                      <SelectItem value="default-off">Default Off</SelectItem>
                      <SelectItem value="default-on">Default On</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldGroup>
              </div>
            </DetailSection>

            {/* Session Policy */}
            <DetailSection title="Session Policy">
              <FieldGroup label="Daily Reset">
                <Input
                  value={dailyResetAt}
                  onChange={(e) => setDailyResetAt(e.target.value)}
                  placeholder="e.g. 04:00"
                  className="border-border bg-input text-sm"
                />
              </FieldGroup>
              <div className="grid grid-cols-2 gap-3">
                <FieldGroup label="Idle Timeout">
                  <Input
                    value={idleTimeout}
                    onChange={(e) => setIdleTimeout(e.target.value)}
                    placeholder="e.g. 30m"
                    className="border-border bg-input text-sm"
                  />
                </FieldGroup>
                <FieldGroup label="Max Context">
                  <Input
                    value={maxContextLength}
                    onChange={(e) => setMaxContextLength(e.target.value)}
                    placeholder="e.g. 100000"
                    type="number"
                    className="border-border bg-input text-sm"
                  />
                </FieldGroup>
              </div>
            </DetailSection>

            {/* Run Status (read-only) */}
            <DetailSection title="Run Status">
              {agentState === "running" && status?.currentRun ? (
                <div className="flex items-center gap-2 rounded-md bg-amber-pulse/10 px-3 py-2.5">
                  <Clock className="h-3.5 w-3.5 text-amber-pulse" />
                  <span className="text-xs font-medium text-amber-pulse">
                    Running for {formatElapsed(status.currentRun.startedAt)}
                  </span>
                </div>
              ) : status?.lastRun ? (
                <div className="space-y-2">
                  <InfoRow
                    label="Last Run"
                    value={
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 ${
                          status.lastRun.status === "completed"
                            ? "bg-emerald-signal/15 text-emerald-signal border-emerald-signal/30"
                            : status.lastRun.status === "failed"
                              ? "bg-rose-alert/15 text-rose-alert border-rose-alert/30"
                              : status.lastRun.status === "cancelled"
                                ? "bg-amber-pulse/15 text-amber-pulse border-amber-pulse/30"
                                : "bg-muted-foreground/15 text-muted-foreground border-muted-foreground/30"
                        }`}
                      >
                        {status.lastRun.status}
                      </Badge>
                    }
                  />
                  {status.lastRun.error && (
                    <div className="flex items-start gap-2 rounded-md bg-rose-alert/8 border border-rose-alert/15 px-3 py-2 text-[11px] text-rose-alert">
                      <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                      <span className="break-words leading-relaxed">{status.lastRun.error}</span>
                    </div>
                  )}
                  {status.lastRun.contextLength != null && (
                    <InfoRow
                      label="Context Length"
                      value={status.lastRun.contextLength.toLocaleString()}
                      mono
                    />
                  )}
                  <InfoRow label="Started" value={formatTimestamp(status.lastRun.startedAt)} />
                  {status.lastRun.completedAt && (
                    <InfoRow label="Completed" value={formatTimestamp(status.lastRun.completedAt)} />
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground py-1">No runs recorded yet</p>
              )}
            </DetailSection>

            {/* Bindings */}
            <DetailSection
              title="Bindings"
              action={
                !showBindForm && (
                  <button
                    onClick={() => setShowBindForm(true)}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-cyan-glow"
                  >
                    <Plus className="h-3 w-3" />
                    Add
                  </button>
                )
              }
            >
              {agent.bindings.length > 0 ? (
                <div className="space-y-1.5">
                  {agent.bindings.map((b) => (
                    <div
                      key={b}
                      className="flex items-center justify-between rounded-md bg-accent/40 px-3 py-2"
                    >
                      <span className="text-xs font-mono text-foreground">{b}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-rose-alert"
                        onClick={() => handleRemoveBinding(b)}
                      >
                        <Unlink className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : !showBindForm ? (
                <p className="text-xs text-muted-foreground py-1">No adapter bindings</p>
              ) : null}

              {showBindForm && (
                <div className="space-y-2 pt-1 border-t border-border">
                  <div className="grid grid-cols-[100px_1fr] gap-2 pt-2">
                    <FieldGroup label="Type">
                      <Select value={bindAdapterType} onValueChange={setBindAdapterType}>
                        <SelectTrigger className="h-8 w-full border-border bg-input text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="border-border bg-popover">
                          <SelectItem value="telegram">Telegram</SelectItem>
                        </SelectContent>
                      </Select>
                    </FieldGroup>
                    <FieldGroup label="Bot Token">
                      <Input
                        value={bindAdapterToken}
                        onChange={(e) => setBindAdapterToken(e.target.value)}
                        placeholder="Paste bot token..."
                        className="h-8 border-border bg-input text-xs"
                      />
                    </FieldGroup>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={() => { setShowBindForm(false); setBindAdapterToken(""); }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 text-xs bg-cyan-glow text-primary-foreground hover:bg-cyan-glow/90"
                      onClick={handleAddBinding}
                      disabled={bindLoading || !bindAdapterToken.trim()}
                    >
                      <Link2 className="mr-1 h-3 w-3" />
                      {bindLoading ? "Adding..." : "Add Binding"}
                    </Button>
                  </div>
                </div>
              )}
            </DetailSection>

            {/* Footer info */}
            {agent.lastSeenAt && (
              <p className="text-[10px] text-muted-foreground/50 text-center pb-2">
                Last seen {formatTimestamp(agent.lastSeenAt)}
              </p>
            )}
          </div>
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
