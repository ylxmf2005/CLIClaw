import assert from "node:assert/strict";
import test from "node:test";

import { OneShotExecutor } from "./oneshot-executor.js";

test("tryCloneSession does not fall back to agent-wide recent sessions", async () => {
  let listAgentSessionsCalled = false;
  const executor = new OneShotExecutor(
    {
      db: {
        getChannelSessionBinding: () => null,
        getAgentSessionById: () => null,
        listAgentSessionsByAgent: () => {
          listAgentSessionsCalled = true;
          throw new Error("listAgentSessionsByAgent should not be called");
        },
      } as any,
      router: { routeEnvelope: async () => undefined } as any,
      hibossDir: "/tmp",
    },
  );

  const result = await (executor as any).tryCloneSession(
    { name: "nex", provider: "codex" },
    {
      id: "env-1",
      from: "agent:alice",
      to: "agent:nex",
      fromBoss: false,
      content: { text: "hello" },
      status: "pending",
      createdAt: Date.now(),
      metadata: { origin: "internal" },
    },
  );

  assert.equal(result, null);
  assert.equal(listAgentSessionsCalled, false);
});
