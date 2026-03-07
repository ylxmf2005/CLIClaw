import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { CliClawDatabase } from "../daemon/db/database.js";
import { ConversationHistory } from "../daemon/history/conversation-history.js";
import { createSessionFile, readSessionFile } from "../daemon/history/session-file-io.js";
import type { Envelope } from "../envelope/types.js";
import type { AgentSession } from "./executor-support.js";
import { AgentExecutor } from "./executor.js";
import type { Agent } from "./types.js";

async function withTempDb(run: (params: { db: CliClawDatabase; cliclawDir: string }) => Promise<void>): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cliclaw-executor-session-test-"));
  const dbPath = path.join(dir, "cliclaw.db");
  const cliclawDir = path.join(dir, "cliclaw-home");
  fs.mkdirSync(cliclawDir, { recursive: true });
  let db: CliClawDatabase | null = null;
  try {
    db = new CliClawDatabase(dbPath);
    await run({ db, cliclawDir });
  } finally {
    db?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

type ChannelExecutionScope = {
  kind: "channel";
  cacheKey: string;
  agentSessionId: string;
  adapterType: string;
  chatId: string;
  ownerUserId?: string;
};

type ExecutorInternals = {
  resolveExecutionScope: (
    agent: Agent,
    db: CliClawDatabase,
    envelope: Envelope
  ) => ChannelExecutionScope;
  getOrCreateChannelSession: (
    agent: Agent,
    db: CliClawDatabase,
    scope: ChannelExecutionScope
  ) => Promise<AgentSession>;
};

async function resolveAndGetChannelSession(params: {
  executor: AgentExecutor;
  agent: Agent;
  db: CliClawDatabase;
  envelope: Envelope;
}): Promise<AgentSession> {
  const internals = params.executor as unknown as ExecutorInternals;
  const scope = internals.resolveExecutionScope(params.agent, params.db, params.envelope);
  return internals.getOrCreateChannelSession(params.agent, params.db, scope);
}

test("getOrCreateChannelSession does not clear other channel provider handles when session policy is expired", async () => {
  await withTempDb(async ({ db, cliclawDir }) => {
    db.registerAgent({
      name: "nex",
      provider: "codex",
      sessionPolicy: { idleTimeout: "1s" },
    });

    const s1 = db.getOrCreateChannelSession({
      agentName: "nex",
      adapterType: "telegram",
      chatId: "chat-1",
      ownerUserId: "u-1",
      provider: "codex",
    }).session;
    const s2 = db.getOrCreateChannelSession({
      agentName: "nex",
      adapterType: "telegram",
      chatId: "chat-2",
      ownerUserId: "u-1",
      provider: "codex",
    }).session;
    db.updateAgentSessionProviderSessionId(s1.id, "thread-chat-1", { provider: "codex" });
    db.updateAgentSessionProviderSessionId(s2.id, "thread-chat-2", { provider: "codex" });

    const executor = new AgentExecutor({ db, cliclawDir });
    const agent = db.getAgentByName("nex");
    assert.ok(agent);

    const session = await (executor as unknown as {
      getOrCreateChannelSession: (
        agent: Agent,
        db: CliClawDatabase,
        scope: {
          kind: "channel";
          cacheKey: string;
          agentSessionId: string;
          adapterType: string;
          chatId: string;
          ownerUserId?: string;
        }
      ) => Promise<AgentSession>;
    }).getOrCreateChannelSession(agent, db, {
      kind: "channel",
      cacheKey: `channel-session:nex:${s1.id}`,
      agentSessionId: s1.id,
      adapterType: "telegram",
      chatId: "chat-1",
      ownerUserId: "u-1",
    });

    assert.equal(session.sessionId, "thread-chat-1");
    assert.equal(db.getAgentSessionById(s1.id)?.providerSessionId, "thread-chat-1");
    assert.equal(db.getAgentSessionById(s2.id)?.providerSessionId, "thread-chat-2");
  });
});

test("getOrCreateChannelSession policy refresh is scope-local for persisted channel sessions", async () => {
  await withTempDb(async ({ db, cliclawDir }) => {
    db.registerAgent({
      name: "nex",
      provider: "codex",
      sessionPolicy: { idleTimeout: "1s" },
    });

    const s1 = db.getOrCreateChannelSession({
      agentName: "nex",
      adapterType: "telegram",
      chatId: "chat-1",
      ownerUserId: "u-1",
      provider: "codex",
    }).session;
    const s2 = db.getOrCreateChannelSession({
      agentName: "nex",
      adapterType: "telegram",
      chatId: "chat-2",
      ownerUserId: "u-1",
      provider: "codex",
    }).session;
    db.updateAgentSessionProviderSessionId(s1.id, "thread-chat-1", { provider: "codex" });
    db.updateAgentSessionProviderSessionId(s2.id, "thread-chat-2", { provider: "codex" });
    db.touchAgentSession(s1.id, { lastActiveAt: Date.now() - 10_000 });

    const executor = new AgentExecutor({ db, cliclawDir });
    const agent = db.getAgentByName("nex");
    assert.ok(agent);

    const session = await resolveAndGetChannelSession({
      executor,
      agent,
      db,
      envelope: {
        id: "env-idle-expire",
        from: "channel:telegram:chat-1",
        to: "agent:nex",
        fromBoss: false,
        content: { text: "trigger idle-timeout policy check" },
        status: "pending",
        createdAt: Date.now(),
      },
    });

    assert.equal(session.sessionId, undefined);
    assert.equal(db.getAgentSessionById(s1.id)?.providerSessionId, undefined);
    assert.equal(db.getAgentSessionById(s2.id)?.providerSessionId, "thread-chat-2");
  });
});

test("getOrCreateChannelSession daily-reset-at closes only the scoped history session", async () => {
  await withTempDb(async ({ db, cliclawDir }) => {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const dailyResetAt = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    const boundaryMs = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hour,
      minute,
      0,
      0
    ).getTime();

    db.registerAgent({
      name: "nex",
      provider: "codex",
      sessionPolicy: { dailyResetAt },
    });

    const s1 = db.getOrCreateChannelSession({
      agentName: "nex",
      adapterType: "telegram",
      chatId: "chat-1",
      ownerUserId: "u-1",
      provider: "codex",
    }).session;
    const s2 = db.getOrCreateChannelSession({
      agentName: "nex",
      adapterType: "telegram",
      chatId: "chat-2",
      ownerUserId: "u-1",
      provider: "codex",
    }).session;
    db.updateAgentSessionProviderSessionId(s1.id, "thread-chat-1", { provider: "codex" });
    db.updateAgentSessionProviderSessionId(s2.id, "thread-chat-2", { provider: "codex" });
    db.touchAgentSession(s1.id, { lastActiveAt: boundaryMs - 1 });

    const conversationHistory = new ConversationHistory({
      agentsDir: path.join(cliclawDir, "agents"),
      timezone: "UTC",
    });
    conversationHistory.ensureActiveSession("nex", "chat-1");
    conversationHistory.ensureActiveSession("nex", "chat-2");
    const historySessionBeforeChat1 = conversationHistory.getCurrentSessionId("nex", "chat-1");
    const historySessionBeforeChat2 = conversationHistory.getCurrentSessionId("nex", "chat-2");
    assert.ok(historySessionBeforeChat1);
    assert.ok(historySessionBeforeChat2);

    const executor = new AgentExecutor({ db, cliclawDir, conversationHistory });
    const agent = db.getAgentByName("nex");
    assert.ok(agent);

    await resolveAndGetChannelSession({
      executor,
      agent,
      db,
      envelope: {
        id: "env-daily-expire",
        from: "channel:telegram:chat-1",
        to: "agent:nex",
        fromBoss: false,
        content: { text: "trigger daily-reset-at policy check" },
        status: "pending",
        createdAt: Date.now(),
      },
    });

    const historySessionAfterChat1 = conversationHistory.getCurrentSessionId("nex", "chat-1");
    const historySessionAfterChat2 = conversationHistory.getCurrentSessionId("nex", "chat-2");

    assert.ok(historySessionAfterChat1);
    assert.ok(historySessionAfterChat2);
    assert.notEqual(historySessionAfterChat1, historySessionBeforeChat1);
    assert.equal(historySessionAfterChat2, historySessionBeforeChat2);
  });
});

