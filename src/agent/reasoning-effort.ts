export type AgentReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";
export type Provider = "claude" | "codex";
export type ClaudeEffortLevel = "low" | "medium" | "high";

function normalizeAgentReasoningEffort(value: string | null | undefined): AgentReasoningEffort | undefined {
  if (value === "none" || value === "low" || value === "medium" || value === "high" || value === "xhigh") {
    return value;
  }
  return undefined;
}

export function mapAgentReasoningEffortToClaudeEffortLevel(
  value: string | null | undefined
): ClaudeEffortLevel | undefined {
  const effort = normalizeAgentReasoningEffort(value);
  if (!effort) return undefined;

  // Claude effort levels are low|medium|high.
  // Mapping keeps the nearest semantic level from Hi-Boss's shared enum.
  if (effort === "none" || effort === "low") return "low";
  if (effort === "medium") return "medium";
  return "high"; // high or xhigh
}

export function normalizeClaudeEffortLevel(value: string | null | undefined): ClaudeEffortLevel | undefined {
  if (value === "low" || value === "medium" || value === "high") return value;
  return undefined;
}

export function applyProviderReasoningEffortEnv(params: {
  provider: Provider;
  reasoningEffort: string | null | undefined;
  env: Record<string, string>;
}): void {
  if (params.provider !== "claude") return;

  const claudeEffort = mapAgentReasoningEffortToClaudeEffortLevel(params.reasoningEffort);
  if (!claudeEffort) {
    return;
  }

  params.env.CLAUDE_CODE_EFFORT_LEVEL = claudeEffort;
}
