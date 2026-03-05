"use client";

import { useState } from "react";
import { useAppState } from "@/providers/app-state-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { registerAgent } from "@/lib/api";
import type { Provider, PermissionLevel, ReasoningEffort } from "@/lib/types";
import { AlertCircle, HelpCircle, Sparkles } from "lucide-react";
import { PERMISSION_DESCRIPTIONS } from "./permission-descriptions";

interface AgentCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AgentCreateModal({ open, onOpenChange }: AgentCreateModalProps) {
  const { refreshAgents } = useAppState();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [provider, setProvider] = useState<Provider>("claude");
  const [model, setModel] = useState("");
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>("medium");
  const [permissionLevel, setPermissionLevel] = useState<PermissionLevel>("standard");
  const [dailyResetAt, setDailyResetAt] = useState("");
  const [idleTimeout, setIdleTimeout] = useState("");
  const [maxContextLength, setMaxContextLength] = useState("");
  const [bindAdapterType, setBindAdapterType] = useState("");
  const [bindAdapterToken, setBindAdapterToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setDescription("");
    setWorkspace("");
    setProvider("claude");
    setModel("");
    setReasoningEffort("medium");
    setPermissionLevel("standard");
    setDailyResetAt("");
    setIdleTimeout("");
    setMaxContextLength("");
    setBindAdapterType("");
    setBindAdapterToken("");
    setError(null);
    setCreatedToken(null);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Agent name is required");
      return;
    }
    setLoading(true);
    setError(null);
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
          : undefined;
      const result = await registerAgent({
        name: name.trim(),
        description: description.trim() || undefined,
        workspace: workspace.trim() || undefined,
        provider,
        model: model.trim() || undefined,
        reasoningEffort,
        permissionLevel,
        sessionPolicy,
        bindAdapterType: bindAdapterType || undefined,
        bindAdapterToken: bindAdapterToken.trim() || undefined,
      });
      setCreatedToken(result.token);
      await refreshAgents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="border-border bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-lg">
            <Sparkles className="h-5 w-5 text-cyan-glow" />
            Register Agent
          </DialogTitle>
        </DialogHeader>

        {createdToken ? (
          <div className="space-y-4 py-4">
            <p className="text-sm text-emerald-signal">
              Agent <strong>{name}</strong> registered successfully.
            </p>
            <div className="space-y-2">
              <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Agent Token (shown once)
              </label>
              <div className="rounded-md border border-amber-pulse/20 bg-amber-pulse/5 p-3 font-mono text-sm text-amber-pulse break-all select-all">
                {createdToken}
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleClose} className="bg-cyan-glow text-primary-foreground hover:bg-cyan-glow/90">
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 rounded-md bg-rose-alert/10 px-3 py-2 text-sm text-rose-alert">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="agent-name" className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Name *
              </label>
              <Input
                id="agent-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. nex"
                className="border-border bg-input"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="agent-description" className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Description
              </label>
              <Textarea
                id="agent-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="AI assistant for code review"
                rows={2}
                className="border-border bg-input resize-none"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="agent-workspace" className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Workspace
              </label>
              <Input
                id="agent-workspace"
                value={workspace}
                onChange={(e) => setWorkspace(e.target.value)}
                placeholder="/path/to/project"
                className="border-border bg-input font-mono text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Provider
                </label>
                <Select value={provider} onValueChange={(v) => setProvider(v as Provider)}>
                  <SelectTrigger className="border-border bg-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-popover">
                    <SelectItem value="claude">Claude</SelectItem>
                    <SelectItem value="codex">Codex</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Reasoning
                </label>
                <Select
                  value={reasoningEffort}
                  onValueChange={(v) => setReasoningEffort(v as ReasoningEffort)}
                >
                  <SelectTrigger className="border-border bg-input">
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
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Model
                </label>
                <Input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="Optional override"
                  className="border-border bg-input"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Permission
                </label>
                <Select
                  value={permissionLevel}
                  onValueChange={(v) => setPermissionLevel(v as PermissionLevel)}
                >
                  <SelectTrigger className="border-border bg-input">
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
              </div>
            </div>

            {/* Session Policy */}
            <div className="space-y-2">
              <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Session Policy
              </label>
              <div className="grid grid-cols-3 gap-2">
                <Input
                  value={dailyResetAt}
                  onChange={(e) => setDailyResetAt(e.target.value)}
                  placeholder="Reset (04:00)"
                  className="border-border bg-input text-xs"
                  title="Daily reset time (HH:MM)"
                />
                <Input
                  value={idleTimeout}
                  onChange={(e) => setIdleTimeout(e.target.value)}
                  placeholder="Idle (30m)"
                  className="border-border bg-input text-xs"
                  title="Idle timeout duration"
                />
                <Input
                  value={maxContextLength}
                  onChange={(e) => setMaxContextLength(e.target.value)}
                  placeholder="Context max"
                  type="number"
                  className="border-border bg-input text-xs"
                  title="Max context length"
                />
              </div>
            </div>

            {/* Adapter Binding */}
            <div className="space-y-2">
              <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Adapter Binding (optional)
              </label>
              <div className="grid grid-cols-3 gap-2">
                <Select value={bindAdapterType} onValueChange={setBindAdapterType}>
                  <SelectTrigger className="border-border bg-input text-xs">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-popover">
                    <SelectItem value="telegram">Telegram</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={bindAdapterToken}
                  onChange={(e) => setBindAdapterToken(e.target.value)}
                  placeholder="Bot token"
                  className="col-span-2 border-border bg-input text-xs"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={handleClose}
                className="text-muted-foreground"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="bg-cyan-glow text-primary-foreground hover:bg-cyan-glow/90 disabled:opacity-50"
              >
                {loading ? "Registering..." : "Register Agent"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
