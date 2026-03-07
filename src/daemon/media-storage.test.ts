import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { saveMediaFile, getMediaDir, mediaFileExists } from "./media-storage.js";

function withTempDir(run: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cliclaw-media-test-"));
  try {
    run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("getMediaDir creates media directory if not exists", () => {
  withTempDir((dir) => {
    const mediaDir = getMediaDir(dir);
    assert.equal(fs.existsSync(mediaDir), true);
    assert.equal(path.basename(mediaDir), "media");
  });
});

test("saveMediaFile saves file and returns paths", () => {
  withTempDir((dir) => {
    const data = Buffer.from("hello world");
    const result = saveMediaFile(dir, "test.txt", data);

    assert.ok(result.relativePath.startsWith("media/"));
    assert.ok(result.relativePath.endsWith("-test.txt"));
    assert.ok(fs.existsSync(result.absolutePath));

    const content = fs.readFileSync(result.absolutePath, "utf-8");
    assert.equal(content, "hello world");
  });
});

test("saveMediaFile sanitizes filename", () => {
  withTempDir((dir) => {
    const data = Buffer.from("test");
    const result = saveMediaFile(dir, "../../../etc/passwd", data);

    // Should not contain path traversal
    assert.ok(!result.relativePath.includes(".."));
    assert.ok(fs.existsSync(result.absolutePath));
  });
});

test("saveMediaFile rejects files exceeding max size", () => {
  withTempDir((dir) => {
    // 11MB buffer
    const data = Buffer.alloc(11 * 1024 * 1024);
    assert.throws(
      () => saveMediaFile(dir, "large.bin", data),
      /exceeds maximum size/
    );
  });
});

test("mediaFileExists returns true for saved file", () => {
  withTempDir((dir) => {
    const data = Buffer.from("exists");
    const result = saveMediaFile(dir, "check.txt", data);

    assert.equal(mediaFileExists(dir, result.relativePath), true);
    assert.equal(mediaFileExists(dir, "media/nonexistent.txt"), false);
  });
});
