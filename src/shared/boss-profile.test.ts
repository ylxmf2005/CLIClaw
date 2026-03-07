import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ensureBossProfile,
  formatBossProfilesForPrompt,
  getBossProfilePath,
  readBossProfile,
  writeBossProfile,
} from "./boss-profile.js";

function withTempCliClaw(run: (cliclawDir: string) => void): void {
  const cliclawDir = fs.mkdtempSync(path.join(os.tmpdir(), "cliclaw-boss-profile-test-"));
  try {
    run(cliclawDir);
  } finally {
    fs.rmSync(cliclawDir, { recursive: true, force: true });
  }
}

test("ensureBossProfile creates default BOSS.md with required frontmatter", () => {
  withTempCliClaw((cliclawDir) => {
    const ensured = ensureBossProfile({
      cliclawDir,
      tokenName: "ethan",
      defaultName: "Ethan",
    });
    assert.equal(ensured.ok, true);
    if (!ensured.ok) return;

    const profilePath = getBossProfilePath(cliclawDir, "ethan");
    assert.equal(fs.existsSync(profilePath), true);

    const profile = readBossProfile({
      cliclawDir,
      tokenName: "ethan",
      defaultName: "Ethan",
    });
    assert.equal(profile.ok, true);
    if (!profile.ok) return;
    assert.equal(profile.profile.name, "Ethan");
    assert.equal(profile.profile.version, "1");
    assert.equal(profile.profile.content, "");
  });
});

test("writeBossProfile persists frontmatter and body", () => {
  withTempCliClaw((cliclawDir) => {
    const writeResult = writeBossProfile({
      cliclawDir,
      tokenName: "ethan",
      name: "Ethan Lee",
      version: "2",
      content: "Keep responses concise.",
      metadata: { title: "Founder" },
    });
    assert.equal(writeResult.ok, true);
    if (!writeResult.ok) return;

    const readResult = readBossProfile({
      cliclawDir,
      tokenName: "ethan",
      defaultName: "Ethan",
    });
    assert.equal(readResult.ok, true);
    if (!readResult.ok) return;
    assert.equal(readResult.profile.name, "Ethan Lee");
    assert.equal(readResult.profile.version, "2");
    assert.equal(readResult.profile.content, "Keep responses concise.");
    assert.equal(readResult.profile.metadata.title, "Founder");
  });
});

test("formatBossProfilesForPrompt renders sections by owner", () => {
  const output = formatBossProfilesForPrompt([
    {
      tokenName: "ethan",
      name: "Ethan",
      version: "1",
      content: "Protect reliability.",
      path: "/tmp/ethan/BOSS.md",
      metadata: {},
    },
    {
      tokenName: "lpc",
      name: "LPC",
      version: "1",
      content: "Prefer rapid iteration.",
      path: "/tmp/lpc/BOSS.md",
      metadata: {},
    },
  ]);

  assert.ok(output.includes("### Ethan (ethan)"));
  assert.ok(output.includes("### LPC (lpc)"));
});

