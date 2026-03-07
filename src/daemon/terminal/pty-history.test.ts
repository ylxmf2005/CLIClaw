import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  appendPtyHistoryEvent,
  flushPtyHistoryWritesForTest,
  readPtyHistoryEvents,
  readPtyOutputChunks,
} from "./pty-history.js";

function withTempCliClawDir(run: (cliclawDir: string) => Promise<void> | void): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cliclaw-pty-history-test-"));
  const execute = async () => {
    try {
      await run(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
  return execute();
}

test("appendPtyHistoryEvent persists output chunks and readPtyOutputChunks replays them", async () => {
  await withTempCliClawDir(async (cliclawDir) => {
    appendPtyHistoryEvent({
      cliclawDir,
      agentName: "nex",
      chatId: "chat-a",
      direction: "output",
      data: "hello\n",
      timestampMs: 1000,
    });
    appendPtyHistoryEvent({
      cliclawDir,
      agentName: "nex",
      chatId: "chat-a",
      direction: "output",
      data: "world\n",
      timestampMs: 1001,
    });
    await flushPtyHistoryWritesForTest();

    const chunks = readPtyOutputChunks({
      cliclawDir,
      agentName: "nex",
      chatId: "chat-a",
      limit: 100,
    });
    assert.deepEqual(chunks, ["hello\n", "world\n"]);
  });
});

test("readPtyHistoryEvents returns both input and output records with limit", async () => {
  await withTempCliClawDir(async (cliclawDir) => {
    appendPtyHistoryEvent({
      cliclawDir,
      agentName: "nex",
      chatId: "chat-b",
      direction: "input",
      data: "ls -la\r",
      timestampMs: 2000,
    });
    appendPtyHistoryEvent({
      cliclawDir,
      agentName: "nex",
      chatId: "chat-b",
      direction: "output",
      data: "file-a\n",
      timestampMs: 2001,
    });
    appendPtyHistoryEvent({
      cliclawDir,
      agentName: "nex",
      chatId: "chat-b",
      direction: "output",
      data: "file-b\n",
      timestampMs: 2002,
    });
    await flushPtyHistoryWritesForTest();

    const events = readPtyHistoryEvents({
      cliclawDir,
      agentName: "nex",
      chatId: "chat-b",
      limit: 2,
    });

    assert.equal(events.length, 2);
    assert.deepEqual(events[0], {
      direction: "output",
      data: "file-a\n",
      timestampMs: 2001,
    });
    assert.deepEqual(events[1], {
      direction: "output",
      data: "file-b\n",
      timestampMs: 2002,
    });
  });
});

