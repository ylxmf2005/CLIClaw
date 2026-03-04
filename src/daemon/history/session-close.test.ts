import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ConversationHistory } from "./conversation-history.js";
import { closeActiveSession, closeSessionByPath } from "./session-close.js";
import { appendSessionJournalEvent, getSessionJournalPath, readSessionFile } from "./session-file-io.js";
import { getSessionMarkdownPath, readSessionMarkdownFile } from "./session-markdown-file-io.js";

async function withTempAgentsDir(run: (agentsDir: string) => Promise<void> | void): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hiboss-session-close-test-"));
  try {
    await run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("closeSessionByPath sets endedAtMs", async () => {
  await withTempAgentsDir((agentsDir) => {
    const history = new ConversationHistory({ agentsDir, timezone: "UTC" });
    history.startSession("alpha");
    const filePath = history.getCurrentSessionFilePath("alpha");
    assert.ok(filePath);
    assert.equal(readSessionFile(filePath!)?.events.length, 0);

    const endedAtMs = Date.now();
    closeSessionByPath({
      filePath: filePath!,
      agentName: "alpha",
      endedAtMs,
      timeZone: "UTC",
      history,
    });

    const session = readSessionFile(filePath!);
    assert.ok(session);
    assert.equal(session?.endedAtMs, endedAtMs);

    const markdown = readSessionMarkdownFile(getSessionMarkdownPath(filePath!));
    assert.ok(markdown);
    assert.equal(markdown?.frontmatter.summaryStatus, "pending");
    assert.notEqual(markdown?.frontmatter.endedAt, "");
    assert.match(markdown?.frontmatter.endedAt ?? "", /[+-]\d{2}:\d{2}$/);
  });
});

test("closeActiveSession sets endedAtMs and clears active marker", async () => {
  await withTempAgentsDir((agentsDir) => {
    const history = new ConversationHistory({ agentsDir, timezone: "UTC" });
    history.startSession("beta");
    const filePath = history.getCurrentSessionFilePath("beta");
    assert.ok(filePath);

    const endedAtMs = Date.now();
    closeActiveSession({ history, agentName: "beta", endedAtMs });

    const session = readSessionFile(filePath!);
    assert.ok(session);
    assert.equal(session?.endedAtMs, endedAtMs);
    assert.equal(history.getCurrentSessionFilePath("beta"), null);
  });
});

test("closeActiveSession with chatId closes only that chat scope", async () => {
  await withTempAgentsDir((agentsDir) => {
    const history = new ConversationHistory({ agentsDir, timezone: "UTC" });
    history.startSession("beta", "chat-1");
    history.startSession("beta", "chat-2");
    const chat1Path = history.getCurrentSessionFilePath("beta", "chat-1");
    const chat2Path = history.getCurrentSessionFilePath("beta", "chat-2");
    assert.ok(chat1Path);
    assert.ok(chat2Path);

    const endedAtMs = Date.now();
    closeActiveSession({ history, agentName: "beta", chatId: "chat-1", endedAtMs });

    assert.equal(readSessionFile(chat1Path!)?.endedAtMs, endedAtMs);
    assert.equal(readSessionFile(chat2Path!)?.endedAtMs, null);
    assert.equal(history.getCurrentSessionFilePath("beta", "chat-1"), null);
    assert.equal(history.getCurrentSessionFilePath("beta", "chat-2"), chat2Path);
  });
});

test("closeActiveSession without chatId closes all active chat scopes for agent", async () => {
  await withTempAgentsDir((agentsDir) => {
    const history = new ConversationHistory({ agentsDir, timezone: "UTC" });
    history.startSession("gamma", "chat-1");
    history.startSession("gamma", "chat-2");
    const chat1Path = history.getCurrentSessionFilePath("gamma", "chat-1");
    const chat2Path = history.getCurrentSessionFilePath("gamma", "chat-2");
    assert.ok(chat1Path);
    assert.ok(chat2Path);

    const endedAtMs = Date.now();
    closeActiveSession({ history, agentName: "gamma", endedAtMs });

    assert.equal(readSessionFile(chat1Path!)?.endedAtMs, endedAtMs);
    assert.equal(readSessionFile(chat2Path!)?.endedAtMs, endedAtMs);
    assert.equal(history.getCurrentSessionFilePaths("gamma").length, 0);
  });
});

test("closeSessionByPath compacts journal events when history runtime is unavailable", async () => {
  await withTempAgentsDir((agentsDir) => {
    const history = new ConversationHistory({ agentsDir, timezone: "UTC" });
    history.startSession("delta", "chat-journal");
    const filePath = history.getCurrentSessionFilePath("delta", "chat-journal");
    assert.ok(filePath);

    appendSessionJournalEvent(filePath!, {
      type: "envelope-created",
      timestampMs: Date.now(),
      origin: "internal",
      envelope: {
        id: "env-journal",
        from: "agent:boss",
        to: "agent:delta",
        fromBoss: false,
        content: { text: "hello" },
        status: "pending",
        createdAt: Date.now(),
        metadata: { origin: "internal" },
      },
    });
    assert.equal(readSessionFile(filePath!)?.events.length, 0);

    const endedAtMs = Date.now();
    closeSessionByPath({
      filePath: filePath!,
      agentName: "delta",
      endedAtMs,
      timeZone: "UTC",
    });

    const session = readSessionFile(filePath!);
    assert.ok(session);
    assert.equal(session?.events.length, 1);
    assert.equal(session?.endedAtMs, endedAtMs);
    assert.equal(fs.existsSync(getSessionJournalPath(filePath!)), false);
  });
});
