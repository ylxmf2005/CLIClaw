import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CliClawDatabase } from "./database.js";

function withTempDb(run: (db: CliClawDatabase) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cliclaw-db-test-"));
  const dbPath = path.join(dir, "cliclaw.db");
  const db = new CliClawDatabase(dbPath);
  try {
    run(db);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function waitNextMillisecond(): void {
  const now = Date.now();
  while (Date.now() === now) {
    // Busy-wait to ensure deterministic created_at ordering in tests.
  }
}

test("registerAgent persists and lists agents", () => {
  withTempDb((db) => {
    db.registerAgent({
      name: "agent-a",
      provider: "codex",
    });
    db.registerAgent({
      name: "agent-b",
      provider: "codex",
    });

    const names = db.listAgents().map((agent) => agent.name).sort();
    assert.deepEqual(names, ["agent-a", "agent-b"]);
  });
});

test("envelopes default priority to 0", () => {
  withTempDb((db) => {
    const env = db.createEnvelope({
      from: "agent:sender",
      to: "agent:receiver",
      content: { text: "hello" },
    });

    const stored = db.getEnvelopeById(env.id);
    assert.ok(stored);
    assert.equal(stored.priority, 0);
  });
});

test("getPendingEnvelopesForAgent prioritizes higher priority envelopes first", () => {
  withTempDb((db) => {
    db.registerAgent({
      name: "nex",
      provider: "codex",
    });

    const low1 = db.createEnvelope({
      from: "agent:sender",
      to: "agent:nex",
      content: { text: "low-1" },
      priority: 0,
    });
    const high = db.createEnvelope({
      from: "agent:sender",
      to: "agent:nex",
      content: { text: "high" },
      priority: 1,
    });
    const low2 = db.createEnvelope({
      from: "agent:sender",
      to: "agent:nex",
      content: { text: "low-2" },
      priority: 0,
    });

    const pending = db.getPendingEnvelopesForAgent("nex", 10);
    assert.deepEqual(
      pending.map((item) => item.id),
      [high.id, low1.id, low2.id]
    );
  });
});

test("envelope lifecycle hooks emit created and status-changed events", () => {
  withTempDb((db) => {
    const created: Array<{ id: string; origin: string }> = [];
    const statusChanged: Array<{ id: string; fromStatus: string; toStatus: string; reason?: string; outcome?: string }> = [];

    db.setEnvelopeLifecycleHooks({
      onEnvelopeCreated: (event) => {
        created.push({
          id: event.envelope.id,
          origin: event.origin,
        });
      },
      onEnvelopeStatusChanged: (event) => {
        statusChanged.push({
          id: event.envelopeId,
          fromStatus: event.fromStatus,
          toStatus: event.toStatus,
          reason: event.reason,
          outcome: event.outcome,
        });
      },
    });

    const env = db.createEnvelope({
      from: "agent:sender",
      to: "agent:receiver",
      content: { text: "hi" },
      metadata: { origin: "cli" },
    });
    db.updateEnvelopeStatus(env.id, "done", {
      reason: "test-status",
      outcome: "ok",
      origin: "internal",
    });

    assert.deepEqual(created, [{ id: env.id, origin: "cli" }]);
    assert.deepEqual(statusChanged, [{
      id: env.id,
      fromStatus: "pending",
      toStatus: "done",
      reason: "test-status",
      outcome: "ok",
    }]);
  });
});

test("markEnvelopesDone emits only pending->done status transitions", () => {
  withTempDb((db) => {
    const statusChanged: Array<{ id: string; fromStatus: string; toStatus: string }> = [];
    db.setEnvelopeLifecycleHooks({
      onEnvelopeStatusChanged: (event) => {
        statusChanged.push({
          id: event.envelopeId,
          fromStatus: event.fromStatus,
          toStatus: event.toStatus,
        });
      },
    });

    const e1 = db.createEnvelope({
      from: "agent:a",
      to: "agent:b",
      content: { text: "p1" },
    });
    const e2 = db.createEnvelope({
      from: "agent:a",
      to: "agent:b",
      content: { text: "p2" },
    });
    db.updateEnvelopeStatus(e2.id, "done");

    db.markEnvelopesDone([e1.id, e2.id], { reason: "bulk-ack" });

    assert.deepEqual(
      statusChanged.map((item) => `${item.id}:${item.fromStatus}->${item.toStatus}`),
      [
        `${e2.id}:pending->done`,
        `${e1.id}:pending->done`,
      ]
    );
  });
});

test("listEnvelopesForAgentChat returns a full bidirectional timeline", () => {
  withTempDb((db) => {
    db.registerAgent({
      name: "nex",
      provider: "codex",
    });

    const incoming = db.createEnvelope({
      from: "channel:console:chat-a",
      to: "agent:nex:chat-a",
      content: { text: "hello" },
      metadata: { origin: "console", chatScope: "chat-a" },
    });
    db.updateEnvelopeStatus(incoming.id, "done");

    waitNextMillisecond();
    const outgoing = db.createEnvelope({
      from: "agent:nex",
      to: "channel:console:chat-a",
      content: { text: "reply" },
      metadata: { origin: "internal", chatScope: "chat-a" },
    });
    db.updateEnvelopeStatus(outgoing.id, "done");

    waitNextMillisecond();
    const legacyInbound = db.createEnvelope({
      from: "channel:telegram:1234",
      to: "agent:nex",
      content: { text: "legacy" },
      metadata: {
        origin: "channel",
        chat: { id: "chat-a" },
      },
    });
    db.updateEnvelopeStatus(legacyInbound.id, "done");

    const otherChat = db.createEnvelope({
      from: "agent:nex",
      to: "channel:console:chat-b",
      content: { text: "ignore" },
      metadata: { origin: "internal", chatScope: "chat-b" },
    });
    db.updateEnvelopeStatus(otherChat.id, "done");

    const timeline = db.listEnvelopesForAgentChat({
      agentName: "nex",
      chatId: "chat-a",
      status: "done",
      limit: 20,
    });

    const ids = timeline.map((item) => item.id);
    assert.ok(ids.includes(incoming.id));
    assert.ok(ids.includes(outgoing.id));
    assert.ok(ids.includes(legacyInbound.id));
    assert.ok(!ids.includes(otherChat.id));
  });
});

test("listConversationsForAgent groups chat ids from incoming and outgoing envelopes", () => {
  withTempDb((db) => {
    db.registerAgent({
      name: "nex",
      provider: "codex",
    });

    const chatA1 = db.createEnvelope({
      from: "channel:console:chat-a",
      to: "agent:nex:chat-a",
      content: { text: "chat-a inbound" },
      metadata: { origin: "console", chatScope: "chat-a" },
    });
    db.updateEnvelopeStatus(chatA1.id, "done");

    waitNextMillisecond();
    const chatA2 = db.createEnvelope({
      from: "agent:nex",
      to: "channel:console:chat-a",
      content: { text: "chat-a outbound" },
      metadata: { origin: "internal", chatScope: "chat-a" },
    });
    db.updateEnvelopeStatus(chatA2.id, "done");

    waitNextMillisecond();
    const chatB = db.createEnvelope({
      from: "agent:nex",
      to: "channel:console:chat-b",
      content: { text: "chat-b outbound" },
      metadata: { origin: "internal", chatScope: "chat-b" },
    });
    db.updateEnvelopeStatus(chatB.id, "done");

    waitNextMillisecond();
    const chatC = db.createEnvelope({
      from: "channel:telegram:9876",
      to: "agent:nex",
      content: { text: "chat-c legacy" },
      metadata: { origin: "channel", chat: { id: "chat-c" } },
    });
    db.updateEnvelopeStatus(chatC.id, "done");

    const conversations = db.listConversationsForAgent("nex");
    const byChat = new Map(conversations.map((item) => [item.chatId, item]));

    assert.equal(byChat.get("chat-a")?.messageCount, 2);
    assert.equal(byChat.get("chat-a")?.lastMessageText, "chat-a outbound");

    assert.equal(byChat.get("chat-b")?.messageCount, 1);
    assert.equal(byChat.get("chat-b")?.lastMessageText, "chat-b outbound");

    assert.equal(byChat.get("chat-c")?.messageCount, 1);
    assert.equal(byChat.get("chat-c")?.lastMessageText, "chat-c legacy");
  });
});
