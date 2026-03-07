import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { AgentSession } from "./executor-support.js";
import { executeCliTurn } from "./executor-turn.js";
import { executeOneShotPrompt } from "./oneshot-turn.js";

async function withFakeClaude(
  run: (params: { workspaceDir: string; checkFile: string; binDir: string }) => Promise<void>,
): Promise<void> {
  const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "cliclaw-fake-claude-"));
  const binDir = path.join(workspaceDir, "bin");
  const checkFile = path.join(workspaceDir, "claude-env-check.txt");
  try {
    await fs.mkdir(binDir, { recursive: true });

    const fakeClaudePath = path.join(binDir, "claude");
    const script = `#!/bin/sh
if [ -n "\${CLAUDECODE:-}" ]; then
  if [ -n "\${CLICLAW_FAKE_CLAUDE_ENV_CHECK_FILE:-}" ]; then
    echo "present" > "\$CLICLAW_FAKE_CLAUDE_ENV_CHECK_FILE"
  fi
  echo "Error: Claude Code cannot be launched inside another Claude Code session." >&2
  exit 42
fi

if [ -n "\${CLICLAW_FAKE_CLAUDE_ENV_CHECK_FILE:-}" ]; then
  echo "absent" > "\$CLICLAW_FAKE_CLAUDE_ENV_CHECK_FILE"
fi

cat >/dev/null

case " $* " in
  *" stream-json "*)
    printf '%s\\n' '{"type":"system","subtype":"init","session_id":"sess-test"}'
    printf '%s\\n' '{"type":"assistant","message":{"usage":{"input_tokens":2,"output_tokens":1}}}'
    printf '%s\\n' '{"type":"result","subtype":"success","result":"hello from fake claude","session_id":"sess-test","usage":{"input_tokens":2,"output_tokens":1}}'
    ;;
  *)
    printf '%s\\n' 'hello from fake oneshot'
    ;;
esac
`;
    await fs.writeFile(fakeClaudePath, script, { mode: 0o755 });
    await run({ workspaceDir, checkFile, binDir });
  } finally {
    await fs.rm(workspaceDir, { recursive: true, force: true });
  }
}

function readTrimmed(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf-8").then((v) => v.trim());
}

function withEnv<T>(vars: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  return run().finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

test("executeCliTurn clears CLAUDECODE even when host env and overrides set it", async () => {
  await withFakeClaude(async ({ workspaceDir, checkFile, binDir }) => {
    const mergedPath = `${binDir}${path.delimiter}${process.env.PATH ?? ""}`;
    await withEnv(
      {
        PATH: mergedPath,
        CLAUDECODE: "1",
        CLICLAW_FAKE_CLAUDE_ENV_CHECK_FILE: checkFile,
      },
      async () => {
        const session: AgentSession = {
          provider: "claude",
          agentToken: "test-token",
          systemInstructions: "You are a helpful agent.",
          workspace: workspaceDir,
          providerEnvOverrides: { CLAUDECODE: "1" },
          createdAtMs: Date.now(),
        };

        const result = await executeCliTurn(session, "hello", {
          cliclawDir: workspaceDir,
          agentName: "nex",
        });

        assert.equal(result.status, "success");
        assert.equal(result.finalText, "hello from fake claude");
        assert.equal(await readTrimmed(checkFile), "absent");
      },
    );
  });
});

test("executeOneShotPrompt clears CLAUDECODE even when host env and overrides set it", async () => {
  await withFakeClaude(async ({ workspaceDir, checkFile, binDir }) => {
    const mergedPath = `${binDir}${path.delimiter}${process.env.PATH ?? ""}`;
    await withEnv(
      {
        PATH: mergedPath,
        CLAUDECODE: "1",
        CLICLAW_FAKE_CLAUDE_ENV_CHECK_FILE: checkFile,
      },
      async () => {
        const result = await executeOneShotPrompt({
          provider: "claude",
          workspace: workspaceDir,
          prompt: "hello",
          envOverrides: { CLAUDECODE: "1" },
        });

        assert.equal(result.finalText, "hello from fake oneshot");
        assert.equal(await readTrimmed(checkFile), "absent");
      },
    );
  });
});

