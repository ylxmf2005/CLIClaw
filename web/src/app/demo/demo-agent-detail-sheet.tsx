"use client";

import { useDemoContext } from "./page";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

function formatRelativeTime(ts?: number): string {
  if (!ts) return "Never";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-right text-sm text-foreground">{value}</span>
    </div>
  );
}

export function DemoAgentDetailSheet() {
  const { state, dispatch } = useDemoContext();
  const agentName = state.agentDetailSheet;
  const agent = agentName ? state.agents.find((a) => a.name === agentName) : null;
  const status = agentName ? state.agentStatuses[agentName] : undefined;

  const agentState = status
    ? status.agentHealth === "error"
      ? "error"
      : status.agentState === "running"
        ? "running"
        : "idle"
    : "unknown";

  const stateColor =
    agentState === "running"
      ? "text-amber-pulse"
      : agentState === "error"
        ? "text-rose-alert"
        : "text-emerald-signal";

  return (
    <Sheet
      open={!!agentName}
      onOpenChange={(open) => {
        if (!open) dispatch({ type: "SHOW_AGENT_DETAIL", agentName: null });
      }}
    >
      <SheetContent side="right" className="w-[360px] sm:max-w-[360px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                agentState === "running"
                  ? "bg-amber-pulse pulse-amber"
                  : agentState === "error"
                    ? "bg-rose-alert pulse-rose"
                    : "bg-emerald-signal pulse-emerald"
              }`}
            />
            {agent?.name ?? "Agent"}
          </SheetTitle>
          <SheetDescription>{agent?.description ?? "No description"}</SheetDescription>
        </SheetHeader>

        {agent && (
          <div className="flex flex-col gap-4 px-4 pb-4">
            {/* Status */}
            <div className="rounded-lg border border-border bg-accent/30 p-3">
              <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Run Status
              </div>
              <div className={`text-sm font-semibold capitalize ${stateColor}`}>
                {agentState}
              </div>
              {status?.currentRun && (
                <div className="mt-1 text-xs text-muted-foreground">
                  Run ID: {status.currentRun.id.slice(0, 8)}
                </div>
              )}
              {status?.pendingCount !== undefined && status.pendingCount > 0 && (
                <div className="mt-1 text-xs text-muted-foreground">
                  {status.pendingCount} pending envelope{status.pendingCount > 1 ? "s" : ""}
                </div>
              )}
            </div>

            {/* Agent info */}
            <div className="divide-y divide-border rounded-lg border border-border">
              <div className="px-3">
                <InfoRow
                  label="Provider"
                  value={
                    <span className="rounded bg-accent px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      {agent.provider}
                    </span>
                  }
                />
              </div>
              {agent.model && (
                <div className="px-3">
                  <InfoRow label="Model" value={agent.model} />
                </div>
              )}
              {agent.workspace && (
                <div className="px-3">
                  <InfoRow
                    label="Workspace"
                    value={
                      <span className="max-w-[180px] truncate font-mono text-xs">{agent.workspace}</span>
                    }
                  />
                </div>
              )}
              <div className="px-3">
                <InfoRow label="Permission" value={agent.permissionLevel} />
              </div>
              <div className="px-3">
                <InfoRow label="Relay Mode" value={agent.relayMode ?? "default-off"} />
              </div>
              <div className="px-3">
                <InfoRow label="Last Seen" value={formatRelativeTime(agent.lastSeenAt)} />
              </div>
              {agent.sessionPolicy && (
                <>
                  {agent.sessionPolicy.dailyResetAt && (
                    <div className="px-3">
                      <InfoRow label="Daily Reset" value={agent.sessionPolicy.dailyResetAt} />
                    </div>
                  )}
                  {agent.sessionPolicy.idleTimeout && (
                    <div className="px-3">
                      <InfoRow label="Idle Timeout" value={agent.sessionPolicy.idleTimeout} />
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Bindings */}
            <div>
              <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Bindings
              </div>
              {agent.bindings.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {agent.bindings.map((b) => (
                    <span
                      key={b}
                      className="rounded-md border border-border bg-accent/50 px-2 py-1 text-xs text-foreground"
                    >
                      {b}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No bindings configured</p>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
