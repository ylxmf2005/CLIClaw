/**
 * Wire the DaemonEventBus into daemon components.
 *
 * Provides hook callbacks for MessageRouter and AgentExecutor
 * that emit events through the bus.
 */

import type { DaemonEventBus } from "./event-bus.js";
import type { Envelope } from "../../envelope/types.js";
import type { CronScheduler } from "../scheduler/cron-scheduler.js";

/**
 * Create MessageRouter hooks that emit events on the bus.
 */
export function createRouterEventHooks(
  eventBus: DaemonEventBus,
  getCronScheduler: () => CronScheduler | null,
) {
  return {
    onEnvelopeCreated: (envelope: Envelope) => {
      eventBus.emit("envelope.new", { envelope });
    },
    onEnvelopeDone: (envelope: Envelope) => {
      getCronScheduler()?.onEnvelopeDone(envelope);
      eventBus.emit("envelope.done", { id: envelope.id });
    },
  };
}

/**
 * Create AgentExecutor hooks that emit events on the bus.
 */
export function createExecutorEventHooks(eventBus: DaemonEventBus) {
  return {
    onRunStarted: ({ agentName, runId }: { agentName: string; runId: string }) => {
      const now = Date.now();
      eventBus.emit("run.started", { runId, agentName, startedAt: now });
      eventBus.emit("agent.status", {
        name: agentName,
        agentState: "running",
        agentHealth: "ok",
        currentRun: { id: runId, startedAt: now },
      });
    },
    onRunFinished: ({ agentName, runId, state, error }: {
      agentName: string;
      runId: string;
      state: "success" | "failed" | "cancelled";
      error?: string;
    }) => {
      const status = state === "success" ? "completed" as const
        : state === "cancelled" ? "cancelled" as const
        : "failed" as const;
      eventBus.emit("run.completed", {
        runId,
        agentName,
        completedAt: Date.now(),
        status,
        error,
      });
      eventBus.emit("agent.status", {
        name: agentName,
        agentState: "idle",
        agentHealth: status === "failed" ? "error" : "ok",
      });
    },
  };
}
