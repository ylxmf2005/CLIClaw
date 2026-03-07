import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { CLICLAW_DIR_ENV } from "./env.js";
import { getCliClawPaths, resolveCliClawDbPath } from "./cliclaw-paths.js";
import { getDefaultCliClawDir } from "./defaults.js";

function withEnv(
  updates: Record<string, string | undefined>,
  run: () => void
): void {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(updates)) {
    previous.set(key, process.env[key]);
  }
  try {
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    run();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("CLICLAW_DIR overrides default root dir", () => {
  const customDir = path.join(os.tmpdir(), "cliclaw-path-custom");
  withEnv(
    {
      [CLICLAW_DIR_ENV]: customDir,
    },
    () => {
      const paths = getCliClawPaths();
      assert.equal(paths.rootDir, customDir);
      assert.equal(paths.daemonDir, path.join(customDir, ".daemon"));
      assert.equal(paths.dbPath, path.join(customDir, ".daemon", "cliclaw.db"));
    }
  );
});

test("tilde in CLICLAW_DIR expands to home directory", () => {
  const expected = path.join(os.homedir(), "cliclaw-test-home");
  withEnv(
    {
      [CLICLAW_DIR_ENV]: "~/cliclaw-test-home",
    },
    () => {
      const paths = getCliClawPaths();
      assert.equal(paths.rootDir, expected);
    }
  );
});

test("without CLICLAW_DIR uses default root dir", () => {
  withEnv(
    {
      [CLICLAW_DIR_ENV]: undefined,
    },
    () => {
      const paths = getCliClawPaths();
      assert.equal(paths.rootDir, getDefaultCliClawDir());
    }
  );
});

test("resolveCliClawDbPath is strict and always returns cliclaw.db", () => {
  const daemonDir = path.join(os.tmpdir(), "cliclaw-daemon-strict");
  const resolved = resolveCliClawDbPath(daemonDir);
  assert.equal(resolved, path.join(daemonDir, "cliclaw.db"));
});
