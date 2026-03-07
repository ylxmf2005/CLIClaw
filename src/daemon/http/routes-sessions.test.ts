import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { CliClawDatabase } from "../db/database.js";
import { HttpRouter } from "./router.js";
import { registerSessionRoutes } from "./routes-sessions.js";
import type { DaemonContext } from "../rpc/context.js";
import { appendPtyHistoryEvent, flushPtyHistoryWritesForTest } from "../terminal/pty-history.js";

function withTempDb(run: (db: CliClawDatabase, rootDir: string) => Promise<void> | void): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cliclaw-routes-sessions-test-"));
  const dbPath = path.join(dir, "cliclaw.db");
  let db: CliClawDatabase | null = null;

  const execute = async () => {
    try {
      db = new CliClawDatabase(dbPath);
      await run(db, dir);
    } finally {
      db?.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };

  return execute();
}

function createRouteContext(params: Record<string, string>, query?: URLSearchParams) {
  return {
    params,
    query: query ?? new URLSearchParams(),
    body: null,
    token: "admin-token",
  };
}

test("GET relay route rehydrates missing relay session when relay state is on", async () => {
  await withTempDb(async (db, rootDir) => {
    db.registerAgent({
      name: "echo-e2e",
      provider: "codex",
      workspace: "/tmp/echo-e2e-workspace",
      model: "gpt-5.3-codex",
    });
    db.setChatRelayState("echo-e2e", "default", true);
    db.setChatModelSettings("echo-e2e", "default", { modelOverride: "gpt-5-codex" });

    const ensureCalls: Array<{
      agentName: string;
      chatId: string;
      provider: "claude" | "codex";
      workspace?: string;
      model?: string;
    }> = [];

    const daemonCtx = {
      db,
      config: { dataDir: rootDir, daemonDir: path.join(rootDir, ".daemon") },
      resolvePrincipal: () => ({ kind: "admin" as const, level: "admin" as const }),
      assertOperationAllowed: () => {},
      relayAvailable: true,
      relayExecutor: {
        ensureSession: async (params: {
          agentName: string;
          chatId: string;
          provider: "claude" | "codex";
          workspace?: string;
          model?: string;
        }) => {
          ensureCalls.push(params);
          return { success: true };
        },
      },
    } as unknown as DaemonContext;

    const router = new HttpRouter();
    registerSessionRoutes(router, {}, daemonCtx);

    const match = router.match("GET", "/api/agents/echo-e2e/chats/default/relay");
    assert.ok(match);

    const result = await match.handler(
      createRouteContext(match.params),
      {} as never,
      {} as never,
    ) as { relayOn: boolean };

    assert.equal(result.relayOn, true);
    assert.equal(ensureCalls.length, 1);
    assert.deepEqual(ensureCalls[0], {
      agentName: "echo-e2e",
      chatId: "default",
      provider: "codex",
      workspace: "/tmp/echo-e2e-workspace",
      model: "gpt-5-codex",
    });
  });
});

test("GET relay route clears stale relay state when session rehydrate fails", async () => {
  await withTempDb(async (db, rootDir) => {
    db.registerAgent({
      name: "echo-e2e",
      provider: "codex",
    });
    db.setChatRelayState("echo-e2e", "default", true);

    const daemonCtx = {
      db,
      config: { dataDir: rootDir, daemonDir: path.join(rootDir, ".daemon") },
      resolvePrincipal: () => ({ kind: "admin" as const, level: "admin" as const }),
      assertOperationAllowed: () => {},
      relayAvailable: true,
      relayExecutor: {
        ensureSession: async () => ({ success: false, error: "spawn failed" }),
      },
    } as unknown as DaemonContext;

    const router = new HttpRouter();
    registerSessionRoutes(router, {}, daemonCtx);

    const match = router.match("GET", "/api/agents/echo-e2e/chats/default/relay");
    assert.ok(match);

    const result = await match.handler(
      createRouteContext(match.params),
      {} as never,
      {} as never,
    ) as { relayOn: boolean };

    assert.equal(result.relayOn, false);
    assert.equal(db.getChatRelayState("echo-e2e", "default"), false);
  });
});

