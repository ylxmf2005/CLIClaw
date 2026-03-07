/**
 * Instruction generator for agent system prompts.
 *
 * Generates system instructions as a string to be passed inline
 * to provider CLIs via --append-system-prompt (Claude) or
 * -c developer_instructions=... (Codex).
 */

import type { Agent } from "./types.js";
import type { AgentBinding } from "../daemon/db/database.js";
import { renderPrompt } from "../shared/prompt-renderer.js";
import { buildSystemPromptContext } from "../shared/prompt-context.js";
import {
  ensureAgentInternalSpaceLayout,
  readAgentInternalDailyMemorySnapshot,
  readAgentInternalMemorySnapshot,
  readAgentInternalSoulSnapshot,
  readAgentInternalSessionSummarySnapshot,
} from "../shared/internal-space.js";

/**
 * Context for generating system instructions.
 */
export interface InstructionContext {
  agent: Agent;
  agentToken: string;
  bindings?: AgentBinding[];
  workspaceDir?: string;
  teams?: Array<{
    name: string;
    members: string[];
    teamspaceDir: string;
  }>;
  additionalContext?: string;
  cliclawDir?: string;
  bossTimezone?: string;
  boss?: {
    name?: string;
    adapterIds?: Record<string, string>;
  };
  bossMd?: {
    enabled?: boolean;
    snapshot?: string;
    source?: string;
    error?: string;
  };
  sessionSummaryConfig?: {
    recentDays: number;
    perSessionMaxChars: number;
  };
}

function chooseFence(text: string): string {
  let fence = "```";
  while (text.includes(fence)) {
    fence += "`";
  }
  return fence;
}

/**
 * Generate system instructions for an agent.
 *
 * Returns a string suitable for passing inline to CLI flags:
 * - Claude: --append-system-prompt
 * - Codex: -c developer_instructions=...
 *
 * @param ctx - Instruction context with agent info and bindings
 * @returns Generated instruction content
 */
export function generateSystemInstructions(ctx: InstructionContext): string {
  const { agent, agentToken, bindings, additionalContext, boss } = ctx;

  const promptContext = buildSystemPromptContext({
    agent,
    agentToken,
    bindings: bindings ?? [],
    workspaceDir: ctx.workspaceDir,
    teams: ctx.teams ?? [],
    time: { bossTimezone: ctx.bossTimezone },
    cliclawDir: ctx.cliclawDir,
    boss,
  });

  // Inject internal space MEMORY.md snapshot for this agent (best-effort; never prints token).
  const cliclawDir = ctx.cliclawDir ?? (promptContext.cliclaw as Record<string, unknown>).dir as string;
  const spaceContext = promptContext.internalSpace as Record<string, unknown>;
  const bossMdContext = promptContext.bossMd as Record<string, unknown>;
  const ensured = ensureAgentInternalSpaceLayout({ cliclawDir, agentName: agent.name });
  if (!ensured.ok) {
    spaceContext.soul = "";
    spaceContext.soulFence = "```";
    spaceContext.soulError = ensured.error;
    spaceContext.note = "";
    spaceContext.noteFence = "```";
    spaceContext.error = ensured.error;
    spaceContext.daily = "";
    spaceContext.dailyFence = "```";
    spaceContext.dailyError = ensured.error;
    spaceContext.sessionSummaries = "";
    spaceContext.sessionSummariesFence = "```";
    spaceContext.sessionSummariesError = ensured.error;
  } else {
    const soulSnapshot = readAgentInternalSoulSnapshot({ cliclawDir, agentName: agent.name });
    if (soulSnapshot.ok) {
      spaceContext.soul = soulSnapshot.note;
      spaceContext.soulFence = chooseFence(soulSnapshot.note);
      spaceContext.soulError = "";
    } else {
      spaceContext.soul = "";
      spaceContext.soulFence = "```";
      spaceContext.soulError = soulSnapshot.error;
    }

    const snapshot = readAgentInternalMemorySnapshot({ cliclawDir, agentName: agent.name });
    if (snapshot.ok) {
      spaceContext.note = snapshot.note;
      spaceContext.noteFence = chooseFence(snapshot.note);
      spaceContext.error = "";
    } else {
      spaceContext.note = "";
      spaceContext.noteFence = "```";
      spaceContext.error = snapshot.error;
    }

    const dailySnapshot = readAgentInternalDailyMemorySnapshot({ cliclawDir, agentName: agent.name });
    if (dailySnapshot.ok) {
      spaceContext.daily = dailySnapshot.note;
      spaceContext.dailyFence = chooseFence(dailySnapshot.note);
      spaceContext.dailyError = "";
    } else {
      spaceContext.daily = "";
      spaceContext.dailyFence = "```";
      spaceContext.dailyError = dailySnapshot.error;
    }

    const sessionSummarySnapshot = readAgentInternalSessionSummarySnapshot({
      cliclawDir,
      agentName: agent.name,
      recentDays: ctx.sessionSummaryConfig?.recentDays,
      perSessionMaxChars: ctx.sessionSummaryConfig?.perSessionMaxChars,
    });
    spaceContext.sessionSummaryRecentDays = ctx.sessionSummaryConfig?.recentDays ?? spaceContext.sessionSummaryRecentDays;
    spaceContext.sessionSummaryPerSessionMaxChars =
      ctx.sessionSummaryConfig?.perSessionMaxChars ?? spaceContext.sessionSummaryPerSessionMaxChars;
    if (sessionSummarySnapshot.ok) {
      spaceContext.sessionSummaries = sessionSummarySnapshot.note;
      spaceContext.sessionSummariesFence = chooseFence(sessionSummarySnapshot.note);
      spaceContext.sessionSummariesError = "";
    } else {
      spaceContext.sessionSummaries = "";
      spaceContext.sessionSummariesFence = "```";
      spaceContext.sessionSummariesError = sessionSummarySnapshot.error;
    }
  }

  const bossMdEnabled = ctx.bossMd?.enabled !== false;
  bossMdContext.enabled = bossMdEnabled;
  bossMdContext.source = ctx.bossMd?.source ?? "";
  bossMdContext.error = ctx.bossMd?.error ?? "";
  if (bossMdEnabled && typeof ctx.bossMd?.snapshot === "string" && ctx.bossMd.snapshot.trim()) {
    const snapshot = ctx.bossMd.snapshot.trim();
    bossMdContext.snapshot = snapshot;
    bossMdContext.snapshotFence = chooseFence(snapshot);
  } else {
    bossMdContext.snapshot = "";
    bossMdContext.snapshotFence = "```";
  }

  (promptContext.cliclaw as Record<string, unknown>).additionalContext =
    additionalContext ?? "";

  return renderPrompt({
    surface: "system",
    template: "system/base.md",
    context: promptContext,
  });
}
