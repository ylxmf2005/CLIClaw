import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { CliClawDatabase } from "../db/database.js";
import { CronScheduler } from "./cron-scheduler.js";

function withTempDb(run: (db: CliClawDatabase) => Promise<void> | void): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cliclaw-cron-scheduler-test-"));
  const dbPath = path.join(dir, "cliclaw.db");
  const db = new CliClawDatabase(dbPath);

  return Promise.resolve()
    .then(() => run(db))
    .finally(() => {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    });
}

function createScheduler(db: CliClawDatabase): CronScheduler {
  return new CronScheduler(
    db,
    { onEnvelopeCreated: () => undefined } as any,
  );
}

for (const mode of ["isolated", "clone"] as const) {
  test(`cron one-shot (${mode}) to agent target executes destination agent`, async () => {
    await withTempDb((db) => {
      db.registerAgent({ name: "Shieru", provider: "codex" });
      db.registerAgent({ name: "MolBot", provider: "codex" });

      const scheduler = createScheduler(db);
      const { schedule } = scheduler.createSchedule({
        agentName: "Shieru",
        cron: "* * * * *",
        to: "agent:MolBot",
        content: { text: "ping" },
        metadata: { executionMode: mode },
      });

      assert.ok(schedule.pendingEnvelopeId);
      const envelope = db.getEnvelopeById(schedule.pendingEnvelopeId!);
      assert.ok(envelope);
      assert.equal(envelope!.from, "agent:Shieru");
      assert.equal(envelope!.to, "agent:MolBot");

      const metadata = envelope!.metadata as Record<string, unknown> | undefined;
      assert.equal(metadata?.oneshotType, mode);
      assert.equal(metadata?.cronResponseTo, undefined);
    });
  });
}

test("cron inline mode to agent target keeps normal destination and no oneshot metadata", async () => {
  await withTempDb((db) => {
    db.registerAgent({ name: "Shieru", provider: "codex" });
    db.registerAgent({ name: "MolBot", provider: "codex" });

    const scheduler = createScheduler(db);
    const { schedule } = scheduler.createSchedule({
      agentName: "Shieru",
      cron: "* * * * *",
      to: "agent:MolBot",
      content: { text: "ping" },
      metadata: { executionMode: "inline" },
    });

    assert.ok(schedule.pendingEnvelopeId);
    const envelope = db.getEnvelopeById(schedule.pendingEnvelopeId!);
    assert.ok(envelope);
    assert.equal(envelope!.from, "agent:Shieru");
    assert.equal(envelope!.to, "agent:MolBot");

    const metadata = envelope!.metadata as Record<string, unknown> | undefined;
    assert.equal(metadata?.oneshotType, undefined);
    assert.equal(metadata?.cronResponseTo, undefined);
  });
});

test("cron one-shot to channel runs owner agent and stores cronResponseTo", async () => {
  await withTempDb((db) => {
    db.registerAgent({ name: "Shieru", provider: "codex" });
    db.createBinding("Shieru", "telegram", "binding-token");

    const scheduler = createScheduler(db);
    const { schedule } = scheduler.createSchedule({
      agentName: "Shieru",
      cron: "* * * * *",
      to: "channel:telegram:chat-1",
      content: { text: "summarize updates" },
      metadata: { executionMode: "isolated" },
    });

    assert.ok(schedule.pendingEnvelopeId);
    const envelope = db.getEnvelopeById(schedule.pendingEnvelopeId!);
    assert.ok(envelope);
    assert.equal(envelope!.from, "agent:Shieru");
    assert.equal(envelope!.to, "agent:Shieru");

    const metadata = envelope!.metadata as Record<string, unknown> | undefined;
    assert.equal(metadata?.oneshotType, "isolated");
    assert.equal(metadata?.cronResponseTo, "channel:telegram:chat-1");
  });
});
