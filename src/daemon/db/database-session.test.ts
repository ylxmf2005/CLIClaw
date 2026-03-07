import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { CliClawDatabase } from "./database.js";

function withTempDb(run: (db: CliClawDatabase) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cliclaw-db-session-test-"));
  const dbPath = path.join(dir, "cliclaw.db");
  let db: CliClawDatabase | null = null;
  try {
    db = new CliClawDatabase(dbPath);
    run(db);
  } finally {
    db?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("channel session mapping creates once and switches session", () => {
  withTempDb((db) => {
    db.registerAgent({
      name: "nex",
      provider: "codex",
    });

    const first = db.getOrCreateChannelSession({
      agentName: "nex",
      adapterType: "telegram",
      chatId: "chat-1",
      ownerUserId: "u-1",
      provider: "codex",
    });
    assert.equal(first.created, true);

    const second = db.getOrCreateChannelSession({
      agentName: "nex",
      adapterType: "telegram",
      chatId: "chat-1",
      ownerUserId: "u-1",
      provider: "codex",
    });
    assert.equal(second.created, false);
    assert.equal(second.session.id, first.session.id);

    const other = db.getOrCreateChannelSession({
      agentName: "nex",
      adapterType: "telegram",
      chatId: "chat-2",
      ownerUserId: "u-1",
      provider: "codex",
    });

    const switched = db.switchChannelSession({
      agentName: "nex",
      adapterType: "telegram",
      chatId: "chat-1",
      targetSessionId: other.session.id,
      ownerUserId: "u-1",
    });

    assert.equal(switched.oldSessionId, first.session.id);
    assert.equal(switched.newSessionId, other.session.id);

    const binding = db.getChannelSessionBinding("nex", "telegram", "chat-1");
    assert.ok(binding);
    assert.equal(binding.sessionId, other.session.id);
  });
});

test("list sessions scope respects current chat, owner, and agent-wide visibility", () => {
  withTempDb((db) => {
    db.registerAgent({
      name: "nex",
      provider: "codex",
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
    const s3 = db.getOrCreateChannelSession({
      agentName: "nex",
      adapterType: "telegram",
      chatId: "chat-3",
      ownerUserId: "u-2",
      provider: "codex",
    }).session;

    const current = db.listSessionsForScope({
      agentName: "nex",
      scope: "current-chat",
      adapterType: "telegram",
      chatId: "chat-1",
      ownerUserId: "u-1",
      limit: 10,
      offset: 0,
    });
    assert.equal(current.length, 1);
    assert.equal(current[0]?.session.id, s1.id);

    const mine = db.listSessionsForScope({
      agentName: "nex",
      scope: "my-chats",
      adapterType: "telegram",
      chatId: "chat-1",
      ownerUserId: "u-1",
      limit: 10,
      offset: 0,
    });
    const mineIds = new Set(mine.map((item) => item.session.id));
    assert.equal(mineIds.has(s1.id), true);
    assert.equal(mineIds.has(s2.id), true);
    assert.equal(mineIds.has(s3.id), false);

    const all = db.listSessionsForScope({
      agentName: "nex",
      scope: "agent-all",
      adapterType: "telegram",
      chatId: "chat-1",
      ownerUserId: "u-1",
      limit: 10,
      offset: 0,
    });
    const allIds = new Set(all.map((item) => item.session.id));
    assert.equal(allIds.has(s1.id), true);
    assert.equal(allIds.has(s2.id), true);
    assert.equal(allIds.has(s3.id), true);

    assert.equal(
      db.countSessionsForScope({
        agentName: "nex",
        scope: "my-chats",
        adapterType: "telegram",
        chatId: "chat-1",
        ownerUserId: "u-1",
      }),
      2
    );
  });
});

test("listConversationsForAgent excludes team chat scopes", () => {
  withTempDb((db) => {
    db.registerAgent({
      name: "nex",
      provider: "codex",
    });

    const direct = db.createEnvelope({
      from: "channel:web:boss",
      to: "agent:nex:chat-1",
      fromBoss: true,
      content: { text: "direct chat" },
    });
    db.updateEnvelopeStatus(direct.id, "done");

    const team = db.createEnvelope({
      from: "channel:web:boss",
      to: "agent:nex:team:alpha",
      fromBoss: true,
      content: { text: "team chat" },
    });
    db.updateEnvelopeStatus(team.id, "done");

    const conversations = db.listConversationsForAgent("nex");
    assert.deepEqual(
      conversations.map((item) => item.chatId),
      ["chat-1"]
    );
  });
});

test("opening a legacy database migrates agent session label fields before schema validation", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cliclaw-db-session-legacy-"));
  const dbPath = path.join(dir, "cliclaw.db");

  const legacyDb = new Database(dbPath);
  legacyDb.exec(`
    CREATE TABLE agent_sessions (
      id TEXT PRIMARY KEY,
      agent_name TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_session_id TEXT,
      created_at INTEGER NOT NULL,
      last_active_at INTEGER NOT NULL,
      last_adapter_type TEXT,
      last_chat_id TEXT
    );
  `);
  legacyDb.close();

  let db: CliClawDatabase | null = null;
  let migratedDb: Database.Database | null = null;
  try {
    db = new CliClawDatabase(dbPath);
    db.close();
    db = null;

    migratedDb = new Database(dbPath, { readonly: true });
    const columns = migratedDb
      .prepare("PRAGMA table_info(agent_sessions)")
      .all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((column) => column.name));

    assert.equal(columnNames.has("label"), true);
    assert.equal(columnNames.has("pinned"), true);
  } finally {
    migratedDb?.close();
    db?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("runtime session concurrency falls back to defaults and persists configured values", () => {
  withTempDb((db) => {
    assert.deepEqual(db.getRuntimeSessionConcurrency(), { perAgent: 4, global: 16 });

    db.setRuntimeSessionConcurrency({ perAgent: 6, global: 20 });
    assert.deepEqual(db.getRuntimeSessionConcurrency(), { perAgent: 6, global: 20 });

    db.setRuntimeSessionConcurrency({ perAgent: 7, global: 3 });
    assert.deepEqual(db.getRuntimeSessionConcurrency(), { perAgent: 7, global: 7 });
  });
});

test("runtime session summary config falls back to defaults and persists configured values", () => {
  withTempDb((db) => {
    assert.deepEqual(db.getRuntimeSessionSummaryConfig(), {
      recentDays: 3,
      perSessionMaxChars: 24000,
      maxRetries: 3,
    });

    db.setRuntimeSessionSummaryConfig({
      recentDays: 5,
      perSessionMaxChars: 30000,
      maxRetries: 2,
    });
    assert.deepEqual(db.getRuntimeSessionSummaryConfig(), {
      recentDays: 5,
      perSessionMaxChars: 30000,
      maxRetries: 2,
    });

    db.setRuntimeSessionSummaryConfig({
      recentDays: 999,
      perSessionMaxChars: 100,
      maxRetries: 999,
    });
    assert.deepEqual(db.getRuntimeSessionSummaryConfig(), {
      recentDays: 30,
      perSessionMaxChars: 1000,
      maxRetries: 20,
    });
  });
});

test("runtime telegram command reply auto-delete falls back to default and can be disabled", () => {
  withTempDb((db) => {
    assert.equal(db.getRuntimeTelegramCommandReplyAutoDeleteSeconds(), 30);

    db.setRuntimeTelegramCommandReplyAutoDeleteSeconds(45);
    assert.equal(db.getRuntimeTelegramCommandReplyAutoDeleteSeconds(), 45);

    db.setRuntimeTelegramCommandReplyAutoDeleteSeconds(0);
    assert.equal(db.getRuntimeTelegramCommandReplyAutoDeleteSeconds(), 0);

    db.setRuntimeTelegramCommandReplyAutoDeleteSeconds(999999);
    assert.equal(db.getRuntimeTelegramCommandReplyAutoDeleteSeconds(), 86400);
  });
});

test("runtime telegram inbound interrupt window falls back to default and can be disabled", () => {
  withTempDb((db) => {
    assert.equal(db.getRuntimeTelegramInboundInterruptWindowSeconds(), 3);

    db.setRuntimeTelegramInboundInterruptWindowSeconds(5);
    assert.equal(db.getRuntimeTelegramInboundInterruptWindowSeconds(), 5);

    db.setRuntimeTelegramInboundInterruptWindowSeconds(0);
    assert.equal(db.getRuntimeTelegramInboundInterruptWindowSeconds(), 0);

    db.setRuntimeTelegramInboundInterruptWindowSeconds(999999);
    assert.equal(db.getRuntimeTelegramInboundInterruptWindowSeconds(), 60);
  });
});
