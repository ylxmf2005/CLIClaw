import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { AgentExecutor } from "./executor.js";
import { HiBossDatabase } from "../daemon/db/database.js";

function withTempDb(run: (db: HiBossDatabase) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hiboss-executor-scope-test-"));
  const dbPath = path.join(dir, "hiboss.db");
  let db: HiBossDatabase | null = null;
  try {
    db = new HiBossDatabase(dbPath);
    run(db);
  } finally {
    db?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function waitUntilIdle(
  executor: AgentExecutor,
  agentName: string,
  timeoutMs = 1000
): Promise<void> {
  const startedAt = Date.now();
  while (executor.isAgentBusy(agentName)) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`executor did not become idle within ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test("abortCurrentRun skips queued tasks enqueued before abort generation bump", async () => {
  const executor = new AgentExecutor();
  const calls: string[] = [];

  let releaseFirst!: () => void;
  const firstRunGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  (executor as any).runSessionExecution = async (params: { envelopes: Array<{ id: string }> }) => {
    const id = params.envelopes[0]?.id;
    if (id) calls.push(id);
    if (id === "e1") {
      await firstRunGate;
    }
  };

  const agent = { name: "nex" } as any;
  const db = {} as any;
  const scope = {
    kind: "channel",
    cacheKey: "channel-session:nex:s-default",
    agentSessionId: "s-default",
    adapterType: "internal",
    chatId: "internal:system:to:nex",
  } as any;

  (executor as any).queueSessionExecution({
    agent,
    db,
    scope,
    envelopes: [{ id: "e1" }],
    refreshReasons: [],
  });
  await new Promise((resolve) => setImmediate(resolve));

  (executor as any).queueSessionExecution({
    agent,
    db,
    scope,
    envelopes: [{ id: "e2" }],
    refreshReasons: [],
  });

  const cancelled = executor.abortCurrentRun("nex", "test:/abort");
  assert.equal(cancelled, true);

  releaseFirst();
  await waitUntilIdle(executor, "nex");

  assert.deepEqual(calls, ["e1"]);
});

test("abortCurrentRun skips old queued tasks but allows new tasks queued after abort", async () => {
  const executor = new AgentExecutor();
  const calls: string[] = [];

  let releaseFirst!: () => void;
  const firstRunGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  (executor as any).runSessionExecution = async (params: { envelopes: Array<{ id: string }> }) => {
    const id = params.envelopes[0]?.id;
    if (id) calls.push(id);
    if (id === "e1") {
      await firstRunGate;
    }
  };

  const agent = { name: "nex" } as any;
  const db = {} as any;
  const scope = {
    kind: "channel",
    cacheKey: "channel-session:nex:s-default",
    agentSessionId: "s-default",
    adapterType: "internal",
    chatId: "internal:system:to:nex",
  } as any;

  (executor as any).queueSessionExecution({
    agent,
    db,
    scope,
    envelopes: [{ id: "e1" }],
    refreshReasons: [],
  });
  await new Promise((resolve) => setImmediate(resolve));

  (executor as any).queueSessionExecution({
    agent,
    db,
    scope,
    envelopes: [{ id: "e2" }],
    refreshReasons: [],
  });

  const cancelled = executor.abortCurrentRun("nex", "test:/abort");
  assert.equal(cancelled, true);

  (executor as any).queueSessionExecution({
    agent,
    db,
    scope,
    envelopes: [{ id: "e3" }],
    refreshReasons: [],
  });

  releaseFirst();
  await waitUntilIdle(executor, "nex");

  assert.deepEqual(calls, ["e1", "e3"]);
});

test("abortCurrentRunForChannel skips queued tasks only for the targeted chat scope", async () => {
  const executor = new AgentExecutor({
    sessionConcurrencyPerAgent: 1,
    sessionConcurrencyGlobal: 1,
  });
  const calls: string[] = [];

  let releaseFirst!: () => void;
  const firstRunGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  (executor as any).runSessionExecution = async (params: { envelopes: Array<{ id: string }> }) => {
    const id = params.envelopes[0]?.id;
    if (id) calls.push(id);
    if (id === "e1") {
      await firstRunGate;
    }
  };

  const agent = { name: "nex" } as any;
  const db = {} as any;
  const scopeChat1 = {
    kind: "channel",
    cacheKey: "channel-session:nex:s-chat-1",
    agentSessionId: "s-chat-1",
    adapterType: "telegram",
    chatId: "chat-1",
  } as any;
  const scopeChat2 = {
    kind: "channel",
    cacheKey: "channel-session:nex:s-chat-2",
    agentSessionId: "s-chat-2",
    adapterType: "telegram",
    chatId: "chat-2",
  } as any;

  (executor as any).queueSessionExecution({
    agent,
    db,
    scope: scopeChat1,
    envelopes: [{ id: "e1" }],
    refreshReasons: [],
  });
  await new Promise((resolve) => setImmediate(resolve));

  (executor as any).queueSessionExecution({
    agent,
    db,
    scope: scopeChat2,
    envelopes: [{ id: "e2" }],
    refreshReasons: [],
  });
  (executor as any).queueSessionExecution({
    agent,
    db,
    scope: scopeChat1,
    envelopes: [{ id: "e3" }],
    refreshReasons: [],
  });

  const cancelled = executor.abortCurrentRunForChannel("nex", "telegram", "chat-1", "test:/abort");
  assert.equal(cancelled, true);

  releaseFirst();
  await waitUntilIdle(executor, "nex");

  assert.deepEqual(calls, ["e1", "e2"]);
});

test("resolveExecutionScope respects envelope channelSessionId pin even after chat binding changed", () => {
  withTempDb((db) => {
    db.registerAgent({ name: "nex", provider: "codex" });

    const first = db.getOrCreateChannelSession({
      agentName: "nex",
      adapterType: "telegram",
      chatId: "chat-1",
      ownerUserId: "token-boss",
      provider: "codex",
    }).session;

    const fresh = db.createFreshChannelSession({
      agentName: "nex",
      adapterType: "telegram",
      chatId: "chat-1",
      ownerUserId: "token-boss",
      provider: "codex",
    }).newSession;

    assert.notEqual(first.id, fresh.id);

    const executor = new AgentExecutor();
    const agent = { name: "nex", provider: "codex" } as any;

    const pinnedEnvelope = {
      id: "env-1",
      from: "channel:telegram:chat-1",
      fromBoss: false,
      metadata: {
        channelSessionId: first.id,
        userToken: "token-member",
      },
    } as any;

    const scope = (executor as any).resolveExecutionScope(agent, db, pinnedEnvelope) as {
      kind: string;
      agentSessionId: string;
      ownerUserId?: string;
    };
    assert.equal(scope.kind, "channel");
    assert.equal(scope.agentSessionId, first.id);
    assert.equal(scope.ownerUserId, "token-member");

    const bossEnvelope = {
      id: "env-2",
      from: "channel:telegram:chat-1",
      fromBoss: true,
      metadata: {
        channelSessionId: first.id,
        userToken: "token-boss",
      },
    } as any;
    const bossScope = (executor as any).resolveExecutionScope(agent, db, bossEnvelope) as {
      ownerUserId?: string;
    };
    assert.equal(bossScope.ownerUserId, "token-boss");
  });
});

test("resolveExecutionScope routes agent-origin chatScope via internal channel sessions", () => {
  withTempDb((db) => {
    db.registerAgent({ name: "nex", provider: "claude" });

    const executor = new AgentExecutor();
    const agent = { name: "nex", provider: "claude" } as any;

    const dmEnvelope = {
      id: "env-direct",
      from: "agent:other",
      to: "agent:nex",
      fromBoss: false,
      metadata: {
        chatScope: "agent-chat-demo-1",
      },
    } as any;
    const dmScope = (executor as any).resolveExecutionScope(agent, db, dmEnvelope) as {
      kind: string;
      agentSessionId?: string;
      adapterType?: string;
      chatId?: string;
    };
    assert.equal(dmScope.kind, "channel");
    assert.equal(dmScope.adapterType, "internal");
    assert.equal(dmScope.chatId, "agent-chat-demo-1");

    const teamEnvelope = {
      id: "env-team",
      from: "agent:other",
      to: "agent:nex",
      fromBoss: false,
      metadata: {
        chatScope: "team:research",
      },
    } as any;
    const teamScope = (executor as any).resolveExecutionScope(agent, db, teamEnvelope) as {
      kind: string;
      agentSessionId?: string;
      adapterType?: string;
      chatId?: string;
    };
    assert.equal(teamScope.kind, "channel");
    assert.equal(teamScope.adapterType, "internal");
    assert.equal(teamScope.chatId, "team:research");
    assert.notEqual(teamScope.agentSessionId, dmScope.agentSessionId);
  });
});

test("resolveExecutionScope synthesizes internal chat scope for agent envelopes without chatScope", () => {
  withTempDb((db) => {
    db.registerAgent({ name: "nex", provider: "claude" });
    const executor = new AgentExecutor();
    const agent = { name: "nex", provider: "claude" } as any;

    const env = {
      id: "env-default",
      from: "agent:other",
      to: "agent:nex",
      fromBoss: false,
      metadata: { origin: "cli" },
    } as any;

    const scope = (executor as any).resolveExecutionScope(agent, db, env) as {
      kind: string;
      adapterType?: string;
      chatId?: string;
    };
    assert.equal(scope.kind, "channel");
    assert.equal(scope.adapterType, "internal");
    assert.equal(scope.chatId, "internal:other:to:nex");
  });
});

test("resolveExecutionScope keeps deterministic internal scope for agent-new-chat and agent-chat origins", () => {
  withTempDb((db) => {
    db.registerAgent({ name: "nex", provider: "claude" });
    const executor = new AgentExecutor();
    const agent = { name: "nex", provider: "claude" } as any;

    const newChatEnvelope = {
      id: "env-agent-new-chat",
      from: "agent:other:new",
      to: "agent:nex",
      fromBoss: false,
      metadata: { origin: "internal" },
    } as any;
    const newChatScope = (executor as any).resolveExecutionScope(agent, db, newChatEnvelope) as {
      adapterType?: string;
      chatId?: string;
    };
    assert.equal(newChatScope.adapterType, "internal");
    assert.equal(newChatScope.chatId, "internal:other:to:nex");

    const agentChatEnvelope = {
      id: "env-agent-chat",
      from: "agent:other:chat-42",
      to: "agent:nex",
      fromBoss: false,
      metadata: { origin: "internal" },
    } as any;
    const agentChatScope = (executor as any).resolveExecutionScope(agent, db, agentChatEnvelope) as {
      adapterType?: string;
      chatId?: string;
    };
    assert.equal(agentChatScope.adapterType, "internal");
    assert.equal(agentChatScope.chatId, "internal:other:to:nex");
  });
});

test("resolveExecutionScope ignores chatScope for channel-origin envelopes", () => {
  withTempDb((db) => {
    db.registerAgent({ name: "nex", provider: "claude" });
    const executor = new AgentExecutor();
    const agent = { name: "nex", provider: "claude" } as any;

    const channelEnvelope = {
      id: "env-channel",
      from: "channel:telegram:chat-1",
      to: "agent:nex",
      fromBoss: false,
      metadata: {
        chatScope: "team:research",
      },
    } as any;
    const channelScope = (executor as any).resolveExecutionScope(agent, db, channelEnvelope) as {
      kind: string;
      agentSessionId?: string;
      adapterType?: string;
      chatId?: string;
    };
    assert.equal(channelScope.kind, "channel");
    assert.equal(channelScope.adapterType, "telegram");
    assert.equal(channelScope.chatId, "chat-1");
  });
});
