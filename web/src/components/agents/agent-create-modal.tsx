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
import { registerAgent } from "@/lib/api";
import type { Provider, PermissionLevel, ReasoningEffort } from "@/lib/types";
import { AlertCircle, Sparkles } from "lucide-react";

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
      const result = await registerAgent({
        name: name.trim(),
        description: description.trim() || undefined,
        workspace: workspace.trim() || undefined,
        provider,
        model: model.trim() || undefined,
        reasoningEffort,
        permissionLevel,
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
      <DialogContent className="border-white/[0.06] bg-[#0d1224] sm:max-w-lg">
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
              <Button onClick={handleClose} className="bg-cyan-glow text-black hover:bg-cyan-glow/90">
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
              <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Name *
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. nex"
                className="border-white/[0.06] bg-white/[0.03]"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Description
              </label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="AI assistant for code review"
                rows={2}
                className="border-white/[0.06] bg-white/[0.03] resize-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Workspace
              </label>
              <Input
                value={workspace}
                onChange={(e) => setWorkspace(e.target.value)}
                placeholder="/path/to/project"
                className="border-white/[0.06] bg-white/[0.03] font-mono text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Provider
                </label>
                <Select value={provider} onValueChange={(v) => setProvider(v as Provider)}>
                  <SelectTrigger className="border-white/[0.06] bg-white/[0.03]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-white/[0.06] bg-[#0d1224]">
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
                  <SelectTrigger className="border-white/[0.06] bg-white/[0.03]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-white/[0.06] bg-[#0d1224]">
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
                  className="border-white/[0.06] bg-white/[0.03]"
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
                  <SelectTrigger className="border-white/[0.06] bg-white/[0.03]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-white/[0.06] bg-[#0d1224]">
                    <SelectItem value="restricted">Restricted</SelectItem>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="privileged">Privileged</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
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
                className="bg-cyan-glow text-black hover:bg-cyan-glow/90 disabled:opacity-50"
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