test("GET chat messages route returns full chat timeline (incoming + outgoing)", async () => {
  await withTempDb(async (db, rootDir) => {
    db.registerAgent({
      name: "echo-e2e",
      provider: "codex",
    });

    const inbound = db.createEnvelope({
      from: "channel:console:chat-a",
      to: "agent:echo-e2e:chat-a",
      fromBoss: false,
      content: { text: "hello" },
      metadata: { origin: "console", chatScope: "chat-a" },
    });
    db.updateEnvelopeStatus(inbound.id, "done");

    const outbound = db.createEnvelope({
      from: "agent:echo-e2e",
      to: "channel:console:chat-a",
      fromBoss: false,
      content: { text: "world" },
      metadata: { origin: "internal", chatScope: "chat-a" },
    });
    db.updateEnvelopeStatus(outbound.id, "done");

    const noise = db.createEnvelope({
      from: "agent:echo-e2e",
      to: "channel:console:chat-b",
      fromBoss: false,
      content: { text: "ignore" },
      metadata: { origin: "internal", chatScope: "chat-b" },
    });
    db.updateEnvelopeStatus(noise.id, "done");

    const daemonCtx = {
      db,
      config: { dataDir: rootDir, daemonDir: path.join(rootDir, ".daemon") },
      resolvePrincipal: () => ({ kind: "admin" as const, level: "admin" as const }),
      assertOperationAllowed: () => {},
      relayAvailable: false,
      relayExecutor: null,
    } as unknown as DaemonContext;

    const router = new HttpRouter();
    registerSessionRoutes(router, {}, daemonCtx);

    const match = router.match("GET", "/api/agents/echo-e2e/chats/chat-a/messages");
    assert.ok(match);

    const result = await match.handler(
      createRouteContext(match.params, new URLSearchParams("status=done&limit=20")),
      {} as never,
      {} as never,
    ) as { envelopes: Array<{ id: string }> };

    const ids = result.envelopes.map((item) => item.id);
    assert.ok(ids.includes(inbound.id));
    assert.ok(ids.includes(outbound.id));
    assert.ok(!ids.includes(noise.id));
  });
});

test("GET pty history route returns persisted output chunks for a chat", async () => {
  await withTempDb(async (db, rootDir) => {
    db.registerAgent({
      name: "echo-e2e",
      provider: "codex",
    });

    appendPtyHistoryEvent({
      cliclawDir: rootDir,
      agentName: "echo-e2e",
      chatId: "default",
      direction: "output",
      data: "first chunk\n",
      timestampMs: 1_000,
    });
    appendPtyHistoryEvent({
      cliclawDir: rootDir,
      agentName: "echo-e2e",
      chatId: "default",
      direction: "output",
      data: "second chunk\n",
      timestampMs: 1_001,
    });
    appendPtyHistoryEvent({
      cliclawDir: rootDir,
      agentName: "echo-e2e",
      chatId: "default",
      direction: "input",
      data: "ignored input\r",
      timestampMs: 1_002,
    });
    await flushPtyHistoryWritesForTest();

    const daemonCtx = {
      db,
      config: { dataDir: rootDir, daemonDir: path.join(rootDir, ".daemon") },
      resolvePrincipal: () => ({ kind: "admin" as const, level: "admin" as const }),
      assertOperationAllowed: () => {},
      relayAvailable: false,
      relayExecutor: null,
    } as unknown as DaemonContext;

    const router = new HttpRouter();
    registerSessionRoutes(router, {}, daemonCtx);

    const match = router.match("GET", "/api/agents/echo-e2e/chats/default/pty-history");
    assert.ok(match);

    const result = await match.handler(
      createRouteContext(match.params, new URLSearchParams("limit=10")),
      {} as never,
      {} as never,
    ) as { chunks: string[] };

    assert.deepEqual(result.chunks, ["first chunk\n", "second chunk\n"]);
  });
});
