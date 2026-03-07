export type AgentReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh" | "max";
export type Provider = "claude" | "codex";

/** Claude effort levels: low | medium | high | max  (max is Opus-only). */
export type ClaudeEffortLevel = "low" | "medium" | "high" | "max";

/** Codex reasoning effort levels. */
export type CodexReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";

/** Valid reasoning effort values per provider. */
export const REASONING_EFFORTS_BY_PROVIDER: Record<Provider, readonly string[]> = {
  claude: ["low", "medium", "high", "max"] as const,
  codex: ["none", "low", "medium", "high", "xhigh"] as const,
};

function normalizeAgentReasoningEffort(value: string | null | undefined): AgentReasoningEffort | undefined {
  if (value === "none" || value === "low" || value === "medium" || value === "high" || value === "xhigh" || value === "max") {
    return value;
  }
  return undefined;
}

export function mapAgentReasoningEffortToClaudeEffortLevel(
  value: string | null | undefined
): ClaudeEffortLevel | undefined {
  const effort = normalizeAgentReasoningEffort(value);
  if (!effort) return undefined;

  // Claude supports low | medium | high | max.
  if (effort === "none") return "low";
  if (effort === "low") return "low";
  if (effort === "medium") return "medium";
  if (effort === "max") return "max";
  return "high"; // high or xhigh → high
}

export function normalizeClaudeEffortLevel(value: string | null | undefined): ClaudeEffortLevel | undefined {
  if (value === "low" || value === "medium" || value === "high" || value === "max") return value;
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
