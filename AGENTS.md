## Specs (start here)

All specs live under `openspec/specs/`:

| Spec | Contents |
|------|----------|
| `core/spec.md` | Goals, architecture, conventions, naming, short IDs |
| `core/definitions.md` | Field mappings (TypeScript ↔ SQLite ↔ CLI), data model |
| `envelope/spec.md` | Envelope model, routing, scheduling, threading |
| `cron/spec.md` | Cron schedules, timezone, misfire policy |
| `agent/spec.md` | Agent model, providers, execution, background jobs |
| `agent/sessions.md` | Session lifecycle, refresh, concurrency |
| `agent/memory.md` | File-based memory protocol |
| `cli/spec.md` | CLI surface, conventions, IPC protocol |
| `cli/commands.md` | All command flags and output keys |
| `configuration/spec.md` | Settings, env vars, data directory, SQLite schema |
| `telegram/spec.md` | Telegram adapter |
| `team/spec.md` | Teams, teamspaces, team messaging |
| `web-frontend/spec.md` | Web management console and chat interface |
| `web-frontend/events.md` | WebSocket events for real-time frontend |

## Goals & design philosophy (summary)

- Local-first: the daemon is the authority and runs on your machine.
- Envelopes are the interface: persisted, routable, schedulable.
- Predictable automation: stable CLI surface and instruction formats.
- Extensible: adapters bridge external chat apps without changing core semantics.
- Operator-friendly: one data dir + logs + simple reset.

## Core architecture (mental model)

- Daemon owns state and routing; CLI is a thin JSON-RPC client.
- SQLite is the durable queue + audit log (`~/cliclaw/.daemon/cliclaw.db`).
- Scheduler wakes due `deliver-at` envelopes.
- Agent executor runs provider sessions and marks envelopes done.
- Adapters bridge chat apps ↔ envelopes (e.g. Telegram).

## Naming & parsing safety (must follow)

| Context | Convention | Example |
|---------|------------|---------|
| Code (TypeScript) | camelCase | `envelope.fromBoss` |
| CLI flags | kebab-case, lowercase | `--deliver-at` |
| CLI output keys | kebab-case, lowercase | `sender:` |
| Agent instruction keys | kebab-case, lowercase | `from-boss` |

Canonical mapping (see `openspec/specs/core/definitions.md`):
```
envelope.deliverAt  -> --deliver-at   (flag)
envelope.fromBoss   -> from_boss      (SQLite; affects `[boss]` suffix in prompts)
envelope.createdAt  -> created-at:    (output key)
```

Boss marker:
- When `fromBoss` is true, rendered sender lines include the `[boss]` suffix:
  - direct: `sender: <author> [boss] in private chat`
  - group: `sender: <author> [boss] in group "<name>"`

Short IDs (must follow):
- **All** user/agent-visible UUID-backed ids are rendered as **short ids** by default (first 8 lowercase hex chars of the UUID with hyphens removed).
- Prefer `src/shared/id-format.ts` helpers:
  - `formatShortId(...)` for printing
  - `normalizeIdPrefixInput(...)` for parsing `--id` inputs
- Full UUIDs should be accepted as input where an `--id` flag exists, but should generally not be printed in CLI output or prompts.

## Important settings / operational invariants

- Runtime: Node.js 18+ (ES2022) recommended.
- Tokens are printed once by `cliclaw setup` / `cliclaw agent register` (no "show token" command).
- `CLICLAW_TOKEN` is used when `--token` is omitted.
- Sending to `channel:<adapter>:...` is only allowed if the sending agent is bound to that adapter type.
- `--deliver-at` supports relative (`+2h`, `+1Y2M3D`) and ISO 8601; units are case-sensitive (`Y/M/D/h/m/s`).
- Security: agent tokens are stored plaintext in `~/cliclaw/.daemon/cliclaw.db`; protect `~/cliclaw/`.

## Dev workflow

Must-do (after code changes):
```bash
npm run build && npm link
```

Fast path (dev):
```bash
npm i
npm run build && npm link

cliclaw setup
cliclaw daemon start --token <boss-token>
cliclaw agent register --token <boss-token> --name nex --description "AI assistant" --workspace "$PWD"
```

Useful checks (run when relevant):
- `npm run typecheck`
- `npm run prompts:check`
- If you change CLI output/formatting, regenerate CLI examples via `scripts/gen-cli-examples.ts` (`npm run examples:cli`).
- If you change prompt templates/context/rendering, regenerate prompt examples via `scripts/gen-prompt-examples.ts` (`npm run examples:prompts`).
- After changes, ensure everything under `examples/` is up-to-date (regenerate as needed).
- Examples must use realistic values for IDs and times (match what agents actually see): e.g., UUIDs for internal IDs, compact base36 for Telegram `channel-message-id`, and stable UTC timestamps in generated docs.
- `npm run defaults:check`
- `npm run verify:token-usage:real` (talks to a real provider; use intentionally)
- `npm run inventory:magic` (updates `docs/spec/generated/magic-inventory.md`; do not hand-edit that file)

Real provider verification policy (required for provider/dependency/runtime changes):
- If code or dependencies affect agent runtime/provider behavior (including `@unified-agent-sdk/*` changes), verify with **real** Codex + Claude requests before merging.
- By default, use the official provider homes: `~/.codex` and `~/.claude`.
  - Do not pass `--codex-home` / `--claude-home` unless explicitly testing overrides.
- Keep tests isolated from normal operator state:
  - Use a dedicated temporary CLIClaw directory: `export CLICLAW_DIR="$(mktemp -d /tmp/cliclaw-verify-XXXX)"`
  - Never run destructive reset commands against default `~/cliclaw` during verification.
- Minimum real-request verification checklist:
  - `npm run verify:token-usage:real -- --provider both --session-mode fresh --turns 1`
  - `npm run verify:token-usage:real -- --provider both --session-mode continuous --turns 2`
  - Run one isolated daemon-level smoke flow (setup/start/register/send/list) in the temp `CLICLAW_DIR` and confirm both provider-backed agents complete at least one run.


## Repo layout (what lives where)

- `bin/` — TypeScript CLI entry for dev (`npm run cliclaw`)
- `dist/` — build output used by the published `cliclaw` binary (do not hand-edit)
- `scripts/` — dev/CI helper scripts (prompt validation, inventory generation, etc.)
- `src/daemon/` — daemon core (routing, scheduler, IPC server, DB)
- `src/cli/` — CLI surface, RPC calls, and instruction rendering
- `src/agent/` — provider integration + session policy
- `src/adapters/` — channel adapters (Telegram, …)
- `src/envelope/`, `src/cron/`, `src/shared/` — core models + shared utilities
- `prompts/` — Nunjucks templates for agent instructions / turns
- `openspec/specs/` — developer-facing specs (canonical)

## State & debugging

Default data dir: `~/cliclaw/` (override via `CLICLAW_DIR`; no `--data-dir` flag today)

| Item | Path |
|------|------|
| DB | `~/cliclaw/.daemon/cliclaw.db` |
| IPC socket | `~/cliclaw/.daemon/daemon.sock` |
| Daemon PID | `~/cliclaw/.daemon/daemon.pid` |
| Daemon log | `~/cliclaw/.daemon/daemon.log` |
| Media downloads | `~/cliclaw/media/` |
| Per-agent homes | `~/cliclaw/agents/<agent-name>/` |

Reset:
```bash
cliclaw daemon stop --token <boss-token> && rm -rf ~/cliclaw && cliclaw setup
```