test("refreshSession closes all recovered history chat scopes after restart", async () => {
  await withTempDb(async ({ db, cliclawDir }) => {
    db.registerAgent({
      name: "nex",
      provider: "codex",
    });

    const dateStr = new Date().toISOString().slice(0, 10);
    const startedAtMs = Date.now() - 1_000;
    const chat1Path = path.join(
      cliclawDir,
      "agents",
      "nex",
      "internal_space",
      "history",
      dateStr,
      "chat-1",
      "s-chat-1.json",
    );
    const chat2Path = path.join(
      cliclawDir,
      "agents",
      "nex",
      "internal_space",
      "history",
      dateStr,
      "chat-2",
      "s-chat-2.json",
    );

    createSessionFile({
      filePath: chat1Path,
      sessionId: "s-chat-1",
      agentName: "nex",
      startedAtMs,
    });
    createSessionFile({
      filePath: chat2Path,
      sessionId: "s-chat-2",
      agentName: "nex",
      startedAtMs: startedAtMs + 1,
    });

    const conversationHistory = new ConversationHistory({
      agentsDir: path.join(cliclawDir, "agents"),
      timezone: "UTC",
    });
    const executor = new AgentExecutor({ db, cliclawDir, conversationHistory });

    await executor.refreshSession("nex", "test-restart-refresh");

    const chat1Session = readSessionFile(chat1Path);
    const chat2Session = readSessionFile(chat2Path);
    assert.ok(chat1Session);
    assert.ok(chat2Session);
    assert.notEqual(chat1Session?.endedAtMs, null);
    assert.notEqual(chat2Session?.endedAtMs, null);
    assert.equal(conversationHistory.getCurrentSessionFilePaths("nex").length, 0);
  });
});
