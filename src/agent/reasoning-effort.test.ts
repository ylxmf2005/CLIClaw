import assert from "node:assert/strict";
import test from "node:test";
import {
  applyProviderReasoningEffortEnv,
  mapAgentReasoningEffortToClaudeEffortLevel,
  normalizeClaudeEffortLevel,
} from "./reasoning-effort.js";

test("mapAgentReasoningEffortToClaudeEffortLevel maps shared enum to Claude levels", () => {
  assert.equal(mapAgentReasoningEffortToClaudeEffortLevel("none"), "low");
  assert.equal(mapAgentReasoningEffortToClaudeEffortLevel("low"), "low");
  assert.equal(mapAgentReasoningEffortToClaudeEffortLevel("medium"), "medium");
  assert.equal(mapAgentReasoningEffortToClaudeEffortLevel("high"), "high");
  assert.equal(mapAgentReasoningEffortToClaudeEffortLevel("xhigh"), "high");
  assert.equal(mapAgentReasoningEffortToClaudeEffortLevel("max"), "max");
  assert.equal(mapAgentReasoningEffortToClaudeEffortLevel("default"), undefined);
  assert.equal(mapAgentReasoningEffortToClaudeEffortLevel(undefined), undefined);
});

test("normalizeClaudeEffortLevel validates low|medium|high|max", () => {
  assert.equal(normalizeClaudeEffortLevel("low"), "low");
  assert.equal(normalizeClaudeEffortLevel("medium"), "medium");
  assert.equal(normalizeClaudeEffortLevel("high"), "high");
  assert.equal(normalizeClaudeEffortLevel("max"), "max");
  assert.equal(normalizeClaudeEffortLevel("xhigh"), undefined);
  assert.equal(normalizeClaudeEffortLevel("none"), undefined);
});

test("applyProviderReasoningEffortEnv sets Claude env and leaves Codex untouched", () => {
  const claudeEnv: Record<string, string> = {};
  applyProviderReasoningEffortEnv({
    provider: "claude",
    reasoningEffort: "xhigh",
    env: claudeEnv,
  });
  assert.equal(claudeEnv.CLAUDE_CODE_EFFORT_LEVEL, "high");

  const codexEnv: Record<string, string> = {};
  applyProviderReasoningEffortEnv({
    provider: "codex",
    reasoningEffort: "xhigh",
    env: codexEnv,
  });
  assert.equal("CLAUDE_CODE_EFFORT_LEVEL" in codexEnv, false);
});
