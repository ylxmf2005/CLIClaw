import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { CliClawDatabase } from "../db/database.js";

function withTempDb(run: (db: CliClawDatabase) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cliclaw-session-chat-test-"));
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

// ==================== session.list tests ====================

test("listAgentSessionsByAgent returns sessions for an agent", () => {
  withTempDb((db) => {
    db.registerAgent({ name: "nex", provider: "codex" });

    // Create a session
    const session = db.createAgentSession({
      agentName: "nex",
      provider: "codex",
    });

    const sessions = db.listAgentSessionsByAgent("nex");
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].id, session.id);
    assert.equal(sessions[0].agentName, "nex");
    assert.equal(sessions[0].provider, "codex");
  });
});

test("listAgentSessionsByAgent returns empty array for agent with no sessions", () => {
  withTempDb((db) => {
    db.registerAgent({ name: "nex", provider: "codex" });
    const sessions = db.listAgentSessionsByAgent("nex");
    assert.equal(sessions.length, 0);
  });
});

test("listAgentSessionsByAgent respects limit", () => {
  withTempDb((db) => {
    db.registerAgent({ name: "nex", provider: "codex" });
    for (let i = 0; i < 5; i++) {
      db.createAgentSession({ agentName: "nex", provider: "codex" });
    }

    const sessions = db.listAgentSessionsByAgent("nex", 3);
    assert.equal(sessions.length, 3);
  });
});

// ==================== relayMode tests ====================

test("agent relayMode defaults to default-off in schema", () => {
  withTempDb((db) => {
    const { agent } = db.registerAgent({ name: "nex", provider: "codex" });
    assert.equal(agent.relayMode, "default-off");
  });
});

test("updateAgentFields can set relayMode to default-on", () => {
  withTempDb((db) => {
    db.registerAgent({ name: "nex", provider: "codex" });

    const updated = db.updateAgentFields("nex", { relayMode: "default-on" });
    assert.equal(updated.relayMode, "default-on");
  });
});

test("updateAgentFields can clear relayMode to null (becomes undefined)", () => {
  withTempDb((db) => {
    db.registerAgent({ name: "nex", provider: "codex" });
    db.updateAgentFields("nex", { relayMode: "default-on" });

    const updated = db.updateAgentFields("nex", { relayMode: null });
    // null relay_mode maps to undefined in Agent type
    assert.equal(updated.relayMode, undefined);
  });
});

// ==================== chat_state tests ====================

test("getChatRelayState returns false for unknown chat", () => {
  withTempDb((db) => {
    const state = db.getChatRelayState("nex", "chat-1");
    assert.equal(state, false);
  });
});

test("setChatRelayState persists relay state", () => {
  withTempDb((db) => {
    db.setChatRelayState("nex", "chat-1", true);
    assert.equal(db.getChatRelayState("nex", "chat-1"), true);

    db.setChatRelayState("nex", "chat-1", false);
    assert.equal(db.getChatRelayState("nex", "chat-1"), false);
  });
});

test("setChatRelayState upserts on conflict", () => {
  withTempDb((db) => {
    db.setChatRelayState("nex", "chat-1", true);
    db.setChatRelayState("nex", "chat-1", false);
    assert.equal(db.getChatRelayState("nex", "chat-1"), false);
  });
});

test("getChatModelSettings returns empty settings for unknown chat", () => {
  withTempDb((db) => {
    const settings = db.getChatModelSettings("nex", "chat-1");
    assert.deepEqual(settings, {});
  });
});

test("setChatModelSettings persists model and reasoning overrides", () => {
  withTempDb((db) => {
    db.setChatModelSettings("nex", "chat-1", {
      modelOverride: "gpt-5.3-codex",
      reasoningEffortOverride: "high",
    });
    const settings = db.getChatModelSettings("nex", "chat-1");
    assert.equal(settings.modelOverride, "gpt-5.3-codex");
    assert.equal(settings.reasoningEffortOverride, "high");
  });
});

test("setChatModelSettings can clear overrides back to defaults", () => {
  withTempDb((db) => {
    db.setChatModelSettings("nex", "chat-1", {
      modelOverride: "gpt-5.3-codex",
      reasoningEffortOverride: "high",
    });
    db.setChatModelSettings("nex", "chat-1", {
      modelOverride: null,
      reasoningEffortOverride: null,
    });

    const settings = db.getChatModelSettings("nex", "chat-1");
    assert.deepEqual(settings, {});
  });
});

test("setChatRelayState keeps chat model overrides unchanged", () => {
  withTempDb((db) => {
    db.setChatModelSettings("nex", "chat-1", {
      modelOverride: "gpt-5.3-codex",
      reasoningEffortOverride: "high",
    });
    db.setChatRelayState("nex", "chat-1", true);

    const settings = db.getChatModelSettings("nex", "chat-1");
    assert.equal(settings.modelOverride, "gpt-5.3-codex");
    assert.equal(settings.reasoningEffortOverride, "high");
  });
});

test("listChatRelayStates returns all states for agent", () => {
  withTempDb((db) => {
    db.setChatRelayState("nex", "chat-1", true);
    db.setChatRelayState("nex", "chat-2", false);
    db.setChatRelayState("shieru", "chat-3", true);

    const states = db.listChatRelayStates("nex");
    assert.equal(states.length, 2);

    const chat1 = states.find((s) => s.chatId === "chat-1");
    assert.equal(chat1?.relayOn, true);

    const chat2 = states.find((s) => s.chatId === "chat-2");
    assert.equal(chat2?.relayOn, false);
  });
});

test("deleteChatStateForAgent removes all chat states for agent", () => {
  withTempDb((db) => {
    db.setChatRelayState("nex", "chat-1", true);
    db.setChatRelayState("nex", "chat-2", true);
    db.setChatRelayState("shieru", "chat-3", true);

    db.deleteChatStateForAgent("nex");

    assert.equal(db.listChatRelayStates("nex").length, 0);
    assert.equal(db.listChatRelayStates("shieru").length, 1);
  });
});
