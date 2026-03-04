import assert from "node:assert/strict";
import test from "node:test";

import type { Agent } from "../../agent/types.js";
import { determineAgentSetSessionActions } from "./agent-set-handler.js";

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    name: "nex",
    token: "token-nex",
    description: "helper",
    workspace: "/tmp/workspace",
    provider: "codex",
    model: "gpt-5-codex",
    reasoningEffort: "medium",
    permissionLevel: "restricted",
    metadata: { env: "a" },
    sessionPolicy: { idleTimeout: "2h" },
    createdAt: 1,
    ...overrides,
  };
}

test("determineAgentSetSessionActions requests refresh for runtime session config changes", () => {
  const before = makeAgent();
  const after = makeAgent({ model: "gpt-5.3-codex" });
  const result = determineAgentSetSessionActions({
    before,
    after,
    beforeBindings: [{ adapterType: "telegram", adapterToken: "bot-1" }],
    afterBindings: [{ adapterType: "telegram", adapterToken: "bot-1" }],
  });
  assert.equal(result.needsSessionRefresh, true);
  assert.equal(result.needsSessionContextReload, false);
});

test("determineAgentSetSessionActions requests context reload for prompt-surface changes", () => {
  const before = makeAgent();
  const after = makeAgent({ description: "updated description" });
  const result = determineAgentSetSessionActions({
    before,
    after,
    beforeBindings: [{ adapterType: "telegram", adapterToken: "bot-1" }],
    afterBindings: [{ adapterType: "telegram", adapterToken: "bot-1" }],
  });
  assert.equal(result.needsSessionRefresh, false);
  assert.equal(result.needsSessionContextReload, true);
});

test("determineAgentSetSessionActions treats binding changes as context reload", () => {
  const before = makeAgent();
  const after = makeAgent();
  const result = determineAgentSetSessionActions({
    before,
    after,
    beforeBindings: [{ adapterType: "telegram", adapterToken: "bot-1" }],
    afterBindings: [{ adapterType: "telegram", adapterToken: "bot-2" }],
  });
  assert.equal(result.needsSessionRefresh, false);
  assert.equal(result.needsSessionContextReload, true);
});

test("determineAgentSetSessionActions keeps refresh precedence over context reload", () => {
  const before = makeAgent();
  const after = makeAgent({
    workspace: "/tmp/new-workspace",
    description: "updated description",
  });
  const result = determineAgentSetSessionActions({
    before,
    after,
    beforeBindings: [{ adapterType: "telegram", adapterToken: "bot-1" }],
    afterBindings: [{ adapterType: "telegram", adapterToken: "bot-2" }],
  });
  assert.equal(result.needsSessionRefresh, true);
  assert.equal(result.needsSessionContextReload, false);
});
