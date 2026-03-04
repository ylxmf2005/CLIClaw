"use client";

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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Provider, PermissionLevel } from "@/lib/types";
import { HelpCircle, Save, X } from "lucide-react";
import { PERMISSION_DESCRIPTIONS } from "./permission-descriptions";

export interface AgentEditFormProps {
  editDescription: string;
  setEditDescription: (v: string) => void;
  editProvider: Provider;
  setEditProvider: (v: Provider) => void;
  editRelayMode: "default-on" | "default-off";
  setEditRelayMode: (v: "default-on" | "default-off") => void;
  editPermission: PermissionLevel;
  setEditPermission: (v: PermissionLevel) => void;
  editDailyResetAt: string;
  setEditDailyResetAt: (v: string) => void;
  editIdleTimeout: string;
  setEditIdleTimeout: (v: string) => void;
  editMaxContext: string;
  setEditMaxContext: (v: string) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}

export function AgentEditForm({
  editDescription,
  setEditDescription,
  editProvider,
  setEditProvider,
  editRelayMode,
  setEditRelayMode,
  editPermission,
  setEditPermission,
  editDailyResetAt,
  setEditDailyResetAt,
  editIdleTimeout,
  setEditIdleTimeout,
  editMaxContext,
  setEditMaxContext,
  saving,
  onSave,
  onCancel,
}: AgentEditFormProps) {
  return (
    <div className="space-y-4 px-4 pb-4">
      <FieldGroup label="Description">
        <Textarea
          value={editDescription}
          onChange={(e) => setEditDescription(e.target.value)}
          rows={2}
          className="border-border bg-input resize-none"
        />
      </FieldGroup>

      <div className="grid grid-cols-2 gap-3">
        <FieldGroup label="Provider">
          <Select
            value={editProvider}
            onValueChange={(v) => setEditProvider(v as Provider)}
          >
            <SelectTrigger className="border-border bg-input">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-border bg-popover">
              <SelectItem value="claude">Claude</SelectItem>
              <SelectItem value="codex">Codex</SelectItem>
            </SelectContent>
          </Select>
        </FieldGroup>

        <FieldGroup label="Relay Mode">
          <Select
            value={editRelayMode}
            onValueChange={(v) =>
              setEditRelayMode(v as "default-on" | "default-off")
            }
          >
            <SelectTrigger className="border-border bg-input">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-border bg-popover">
              <SelectItem value="default-off">Default Off</SelectItem>
              <SelectItem value="default-on">Default On</SelectItem>
            </SelectContent>
          </Select>
        </FieldGroup>
      </div>

      <FieldGroup label="Permission Level">
        <Select
          value={editPermission}
          onValueChange={(v) => setEditPermission(v as PermissionLevel)}
        >
          <SelectTrigger className="border-border bg-input">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-border bg-popover">
            {(
              ["restricted", "standard", "privileged", "admin"] as const
            ).map((level) => (
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

      <Section title="Session Policy">
        <div className="space-y-3">
          <FieldGroup label="Daily Reset At">
            <Input
              value={editDailyResetAt}
              onChange={(e) => setEditDailyResetAt(e.target.value)}
              placeholder="e.g. 04:00"
              className="border-border bg-input"
            />
          </FieldGroup>
          <FieldGroup label="Idle Timeout">
            <Input
              value={editIdleTimeout}
              onChange={(e) => setEditIdleTimeout(e.target.value)}
              placeholder="e.g. 30m"
              className="border-border bg-input"
            />
          </FieldGroup>
          <FieldGroup label="Max Context Length">
            <Input
              value={editMaxContext}
              onChange={(e) => setEditMaxContext(e.target.value)}
              placeholder="e.g. 100000"
              type="number"
              className="border-border bg-input"
            />
          </FieldGroup>
        </div>
      </Section>

      <div className="flex justify-end gap-2 pt-2">
        <Button
          variant="ghost"
          onClick={onCancel}
          className="text-muted-foreground"
        >
          <X className="mr-1.5 h-3.5 w-3.5" />
          Cancel
        </Button>
        <Button
          onClick={onSave}
          disabled={saving}
          className="bg-cyan-glow text-primary-foreground hover:bg-cyan-glow/90"
        >
          <Save className="mr-1.5 h-3.5 w-3.5" />
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}

// ─── Shared helpers (also exported for detail view) ──────────

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </h4>
      {children}
    </div>
  );
}

export function FieldGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

export function InfoRow({
  label,
  value,
  mono,
  truncate,
}: {
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span
        className={`font-medium text-foreground ${mono ? "font-mono text-[11px]" : ""} ${truncate ? "truncate" : ""}`}
        title={truncate ? value : undefined}
      >
        {value}
      </span>
    </div>
  );
}
