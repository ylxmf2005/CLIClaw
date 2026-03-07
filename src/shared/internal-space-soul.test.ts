import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ensureAgentInternalSpaceLayout,
  readAgentInternalSoulSnapshot,
  writeAgentInternalSoul,
} from "./internal-space.js";

function withTempCliClaw(run: (cliclawDir: string) => void): void {
  const cliclawDir = fs.mkdtempSync(path.join(os.tmpdir(), "cliclaw-internal-space-soul-test-"));
  try {
    run(cliclawDir);
  } finally {
    fs.rmSync(cliclawDir, { recursive: true, force: true });
  }
}

test("ensureAgentInternalSpaceLayout creates SOUL.md with required version frontmatter", () => {
  withTempCliClaw((cliclawDir) => {
    const ensured = ensureAgentInternalSpaceLayout({ cliclawDir, agentName: "nex" });
    assert.equal(ensured.ok, true);

    const soulPath = path.join(cliclawDir, "agents", "nex", "internal_space", "SOUL.md");
    assert.equal(fs.existsSync(soulPath), true);

    const snapshot = readAgentInternalSoulSnapshot({ cliclawDir, agentName: "nex" });
    assert.equal(snapshot.ok, true);
    if (!snapshot.ok) return;
    assert.equal(snapshot.version, "1");
    assert.equal(snapshot.note, "");
  });
});

test("writeAgentInternalSoul persists version and body", () => {
  withTempCliClaw((cliclawDir) => {
    const written = writeAgentInternalSoul({
      cliclawDir,
      agentName: "nex",
      version: "2",
      note: "Operator persona details.",
    });
    assert.equal(written.ok, true);
    if (!written.ok) return;

    const snapshot = readAgentInternalSoulSnapshot({ cliclawDir, agentName: "nex" });
    assert.equal(snapshot.ok, true);
    if (!snapshot.ok) return;
    assert.equal(snapshot.version, "2");
    assert.equal(snapshot.note, "Operator persona details.");
  });
});

