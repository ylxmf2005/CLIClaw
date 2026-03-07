/**
 * Unit tests for RelayExecutor.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { RelayExecutor } from "./executor-relay.js";
import { buildRelaySessionName } from "../daemon/relay/relay-session-name.js";

// Minimal mock BrokerManager that satisfies the interface used by RelayExecutor.
function createMockBroker(opts: { available?: boolean } = {}) {
  const available = opts.available ?? true;
  const spawnedAgents = new Map<string, boolean>();
  const sendInputCalls: Array<{ name: string; data: string }> = [];
  const spawnCalls: string[] = [];

  return {
    isAvailable: () => available,
    hasAgent: async (name: string) => spawnedAgents.has(name),
    spawnAgent: async (params: { name: string }) => {
      spawnCalls.push(params.name);
      spawnedAgents.set(params.name, true);
      return { success: true };
    },
    releaseAgent: async (name: string) => {
      spawnedAgents.delete(name);
    },
    sendInput: async (name: string, data: string) => {
      sendInputCalls.push({ name, data });
      if (!spawnedAgents.has(name)) {
        throw new Error(`unknown worker '${name}'`);
      }
    },
    sendMessage: async () => {},
    interruptAgent: async (name: string) => spawnedAgents.has(name),
    // expose for assertions
    _spawnedAgents: spawnedAgents,
    _sendInputCalls: sendInputCalls,
    _spawnCalls: spawnCalls,
  };
}

// Minimal mock DB that satisfies the interface used by RelayExecutor.
function createMockDb() {
  const relayStates = new Map<string, boolean>();
  const agents = new Map<
    string,
    { name: string; provider?: "claude" | "codex"; workspace?: string; model?: string }
  >();
  const chatModelSettings = new Map<string, { modelOverride?: string }>();
  return {
    setChatRelayState: (agent: string, chatId: string, enabled: boolean) => {
      relayStates.set(`${agent}:${chatId}`, enabled);
    },
    getChatRelayState: (agent: string, chatId: string) => {
      return relayStates.get(`${agent}:${chatId}`) ?? false;
    },
    registerAgent: (agent: {
      name: string;
      provider?: "claude" | "codex";
      workspace?: string;
      model?: string;
    }) => {
      agents.set(agent.name.toLowerCase(), agent);
    },
    getAgentByNameCaseInsensitive: (agentName: string) => {
      return agents.get(agentName.toLowerCase()) ?? null;
    },
    getChatModelSettings: (agent: string, chatId: string) => {
      return chatModelSettings.get(`${agent}:${chatId}`) ?? {};
    },
    setChatModelSettings: (agent: string, chatId: string, modelOverride: string) => {
      chatModelSettings.set(`${agent}:${chatId}`, { modelOverride });
    },
    _relayStates: relayStates,
    _agents: agents,
    _chatModelSettings: chatModelSettings,
  };
}

describe("RelayExecutor", () => {
  let broker: ReturnType<typeof createMockBroker>;
  let db: ReturnType<typeof createMockDb>;
  let relay: RelayExecutor;

  beforeEach(() => {
    broker = createMockBroker();
    db = createMockDb();
    db.registerAgent({
      name: "nex",
      provider: "claude",
      workspace: "/tmp/nex-workspace",
      model: "sonnet",
    });
    db.registerAgent({
      name: "other",
      provider: "claude",
      workspace: "/tmp/other-workspace",
      model: "sonnet",
    });
    relay = new RelayExecutor({
      broker: broker as any,
      db: db as any,
      cliclawDir: "/tmp/test",
    });
  });

  it("reports relay available when broker is available", () => {
    assert.equal(relay.isRelayAvailable(), true);
  });

  it("reports relay unavailable when broker is unavailable", () => {
    const unavailableBroker = createMockBroker({ available: false });
    const r = new RelayExecutor({
      broker: unavailableBroker as any,
      db: db as any,
      cliclawDir: "/tmp/test",
    });
    assert.equal(r.isRelayAvailable(), false);
  });

  it("ensureSession spawns agent and tracks session", async () => {
    const result = await relay.ensureSession({
      agentName: "nex",
      chatId: "chat-1",
      provider: "claude",
    });
    assert.equal(result.success, true);
    assert.equal(relay.hasActiveSession("nex", "chat-1"), true);
    assert.equal(relay.getActiveSessionCount(), 1);
  });

  it("ensureSession returns error when broker unavailable", async () => {
    const unavailableBroker = createMockBroker({ available: false });
    const r = new RelayExecutor({
      broker: unavailableBroker as any,
      db: db as any,
      cliclawDir: "/tmp/test",
    });
    const result = await r.ensureSession({
      agentName: "nex",
      chatId: "chat-1",
      provider: "claude",
    });
    assert.equal(result.success, false);
  });

  it("ensureSession is idempotent for same agent+chat", async () => {
    await relay.ensureSession({ agentName: "nex", chatId: "chat-1", provider: "claude" });
    await relay.ensureSession({ agentName: "nex", chatId: "chat-1", provider: "claude" });
    assert.equal(relay.getActiveSessionCount(), 1);
  });

  it("injectEnvelope returns error when no session", async () => {
    const result = await relay.injectEnvelope({
      agentName: "nex",
      chatId: "chat-1",
      text: "hello",
    });
    assert.equal(result.success, false);
  });

  it("injectEnvelope succeeds with active session", async () => {
    await relay.ensureSession({ agentName: "nex", chatId: "chat-1", provider: "claude" });
    const result = await relay.injectEnvelope({
      agentName: "nex",
      chatId: "chat-1",
      text: "hello",
    });
    assert.equal(result.success, true);
  });

  it("enableRelay persists state and spawns session", async () => {
    const result = await relay.enableRelay({
      agentName: "nex",
      chatId: "chat-1",
      provider: "claude",
    });
    assert.equal(result.success, true);
    assert.equal(db._relayStates.get("nex:chat-1"), true);
    assert.equal(relay.hasActiveSession("nex", "chat-1"), true);
  });

  it("disableRelay clears state and releases session", async () => {
    await relay.enableRelay({ agentName: "nex", chatId: "chat-1", provider: "claude" });
    await relay.disableRelay("nex", "chat-1");
    assert.equal(db._relayStates.get("nex:chat-1"), false);
    assert.equal(relay.hasActiveSession("nex", "chat-1"), false);
  });

  it("releaseAllForAgent releases only that agent's sessions", async () => {
    await relay.ensureSession({ agentName: "nex", chatId: "chat-1", provider: "claude" });
    await relay.ensureSession({ agentName: "nex", chatId: "chat-2", provider: "claude" });
    await relay.ensureSession({ agentName: "other", chatId: "chat-1", provider: "claude" });
    assert.equal(relay.getActiveSessionCount(), 3);

    await relay.releaseAllForAgent("nex");
    assert.equal(relay.getActiveSessionCount(), 1);
    assert.equal(relay.hasActiveSession("other", "chat-1"), true);
  });

  it("releaseAll clears all sessions", async () => {
    await relay.ensureSession({ agentName: "nex", chatId: "chat-1", provider: "claude" });
    await relay.ensureSession({ agentName: "other", chatId: "chat-2", provider: "claude" });
    await relay.releaseAll();
    assert.equal(relay.getActiveSessionCount(), 0);
  });

  it("interruptAgent returns false when no session", async () => {
    const result = await relay.interruptAgent("nex", "chat-1");
    assert.equal(result, false);
  });

  it("interruptAgent returns true with active session", async () => {
    await relay.ensureSession({ agentName: "nex", chatId: "chat-1", provider: "claude" });
    const result = await relay.interruptAgent("nex", "chat-1");
    assert.equal(result, true);
  });

  it("sendInput auto-restores a missing relay session when relay is on", async () => {
    db.setChatRelayState("nex", "chat-1", true);
    const relayName = buildRelaySessionName("nex", "chat-1");

    const result = await relay.sendInput("nex", "chat-1", "hello");

    assert.equal(result.success, true);
    assert.equal(relay.hasActiveSession("nex", "chat-1"), true);
    assert.equal(broker._spawnedAgents.has(relayName), true);
    assert.deepEqual(broker._sendInputCalls, [{ name: relayName, data: "hello" }]);
  });

  it("sendInput heals stale unknown-worker sessions and retries once", async () => {
    await relay.enableRelay({ agentName: "nex", chatId: "chat-1", provider: "claude" });
    const relayName = buildRelaySessionName("nex", "chat-1");

    // Simulate daemon-restart drift: cache says session exists, broker no longer has worker.
    broker._spawnedAgents.delete(relayName);

    const result = await relay.sendInput("nex", "chat-1", "world");

    assert.equal(result.success, true);
    assert.equal(db._relayStates.get("nex:chat-1"), true);
    assert.deepEqual(
      broker._sendInputCalls.map((call) => call.data),
      ["world", "world"]
    );
    assert.equal(broker._spawnCalls.filter((name) => name === relayName).length, 2);
  });

  it("sendInput disables stale relay state when restore fails", async () => {
    db.setChatRelayState("nex", "chat-1", true);
    broker.spawnAgent = async () => ({ success: false, error: "spawn failed" });

    const result = await relay.sendInput("nex", "chat-1", "hello");

    assert.equal(result.success, false);
    assert.equal(db._relayStates.get("nex:chat-1"), false);
  });
});
