"use client";

import { useState } from "react";
import { useAppState } from "@/providers/app-state-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  X,
  Plus,
  Clock,
  Trash2,
  Play,
  Pause,
} from "lucide-react";
import {
  createCronSchedule,
  enableCronSchedule,
  disableCronSchedule,
  deleteCronSchedule,
} from "@/lib/api";
import type { CronExecutionMode } from "@/lib/types";

const CRON_PRESETS = [
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Daily at 9am", value: "0 9 * * *" },
  { label: "Weekly Monday 9am", value: "0 9 * * 1" },
  { label: "Custom", value: "" },
];

export function CronPanel() {
  const { state, dispatch, refreshCron } = useAppState();
  const agentName = state.selectedChat?.agentName;
  const chatAddress = state.selectedChat
    ? state.selectedChat.chatId
      ? `agent:${agentName}:${state.selectedChat.chatId}`
      : `agent:${agentName}`
    : "";

  const schedules = state.cronSchedules.filter(
    (s) => s.to === chatAddress || s.agentName === agentName
  );

  const [showCreate, setShowCreate] = useState(false);
  const [cronExpr, setCronExpr] = useState("0 9 * * *");
  const [timezone, setTimezone] = useState("");
  const [messageText, setMessageText] = useState("");
  const [execMode, setExecMode] = useState<CronExecutionMode>("isolated");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!cronExpr.trim() || !chatAddress) return;
    setCreating(true);
    try {
      await createCronSchedule({
        cron: cronExpr.trim(),
        timezone: timezone.trim() || undefined,
        to: chatAddress,
        text: messageText.trim() || undefined,
        executionMode: execMode,
      });
      await refreshCron();
      setShowCreate(false);
      setCronExpr("0 9 * * *");
      setMessageText("");
    } catch {
      // TODO: show error
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      if (enabled) {
        await disableCronSchedule(id);
      } else {
        await enableCronSchedule(id);
      }
      await refreshCron();
    } catch {
      // silent
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCronSchedule(id);
      await refreshCron();
    } catch {
      // silent
    }
  };

  return (
    <div className="flex h-full flex-col border-l border-white/[0.04] bg-[#080c16]">
      {/* Header */}
      <div className="flex h-10 items-center justify-between border-b border-white/[0.04] px-3">
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-lavender-info" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Cron Schedules
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground/40 hover:text-cyan-glow"
            onClick={() => setShowCreate(!showCreate)}
          >
            <Plus className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground/40 hover:text-foreground"
            onClick={() => dispatch({ type: "SET_SPLIT_PANE", pane: null })}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="space-y-3 border-b border-white/[0.04] p-3">
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
              Schedule
            </label>
            <div className="flex flex-wrap gap-1.5">
              {CRON_PRESETS.map((p) => (
                <button
                  key={p.value || "custom"}
                  onClick={() => p.value && setCronExpr(p.value)}
                  className={`rounded-md px-2 py-1 text-[10px] transition-colors ${
                    cronExpr === p.value
                      ? "bg-cyan-glow/15 text-cyan-glow"
                      : "bg-white/[0.03] text-muted-foreground hover:bg-white/[0.06]"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Input
              value={cronExpr}
              onChange={(e) => setCronExpr(e.target.value)}
              placeholder="* * * * *"
              className="h-7 border-white/[0.06] bg-white/[0.03] font-mono text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
              Message
            </label>
            <Input
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Optional message text"
              className="h-7 border-white/[0.06] bg-white/[0.03] text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                Timezone
              </label>
              <Input
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="America/New_York"
                className="h-7 border-white/[0.06] bg-white/[0.03] text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                Execution
              </label>
              <Select value={execMode} onValueChange={(v) => setExecMode(v as CronExecutionMode)}>
                <SelectTrigger className="h-7 border-white/[0.06] bg-white/[0.03] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/[0.06] bg-[#0d1224]">
                  <SelectItem value="isolated">Isolated</SelectItem>
                  <SelectItem value="clone">Clone</SelectItem>
                  <SelectItem value="inline">Inline</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            onClick={handleCreate}
            disabled={creating || !cronExpr.trim()}
            className="h-7 w-full bg-cyan-glow text-black text-xs hover:bg-cyan-glow/90"
          >
            {creating ? "Creating..." : "Create Schedule"}
          </Button>
        </div>
      )}

      {/* Schedule list */}
      <div className="flex-1 overflow-y-auto p-2">
        {schedules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Clock className="mb-3 h-8 w-8 text-muted-foreground/20" />
            <p className="text-xs text-muted-foreground/40">
              No cron schedules for this chat
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 h-7 text-xs text-cyan-glow/70"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="mr-1 h-3 w-3" />
              Add schedule
            </Button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {schedules.map((s) => (
              <div
                key={s.id}
                className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <code className="text-xs font-semibold text-cyan-glow/80">
                    {s.cron}
                  </code>
                  <Switch
                    checked={s.enabled}
                    onCheckedChange={() => handleToggle(s.id, s.enabled)}
                    className="h-4 w-7 data-[state=checked]:bg-emerald-signal"
                  />
                </div>

                {s.content.text && (
                  <p className="mb-2 truncate text-[11px] text-muted-foreground/60">
                    {s.content.text}
                  </p>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground/40">
                    {s.enabled ? (
                      <Play className="h-2.5 w-2.5 text-emerald-signal" />
                    ) : (
                      <Pause className="h-2.5 w-2.5" />
                    )}
                    {s.timezone && <span>{s.timezone}</span>}
                    {s.nextDeliverAt && (
                      <span>
                        Next: {new Date(s.nextDeliverAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-muted-foreground/30 hover:text-rose-alert"
                    onClick={() => handleDelete(s.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
