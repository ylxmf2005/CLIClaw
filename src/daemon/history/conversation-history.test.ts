import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { Envelope } from "../../envelope/types.js";
import { ConversationHistory } from "./conversation-history.js";
import { closeActiveSession } from "./session-close.js";
import { getSessionJournalPath, readSessionFile, readSessionJournalEvents } from "./session-file-io.js";
import { getSessionMarkdownPath, readSessionMarkdownFile } from "./session-markdown-file-io.js";

async function withTempAgentsDir(run: (agentsDir: string) => Promise<void> | void): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cliclaw-history-test-"));
  try {
    await run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function makeEnvelope(params: {
  id: string;
  from: string;
  to: string;
  text?: string;
}): Envelope {
  return {
    id: params.id,
    from: params.from,
    to: params.to,
    fromBoss: false,
    content: params.text
      ? { text: params.text }
      : {
          attachments: [{ source: "/tmp/file.bin" }],
        },
    status: "pending",
    createdAt: Date.now(),
    metadata: { origin: "internal" },
  };
}

test("appendEnvelopeCreated appends JSONL event log immediately and compacts on session close", async () => {
  await withTempAgentsDir(async (agentsDir) => {
    const history = new ConversationHistory({ agentsDir, timezone: "UTC" });
    const envelope = makeEnvelope({
      id: "env-a",
      from: "agent:alpha",
      to: "agent:beta",
    });

    history.appendEnvelopeCreated({
      envelope,
      origin: "internal",
      timestampMs: envelope.createdAt,
    });

    const alphaPath = history.getCurrentSessionFilePath("alpha");
    const betaPath = history.getCurrentSessionFilePath("beta");
    assert.ok(alphaPath);
    assert.ok(betaPath);

    assert.equal(readSessionFile(alphaPath!)?.events.length, 0);
    assert.equal(readSessionFile(betaPath!)?.events.length, 0);
    assert.equal(readSessionJournalEvents(alphaPath!).length, 1);
    assert.equal(readSessionJournalEvents(betaPath!).length, 1);
    assert.equal(readSessionMarkdownFile(getSessionMarkdownPath(alphaPath!)), null);
    assert.equal(readSessionMarkdownFile(getSessionMarkdownPath(betaPath!)), null);

    const endedAtMs = Date.now();
    closeActiveSession({ history, agentName: "alpha", endedAtMs });
    closeActiveSession({ history, agentName: "beta", endedAtMs });

    const alpha = readSessionFile(alphaPath!);
    const beta = readSessionFile(betaPath!);
    assert.ok(alpha);
    assert.ok(beta);
    assert.equal(alpha?.events.length, 1);
    assert.equal(beta?.events.length, 1);
    assert.equal(alpha?.events[0]?.type, "envelope-created");
    assert.equal(beta?.events[0]?.type, "envelope-created");
    assert.equal(alpha?.endedAtMs, endedAtMs);
    assert.equal(beta?.endedAtMs, endedAtMs);
    assert.equal(fs.existsSync(getSessionJournalPath(alphaPath!)), true);
    assert.equal(fs.existsSync(getSessionJournalPath(betaPath!)), true);

    const alphaMd = readSessionMarkdownFile(getSessionMarkdownPath(alphaPath!));
    const betaMd = readSessionMarkdownFile(getSessionMarkdownPath(betaPath!));
    assert.ok(alphaMd);
    assert.ok(betaMd);
    assert.ok(alphaMd?.body.includes("from: agent:alpha"));
    assert.ok(betaMd?.body.includes("to: agent:beta"));
    assert.equal(alphaMd?.frontmatter.summaryStatus, "pending");
    assert.equal(betaMd?.frontmatter.summaryStatus, "pending");
  });
});

test("appendStatusChange is persisted only when session closes", async () => {
  await withTempAgentsDir(async (agentsDir) => {
    const history = new ConversationHistory({ agentsDir, timezone: "UTC" });
    const envelope = makeEnvelope({
      id: "env-b",
      from: "agent:alpha",
      to: "agent:beta",
      text: "hello",
    });

    history.appendEnvelopeCreated({
      envelope,
      origin: "internal",
      timestampMs: envelope.createdAt,
    });
    history.appendStatusChange({
      envelope: {
        ...envelope,
        status: "done",
      },
      fromStatus: "pending",
      toStatus: "done",
      timestampMs: Date.now(),
      origin: "internal",
      reason: "test-change",
      outcome: "executed",
    });

    const alphaPath = history.getCurrentSessionFilePath("alpha");
    const betaPath = history.getCurrentSessionFilePath("beta");
    assert.ok(alphaPath);
    assert.ok(betaPath);
    assert.equal(readSessionFile(alphaPath!)?.events.length, 0);
    assert.equal(readSessionFile(betaPath!)?.events.length, 0);
    assert.equal(readSessionJournalEvents(alphaPath!).length, 2);
    assert.equal(readSessionJournalEvents(betaPath!).length, 2);

    closeActiveSession({ history, agentName: "alpha" });
    closeActiveSession({ history, agentName: "beta" });

    const alpha = readSessionFile(alphaPath!);
    const beta = readSessionFile(betaPath!);
    assert.ok(alpha);
    assert.ok(beta);
    assert.equal(alpha?.events.length, 2);
    assert.equal(beta?.events.length, 2);
    assert.equal(alpha?.events[1]?.type, "envelope-status-changed");
    assert.equal(beta?.events[1]?.type, "envelope-status-changed");
  });
});

test("channel envelopes are stored under chat-id directory", async () => {
  await withTempAgentsDir(async (agentsDir) => {
    const history = new ConversationHistory({ agentsDir, timezone: "UTC" });
    const envelope = makeEnvelope({
      id: "env-channel",
      from: "channel:telegram:-10055",
      to: "agent:alpha",
      text: "hi",
    });

    history.appendEnvelopeCreated({
      envelope,
      origin: "channel",
      timestampMs: envelope.createdAt,
    });

    const alphaPath = history.getCurrentSessionFilePath("alpha");
    assert.ok(alphaPath);
    assert.ok(alphaPath?.includes(`${path.sep}-10055${path.sep}`));
    assert.equal(fs.existsSync(alphaPath!), true);
    assert.equal(readSessionFile(alphaPath!)?.events.length, 0);
    assert.equal(readSessionJournalEvents(alphaPath!).length, 1);
  });
});

test("channel envelopes in different chats keep isolated active sessions", async () => {
  await withTempAgentsDir(async (agentsDir) => {
    const history = new ConversationHistory({ agentsDir, timezone: "UTC" });
    const envChat1 = makeEnvelope({
      id: "env-chat-1",
      from: "channel:telegram:chat-1",
      to: "agent:alpha",
      text: "from chat 1",
    });
    const envChat2 = makeEnvelope({
      id: "env-chat-2",
      from: "channel:telegram:chat-2",
      to: "agent:alpha",
      text: "from chat 2",
    });

    history.appendEnvelopeCreated({
      envelope: envChat1,
      origin: "channel",
      timestampMs: envChat1.createdAt,
    });
    history.appendEnvelopeCreated({
      envelope: envChat2,
      origin: "channel",
      timestampMs: envChat2.createdAt,
    });

    const chat1Path = history.getCurrentSessionFilePath("alpha", "chat-1");
    const chat2Path = history.getCurrentSessionFilePath("alpha", "chat-2");
    assert.ok(chat1Path);
    assert.ok(chat2Path);
    assert.notEqual(chat1Path, chat2Path);
    assert.equal(chat1Path?.includes(`${path.sep}chat-1${path.sep}`), true);
    assert.equal(chat2Path?.includes(`${path.sep}chat-2${path.sep}`), true);

    assert.equal(readSessionFile(chat1Path!)?.events.length, 0);
    assert.equal(readSessionFile(chat2Path!)?.events.length, 0);

    const chat1EndedAtMs = Date.now();
    closeActiveSession({ history, agentName: "alpha", chatId: "chat-1", endedAtMs: chat1EndedAtMs });

    assert.equal(readSessionFile(chat1Path!)?.endedAtMs, chat1EndedAtMs);
    assert.equal(readSessionFile(chat1Path!)?.events.length, 1);
    assert.equal(readSessionFile(chat2Path!)?.events.length, 0);
    assert.equal(history.getCurrentSessionFilePath("alpha", "chat-1"), null);
    assert.equal(history.getCurrentSessionFilePath("alpha", "chat-2"), chat2Path);
  });
});

test("chat-scoped current-session lookup does not fall back to another chat", async () => {
  await withTempAgentsDir(async (agentsDir) => {
    const history = new ConversationHistory({ agentsDir, timezone: "UTC" });
    history.startSession("alpha", "chat-1");

    assert.ok(history.getCurrentSessionFilePath("alpha"));
    assert.equal(history.getCurrentSessionFilePath("alpha", "chat-2"), null);
    assert.equal(history.getCurrentSessionId("alpha", "chat-2"), null);
  });
});

test("agent envelopes without explicit chatScope use deterministic internal chat directory", async () => {
  await withTempAgentsDir(async (agentsDir) => {
    const history = new ConversationHistory({ agentsDir, timezone: "UTC" });
    const envelope = makeEnvelope({
      id: "env-internal",
      from: "agent:alpha",
      to: "agent:beta",
      text: "hello-internal",
    });

    history.appendEnvelopeCreated({
      envelope,
      origin: "internal",
      timestampMs: envelope.createdAt,
    });

    const alphaPath = history.getCurrentSessionFilePath("alpha");
    const betaPath = history.getCurrentSessionFilePath("beta");
    assert.ok(alphaPath);
    assert.ok(betaPath);
    assert.equal(alphaPath?.includes(`${path.sep}internal%3Aalpha%3Ato%3Abeta${path.sep}`), true);
    assert.equal(betaPath?.includes(`${path.sep}internal%3Aalpha%3Ato%3Abeta${path.sep}`), true);
  });
});

test("session close writes markdown body from buffered events once", async () => {
  await withTempAgentsDir(async (agentsDir) => {
    const history = new ConversationHistory({ agentsDir, timezone: "UTC" });
    const first = makeEnvelope({
      id: "env-first",
      from: "agent:alpha",
      to: "agent:beta",
      text: "first-message",
    });
    const second = makeEnvelope({
      id: "env-second",
      from: "agent:alpha",
      to: "agent:beta",
      text: "second-message",
    });

    history.appendEnvelopeCreated({
      envelope: first,
      origin: "internal",
      timestampMs: first.createdAt,
    });
    history.appendEnvelopeCreated({
      envelope: second,
      origin: "internal",
      timestampMs: second.createdAt,
    });

    const alphaPath = history.getCurrentSessionFilePath("alpha");
    assert.ok(alphaPath);
    const alphaMarkdownPath = getSessionMarkdownPath(alphaPath!);
    assert.equal(readSessionMarkdownFile(alphaMarkdownPath), null);

    closeActiveSession({ history, agentName: "alpha" });

    const alphaMd = readSessionMarkdownFile(alphaMarkdownPath);
    assert.ok(alphaMd);
    assert.equal((alphaMd?.body.match(/^## /gm) ?? []).length, 2);
    assert.equal((alphaMd?.body.match(/second-message/g) ?? []).length, 1);
  });
});

test("JSONL event log survives restart and is compacted on recovered close", async () => {
  await withTempAgentsDir(async (agentsDir) => {
    const firstRun = new ConversationHistory({ agentsDir, timezone: "UTC" });
    const envelope = makeEnvelope({
      id: "env-recover",
      from: "agent:alpha",
      to: "agent:beta",
      text: "recover-me",
    });

    firstRun.appendEnvelopeCreated({
      envelope,
      origin: "internal",
      timestampMs: envelope.createdAt,
    });

    const alphaPath = firstRun.getCurrentSessionFilePath("alpha");
    assert.ok(alphaPath);
    assert.equal(readSessionFile(alphaPath!)?.events.length, 0);
    assert.equal(readSessionJournalEvents(alphaPath!).length, 1);

    // Simulate process restart: no in-memory pending buffers survive.
    const secondRun = new ConversationHistory({ agentsDir, timezone: "UTC" });
    assert.equal(secondRun.recoverAllSessions("alpha"), 1);
    closeActiveSession({ history: secondRun, agentName: "alpha" });

    const compacted = readSessionFile(alphaPath!);
    assert.ok(compacted);
    assert.equal(compacted?.events.length, 1);
    assert.equal(compacted?.events[0]?.type, "envelope-created");
    assert.equal(fs.existsSync(getSessionJournalPath(alphaPath!)), true);
  });
});

test("active session periodically compacts journal before close", async () => {
  await withTempAgentsDir(async (agentsDir) => {
    const history = new ConversationHistory({ agentsDir, timezone: "UTC" });

    for (let i = 0; i < 60; i += 1) {
      const envelope = makeEnvelope({
        id: `env-periodic-${i}`,
        from: "channel:telegram:chat-periodic",
        to: "agent:alpha",
        text: `periodic-${i}`,
      });
      history.appendEnvelopeCreated({
        envelope,
        origin: "channel",
        timestampMs: envelope.createdAt,
      });
    }

    const alphaPath = history.getCurrentSessionFilePath("alpha", "chat-periodic");
    assert.ok(alphaPath);

    const session = readSessionFile(alphaPath!);
    assert.ok(session);
    assert.equal(session?.endedAtMs, null);
    assert.ok((session?.events.length ?? 0) > 0);
    assert.equal(readSessionJournalEvents(alphaPath!).length, 60);
  });
});

test("constructor migrates legacy ndjson event logs to jsonl", async () => {
  await withTempAgentsDir(async (agentsDir) => {
    const first = makeEnvelope({
      id: "env-legacy-1",
      from: "agent:alpha",
      to: "agent:beta",
      text: "legacy-event",
    });
    const second = makeEnvelope({
      id: "env-legacy-2",
      from: "agent:alpha",
      to: "agent:beta",
      text: "current-event",
    });

    const dateStr = "2026-03-06";
    const chatDir = "chat-legacy";
    const sessionId = "session-legacy";
    const sessionBaseDir = path.join(
      agentsDir,
      "alpha",
      "internal_space",
      "history",
      dateStr,
      chatDir,
    );
    fs.mkdirSync(sessionBaseDir, { recursive: true });

    const sessionFilePath = path.join(sessionBaseDir, `${sessionId}.json`);
    const currentJournalPath = getSessionJournalPath(sessionFilePath);
    const legacyJournalPath = currentJournalPath.replace(/\.events\.jsonl$/, ".events.ndjson");

    const firstEvent = {
      type: "envelope-created" as const,
      timestampMs: first.createdAt,
      origin: "internal" as const,
      envelope: first,
    };
    const secondEvent = {
      type: "envelope-created" as const,
      timestampMs: second.createdAt,
      origin: "internal" as const,
      envelope: second,
    };
    // Duplicate line exists in both files; migration should de-duplicate.
    fs.writeFileSync(legacyJournalPath, `${JSON.stringify(firstEvent)}\n`, "utf8");
    fs.writeFileSync(
      currentJournalPath,
      `${JSON.stringify(firstEvent)}\n${JSON.stringify(secondEvent)}\n`,
      "utf8",
    );

    new ConversationHistory({ agentsDir, timezone: "UTC" });

    assert.equal(fs.existsSync(legacyJournalPath), false);
    assert.equal(fs.existsSync(currentJournalPath), true);

    const events = readSessionJournalEvents(sessionFilePath);
    assert.equal(events.length, 2);
    assert.equal(events[0]?.type, "envelope-created");
    assert.equal(events[1]?.type, "envelope-created");
    assert.equal((events[0] as { envelope: { id: string } }).envelope.id, "env-legacy-1");
    assert.equal((events[1] as { envelope: { id: string } }).envelope.id, "env-legacy-2");
  });
});
