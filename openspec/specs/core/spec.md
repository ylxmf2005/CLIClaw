# Core: Goals, Architecture & Conventions

## Product Goal

Hi-Boss is a local-first daemon + `hiboss` CLI for running durable, routable messages ("envelopes") between humans (via chat adapters) and agents.

It aims to support customizable, long-running assistants that can:
- receive and send messages across channels,
- schedule delivery (`deliver-at` / cron),
- operate predictably via a stable, parseable CLI surface.

## Non-Goals

- A hosted SaaS (Hi-Boss runs locally).
- A general-purpose chat application (it routes messages; it does not replace your chat client).
- Hard multi-tenant security boundaries (protect your local machine and `~/hiboss`).
- A workflow engine or scheduler for arbitrary jobs (scheduling is for envelope delivery).

## Principles

- **Local-first**: the daemon is the source of truth and runs on your machine.
- **Envelopes as the interface**: messages are persisted as envelopes and routed reliably.
- **Predictable automation**: stable CLI flags/output and instruction formats.
- **Extensibility**: adapters are pluggable; new channels should fit the same bridge/router model.
- **Operator-friendly**: debuggable via logs and a single state directory.

## Compatibility

- Node.js: ES2022 runtime (Node.js 18+ recommended).
- Platforms: intended for local use (macOS/Linux first; Windows may work but is not a primary target).
- Packaging: users should be able to install and run `hiboss` globally via npm.

---

## Architecture

```
┌──────────────┐     ┌───────────────┐     ┌──────────────────────┐
│  Chat Apps   │────▶│   Adapters    │────▶│      Daemon          │
│ (Telegram…)  │     │ (Telegram…)   │     │  (router + scheduler │
└──────────────┘     └───────────────┘     │   + agent executor)  │
                                           └──────────┬───────────┘
                                                      │
                                           persists   │   JSON-RPC
                                                      │   (local socket)
                                     ┌────────────────┼────────────────┐
                                     ▼                                 ▼
                             ┌───────────────┐                 ┌──────────────┐
                             │    SQLite     │                 │   hiboss     │
                             │  hiboss.db    │                 │    CLI       │
                             └───────────────┘                 └──────────────┘
```

### Components

| Component | Responsibility | Spec |
|----------|----------------|------|
| Daemon | Owns state, routes envelopes, runs agents, manages adapters | `openspec/specs/envelope/spec.md` |
| SQLite DB | Durable queue + audit (agents, bindings, envelopes, runs, config) | `openspec/specs/core/definitions.md` |
| Scheduler | Wakes future `deliver-at` envelopes and triggers delivery | `openspec/specs/envelope/spec.md` |
| Agent executor | Runs provider CLI sessions and marks envelopes done | `openspec/specs/agent/spec.md` |
| CLI | Talks to daemon over IPC for ops + envelopes | `openspec/specs/cli/spec.md` |
| Adapters | Bridge external systems to channel messages/commands | `openspec/specs/telegram/spec.md` |

### Key Invariants

- **Daemon owns state**: the CLI is a client; the daemon is the authority.
- **Envelope persistence**: envelopes live in SQLite and are the durable queue.
- **Token-gated envelope operations**: envelope RPC requires authentication; agent tokens are primary, and admin tokens are allowed for specific envelope operations with stricter constraints (see `openspec/specs/cli/spec.md`).
- **Scheduling is delivery-time, not execution-time**: `--deliver-at` controls *when* an envelope becomes due.
- **Stable parseable outputs**: CLI output keys and agent instruction keys remain kebab-case and stable (see `openspec/specs/core/definitions.md`).

---

## Naming Conventions (parsing safety)

| Context | Convention | Example |
|---|---|---|
| TypeScript fields | camelCase | `envelope.fromBoss` |
| SQLite columns | snake_case | `from_boss` |
| CLI flags | kebab-case | `--deliver-at` |
| CLI output keys | kebab-case + `:` | `created-at:` |
| Agent instruction keys | kebab-case | `from-boss` |

Canonical mappings live in `openspec/specs/core/definitions.md`.

## Boss Marker

When `envelope.fromBoss` is true, rendered sender lines include the `[boss]` suffix.

Rendered `sender:` values (channel envelopes only):
- Group: `sender: <sender-name> [boss] in group "<name>"`
- Direct: `sender: <sender-name> [boss] in private chat`

No `from-boss:` output key is printed in envelope instructions; the boss signal is the `[boss]` suffix.

## Short IDs

All user/agent-visible UUID-backed IDs are rendered as **short IDs** by default:

- short id = first 8 lowercase hex characters of the UUID with hyphens removed
- full UUIDs (hyphens optional) are accepted as input anywhere an `--id` flag exists

Implementation helpers:
- `src/shared/id-format.ts` (`formatShortId`, `normalizeIdPrefixInput`)
