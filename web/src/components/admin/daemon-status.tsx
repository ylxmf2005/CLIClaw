"use client";

import { useEffect, useState } from "react";
import { useAppState } from "@/providers/app-state-provider";
import { getDaemonTime } from "@/lib/api";
import {
  Activity,
  Clock,
  Database,
  Plug,
  Server,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useWebSocket } from "@/providers/ws-provider";

function formatUptime(startMs: number): string {
  const diff = Date.now() - startMs;
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 24) {
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  }
  return `${h}h ${m}m`;
}

export function DaemonStatusView() {
  const { state } = useAppState();
  const { status: wsStatus } = useWebSocket();
  const ds = state.daemonStatus;
  const [timeInfo, setTimeInfo] = useState<{
    bossTimezone: string;
    daemonTimezone: string;
  } | null>(null);

  useEffect(() => {
    getDaemonTime().then(setTimeInfo).catch(() => {});
  }, []);

  const runningAgents = state.agents.filter(
    (a) => state.agentStatuses[a.name]?.agentState === "running"
  );

  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <div className="flex h-14 items-center border-b border-border bg-card/80 px-6 backdrop-blur-sm">
        <Server className="mr-3 h-5 w-5 text-cyan-glow" />
        <h2 className="font-display text-lg font-semibold">Daemon Status</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Connection banner */}
          <div
            className={`flex items-center gap-3 rounded-xl border p-4 ${
              wsStatus === "connected"
                ? "border-emerald-signal/20 bg-emerald-signal/5"
                : wsStatus === "connecting"
                  ? "border-amber-pulse/20 bg-amber-pulse/5"
                  : "border-rose-alert/20 bg-rose-alert/5"
            }`}
          >
            {wsStatus === "connected" ? (
              <Wifi className="h-5 w-5 text-emerald-signal" />
            ) : (
              <WifiOff className="h-5 w-5 text-rose-alert" />
            )}
            <div>
              <p className="text-sm font-medium">
                {wsStatus === "connected"
                  ? "Connected to daemon"
                  : wsStatus === "connecting"
                    ? "Connecting..."
                    : "Disconnected"}
              </p>
              {ds?.startTimeMs && (
                <p className="text-xs text-muted-foreground">
                  Uptime: {formatUptime(ds.startTimeMs)}
                </p>
              )}
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-4 gap-4">
            <StatCard
              icon={<Activity className="h-4 w-4" />}
              label="Agents"
              value={state.agents.length}
              sub={`${runningAgents.length} running`}
              color="text-cyan-glow"
            />
            <StatCard
              icon={<Server className="h-4 w-4" />}
              label="Teams"
              value={state.teams.length}
              color="text-lavender-info"
            />
            <StatCard
              icon={<Clock className="h-4 w-4" />}
              label="Cron Jobs"
              value={state.cronSchedules.filter((c) => c.enabled).length}
              sub={`${state.cronSchedules.length} total`}
              color="text-amber-pulse"
            />
            <StatCard
              icon={<Plug className="h-4 w-4" />}
              label="Adapters"
              value={ds?.adapters.length ?? 0}
              color="text-emerald-signal"
            />
          </div>

          {/* Details */}
          <div className="grid grid-cols-2 gap-4">
            {/* Data directory */}
            <DetailCard title="Data Directory" icon={<Database className="h-4 w-4" />}>
              <code className="text-xs font-mono text-muted-foreground">
                {ds?.dataDir || "~/cliclaw/"}
              </code>
            </DetailCard>

            {/* Timezone */}
            <DetailCard title="Timezone" icon={<Clock className="h-4 w-4" />}>
              <div className="space-y-1 text-xs">
                <p>
                  <span className="text-muted-foreground">Boss:</span>{" "}
                  <span className="text-foreground/80">{timeInfo?.bossTimezone || "—"}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Daemon:</span>{" "}
                  <span className="text-foreground/80">{timeInfo?.daemonTimezone || "—"}</span>
                </p>
              </div>
            </DetailCard>

            {/* Adapters */}
            <DetailCard title="Active Adapters" icon={<Plug className="h-4 w-4" />}>
              {ds?.adapters.length ? (
                <div className="space-y-1">
                  {ds.adapters.map((a) => (
                    <span
                      key={a}
                      className="mr-2 inline-block rounded bg-accent px-2 py-0.5 text-xs text-foreground/80"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">None</span>
              )}
            </DetailCard>

            {/* Bindings */}
            <DetailCard title="Agent Bindings" icon={<Plug className="h-4 w-4" />}>
              {ds?.bindings.length ? (
                <div className="space-y-1">
                  {ds.bindings.map((b, i) => (
                    <p key={i} className="text-xs">
                      <span className="text-cyan-glow/80">{b.agentName}</span>
                      <span className="text-muted-foreground"> → </span>
                      <span className="text-foreground/70">{b.adapterType}</span>
                    </p>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">None</span>
              )}
            </DetailCard>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub?: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className={`mb-3 ${color}`}>{icon}</div>
      <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      {sub && <p className="mt-0.5 text-[10px] text-muted-foreground/70">{sub}</p>}
    </div>
  );
}

function DetailCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-wider">
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}
