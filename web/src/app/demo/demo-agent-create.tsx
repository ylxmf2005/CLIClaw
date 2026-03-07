"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { Provider, PermissionLevel } from "@/lib/types";

interface DemoAgentCreateProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (agent: {
    name: string;
    description: string;
    provider: Provider;
    workspace: string;
    permissionLevel: PermissionLevel;
  }) => void;
}

export function DemoAgentCreate({ open, onOpenChange, onCreate }: DemoAgentCreateProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [provider, setProvider] = useState<Provider>("claude");
  const [workspace, setWorkspace] = useState("");
  const [permission, setPermission] = useState<PermissionLevel>("standard");

  const canSubmit = name.trim().length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onCreate({
      name: name.trim(),
      description: description.trim(),
      provider,
      workspace: workspace.trim() || "/home/projects",
      permissionLevel: permission,
    });
    // Reset form
    setName("");
    setDescription("");
    setProvider("claude");
    setWorkspace("");
    setPermission("standard");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Create Agent</DialogTitle>
          <DialogDescription>Add a new agent to CLIClaw (demo).</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="agent-name" className="text-xs font-medium text-muted-foreground">
              Name
            </label>
            <input
              id="agent-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-agent"
              autoFocus
              className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-cyan-glow/50 focus:ring-1 focus:ring-cyan-glow/30"
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="agent-desc" className="text-xs font-medium text-muted-foreground">
              Description
            </label>
            <input
              id="agent-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this agent do?"
              className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-cyan-glow/50 focus:ring-1 focus:ring-cyan-glow/30"
            />
          </div>

          {/* Provider */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="agent-provider" className="text-xs font-medium text-muted-foreground">
              Provider
            </label>
            <select
              id="agent-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value as Provider)}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-cyan-glow/50 focus:ring-1 focus:ring-cyan-glow/30"
            >
              <option value="claude">Claude</option>
              <option value="codex">Codex</option>
            </select>
          </div>

          {/* Workspace */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="agent-workspace" className="text-xs font-medium text-muted-foreground">
              Workspace Path
            </label>
            <input
              id="agent-workspace"
              type="text"
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
              placeholder="/home/projects"
              className="h-9 rounded-md border border-border bg-background px-3 font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-cyan-glow/50 focus:ring-1 focus:ring-cyan-glow/30"
            />
          </div>

          {/* Permission */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="agent-permission" className="text-xs font-medium text-muted-foreground">
              Permission Level
            </label>
            <select
              id="agent-permission"
              value={permission}
              onChange={(e) => setPermission(e.target.value as PermissionLevel)}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-cyan-glow/50 focus:ring-1 focus:ring-cyan-glow/30"
            >
              <option value="restricted">Restricted</option>
              <option value="standard">Standard</option>
              <option value="privileged">Privileged</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-9 rounded-md px-4 text-sm text-muted-foreground transition-colors hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="h-9 rounded-md bg-cyan-glow px-4 text-sm font-medium text-primary-foreground shadow-[0_0_12px_rgba(0,212,255,0.3)] transition-all hover:opacity-90 disabled:opacity-40"
            >
              Create
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
