# Agent: File-Based Memory Protocol

Hi-Boss agent memory is stored as **plain Markdown files** inside each agent's `internal_space/`. These files are the durable, human-editable source of truth; indexes/caches are optional accelerators and rebuildable.

This is the **v1 private memory protocol** (per-agent). Team shared workspace is handled via `{{HIBOSS_DIR}}/teamspaces/<team-name>/`.

## Goals

- **Local-first:** all durable memory is local files.
- **Git-backupable:** a repo can back up memory with frequent commits/pushes.
- **Human-readable:** operators can read/edit memory without special tooling.
- **Prompt-bounded:** injected memory stays within a predictable size budget.
- **Extendable:** future indexing can be layered on without changing file truth.

## Directory Layout

```text
{{HIBOSS_DIR}}/agents/<agent-name>/internal_space/
  MEMORY.md                     # long-term (core) memory (auto-injected)
  memories/                     # daily memory (auto-injected: latest N files; truncated)
    2026-02-11.md
    2026-02-10.md
  history/                      # session history (json + journal + markdown)
    2026-03-03/
      <chat-id>/
        <session-id>.json
        <session-id>.events.ndjson
        <session-id>.md
```

Notes:
- `internal_space/` is included in provider CLI `--add-dir`, so agents can read/write these files.
- `memories/` is append-friendly and safe to prune/archive later.
- Hi-Boss ensures internal space layout exists during setup and at session start. Missing `MEMORY.md` is created empty.

## Memory Tiers

### Long-term (core): `MEMORY.md`

Stable preferences, constraints, workflows, and durable project context. High signal density; injected on every new session.

Rules:
- Plain Markdown, keep compact (prefer bullets and short lines).
- Store abstractions, not raw transcripts.
- **Never** store secrets.

### Daily: `memories/YYYY-MM-DD.md`

Lightweight activity + decision log. Scratchpad for things that might be promoted into long-term memory later.

Rules:
- One short memory per line. No timestamps or headings required.
- Not transcripts; store outcomes and references.
- Day is derived from filename.
- Promote durable items to `MEMORY.md` when appropriate.

## Curation Responsibility (v1)

- Agents may append to today's daily file during work.
- Updating `MEMORY.md` is manual and best-effort.
- Session summary generation is not handled by a daemon background worker.

## Prompt Injection

On each new session, Hi-Boss injects:
1. Truncated `MEMORY.md` (long-term)
2. Truncated recent daily memory (latest N files)
3. Session summary snapshots from recent history markdown files

## Size Constraints (defaults)

- **Total injected memory budget:** ~20,000 chars
- **Long-term max (`MEMORY.md`):** ~12,000 chars
- **Recent daily max (combined):** ~8,000 chars
- **Recent daily per-day max:** ~4,000 chars
- **Recent daily window:** last 2 days/files
- **Session summary window:** last 3 history date directories (configurable)
- **Session summary per-session max:** ~24,000 chars (configurable)

Truncation is visible: a marker is appended so agents notice and compact.

## Backup Compatibility

Recovery-capable backup needs:
- `internal_space/MEMORY.md`
- `internal_space/memories/*.md`
- `internal_space/history/**/*.md`
- `internal_space/history/**/*.json`
- `internal_space/history/**/*.events.ndjson`

Everything else (SQLite, indexes) is rebuildable runtime state.
