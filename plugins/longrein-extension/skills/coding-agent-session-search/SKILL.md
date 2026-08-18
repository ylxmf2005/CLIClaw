---
name: coding-agent-session-search
description: Use the local `cass` / coding-agent-search CLI to search, inspect, and package prior coding-agent sessions from Codex, Claude Code, Cursor, Gemini, Aider, ChatGPT, and other local agent histories. Use when asked to recall previous work, search old Codex or Claude conversations, recover project context, find a past bug fix or command, build an evidence handoff for another agent, or mine local AI coding history before implementing or debugging.
---

# Coding Agent Session Search

`cass` is the CLI from [Dicklesworthstone/coding_agent_session_search](https://github.com/Dicklesworthstone/coding_agent_session_search). Longrein installs the latest official release but does not fork or reimplement it. Use `cass --version` to identify the active upstream build.

## Agent Rules

- Never run bare `cass`; it opens the interactive TUI and can block an agent session.
- Always use `--json`, `--robot`, or `--robot-format json` for machine-readable output.
- Start unknown setups with `cass triage --json` and follow its `next_command` when it reports `not_initialized`, stale, or rebuilding state.
- Keep outputs bounded with `--limit`, `--fields`, `--max-content-length`, or `--max-tokens`.
- Treat stdout as data and stderr as diagnostics. Parse JSON instead of scraping human text.
- Check `health`, `freshness`, `privacy`, and `warnings` before pasting evidence into another prompt or answer.
- Hybrid search is preferred by default; when semantic assets are absent or rebuilding, accept the reported lexical fallback instead of downloading models or blocking the task.
- Run `cass export-html` only when the user explicitly requests an export. First use `--dry-run --json`, then specify `--output-dir`; never rely on its current-directory default.

## Core Workflow

1. Check readiness:

```bash
cass triage --json
```

If `next_command` is present, inspect its stated safety and run it exactly when it is in scope. A first build or refresh commonly uses:

```bash
cass index --json --no-progress-events
```

2. Search broadly, then narrow:

```bash
cass search "authentication redirect timeout" --robot --robot-meta --limit 10 --fields summary --max-tokens 4000
```

Use `--fields minimal` for wide scans. Use `--fields summary` when titles and scores help triage. Add `--workspace "$(pwd)"`, `--agent`, or date filters when the user provides that scope.

3. For a known workspace, locate its most recent session before searching or drilling down:

```bash
cass sessions --current --json
cass sessions --workspace "$(pwd)" --json --limit 5
```

4. Drill into promising hits:

```bash
cass view /path/to/session.jsonl -n 42 --json
cass expand /path/to/session.jsonl -n 42 -C 5 --json
```

Use `source_path` and `line_number` from search hits. Prefer `expand` when surrounding dialogue changes the meaning.

5. Package bounded evidence for another agent or later step:

```bash
cass pack "checkout timeout root cause" --robot --max-tokens 8000 --limit 30
```

5. Cite paths, lines, or session identifiers from the machine output. Separate confirmed session evidence from inference, and re-check claims against the current repository or runtime before treating them as current truth.

## Machine Contract

- Discover current schemas with `cass capabilities --json`, `cass introspect --json`, and `cass robot-docs schemas` instead of guessing fields.
- Search results normally expose `hits[]`; request only the fields needed for the current decision.
- With `--robot-meta`, use `_meta.next_cursor` for bounded pagination.
- Hybrid search may legitimately fall back to lexical while semantic assets are absent or rebuilding.
- `export-html` is a write operation: use `--dry-run --json` to inspect its plan, and export only to a user-approved directory.
- Branch on `error.kind` in structured error envelopes, not on human message text.
- Do not download semantic models, delete indexes, or run broad repair commands without task-specific authority.
