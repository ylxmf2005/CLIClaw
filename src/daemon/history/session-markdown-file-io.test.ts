import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createSessionFile, readSessionFile } from "./session-file-io.js";
import {
  appendSessionMarkdownConversation,
  ensureSessionMarkdownForJson,
  getSessionMarkdownPath,
  markSessionMarkdownClosedBySessionJsonPath,
  readSessionMarkdownFile,
} from "./session-markdown-file-io.js";

const TEST_TIMEZONE = "Asia/Shanghai";

function withTempDir(run: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cliclaw-session-md-test-"));
  try {
    run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("ensureSessionMarkdownForJson creates markdown and appends conversation entries", () => {
  withTempDir((root) => {
    const sessionJsonPath = path.join(root, "agents", "nex", "internal_space", "history", "2026-03-03", "chat-a", "s1.json");
    createSessionFile({
      filePath: sessionJsonPath,
      sessionId: "s1",
      agentName: "nex",
      startedAtMs: Date.now(),
    });

    const session = readSessionFile(sessionJsonPath);
    assert.ok(session);

    const mdPath = ensureSessionMarkdownForJson({
      sessionJsonPath,
      session: session!,
      timeZone: TEST_TIMEZONE,
    });
    assert.equal(mdPath, getSessionMarkdownPath(sessionJsonPath));

    appendSessionMarkdownConversation(mdPath, {
      timestampMs: Date.now(),
      from: "agent:boss",
      to: "agent:nex",
      content: "hello world",
    }, TEST_TIMEZONE);

    const md = readSessionMarkdownFile(mdPath);
    assert.ok(md);
    assert.equal(md?.frontmatter.sessionId, "s1");
    assert.ok(md?.body.includes("from: agent:boss"));
    assert.ok(md?.body.includes("content:"));
    assert.match(md?.frontmatter.startedAt ?? "", /[+-]\d{2}:\d{2}$/);
  });
});

test("markSessionMarkdownClosedBySessionJsonPath sets ended-at and pending summary", () => {
  withTempDir((root) => {
    const sessionJsonPath = path.join(root, "agents", "nex", "internal_space", "history", "2026-03-03", "chat-a", "s2.json");
    createSessionFile({
      filePath: sessionJsonPath,
      sessionId: "s2",
      agentName: "nex",
      startedAtMs: Date.now(),
    });
    const session = readSessionFile(sessionJsonPath);
    assert.ok(session);

    ensureSessionMarkdownForJson({
      sessionJsonPath,
      session: session!,
      timeZone: TEST_TIMEZONE,
    });

    markSessionMarkdownClosedBySessionJsonPath({
      sessionJsonPath,
      endedAtMs: Date.now(),
      timeZone: TEST_TIMEZONE,
    });

    const md = readSessionMarkdownFile(getSessionMarkdownPath(sessionJsonPath));
    assert.ok(md);
    assert.equal(md?.frontmatter.summaryStatus, "pending");
    assert.notEqual(md?.frontmatter.endedAt, "");
    assert.match(md?.frontmatter.endedAt ?? "", /[+-]\d{2}:\d{2}$/);
  });
});
