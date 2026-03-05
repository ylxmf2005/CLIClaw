## Context

The web frontend demo at `/demo` renders all message content as raw text via `whitespace-pre-wrap`. Code blocks display as literal ` ```typescript ` strings. The demo composers are static `<div>` elements with placeholder text — no typing, no send. Scrollbars use WebKit styles defined in `globals.css` but some containers lack `overflow` classes. The `.message-content` CSS rules in `globals.css` (for `pre`, `code`, inline code) are unused because no component produces those HTML elements.

The demo is the future production frontend — mock data swaps to API calls. Infrastructure must be solid now.

## Goals / Non-Goals

**Goals:**
- Render markdown in messages: paragraphs, code blocks (fenced + inline), bold, italic, lists, links
- Syntax-highlight code blocks with language detection
- One shared `<MessageContent>` component for demo chat, demo team chat, and live message list
- Functional demo composers: real `<textarea>`, auto-resize, Enter to send (dispatches to demo reducer), Shift+Enter for newline
- Visible, consistent scrollbars on all scrollable areas
- Highlight `@mentions` in team messages

**Non-Goals:**
- Full WYSIWYG / rich text editing in composer
- Image/media rendering in messages (future)
- Emoji picker or reactions
- Live API integration (stays mock data)

## Decisions

### 1. Markdown library: `react-markdown` + `remark-gfm`

**Chosen:** `react-markdown` with `remark-gfm` plugin.

**Why over alternatives:**
- `react-markdown` renders to React elements (no `dangerouslySetInnerHTML`), safe by default
- `remark-gfm` adds GitHub-flavored markdown (tables, strikethrough, task lists) — matches what AI agents actually produce
- Tree-shakeable, well-maintained, 5M+ weekly downloads
- Alternative `marked` renders raw HTML strings — requires sanitization, XSS risk
- Alternative `mdx` is overkill for message display

### 2. Syntax highlighting: `react-syntax-highlighter` with Prism

**Chosen:** `react-syntax-highlighter` using `PrismLight` build with selective language imports.

**Why:**
- Integrates directly as a `react-markdown` code component override
- `PrismLight` allows importing only needed languages (typescript, javascript, python, bash, json, yaml, css, go, rust) — keeps bundle small
- Dark theme: `oneDark` (matches our dark UI palette)
- Alternative `shiki` requires async loading / server components — adds complexity for a client-side demo

### 3. Shared MessageContent component location

**Chosen:** `web/src/components/shared/message-content.tsx`

Accepts `text: string` and optional `mentions?: string[]` (for @-highlighting in team contexts). Used by:
- `demo-chat-view.tsx` — replaces raw `{env.content.text}`
- `demo-team-chat.tsx` — replaces hand-rolled `MessageText`
- `components/chat/message-list.tsx` — replaces raw text in live view

### 4. Demo composer: real textarea with reducer dispatch

Replace static `<div>` placeholders with `<textarea>` that:
- Auto-resizes up to 160px (matching live `MessageComposer` pattern)
- Enter sends → dispatches `ADD_ENVELOPE` to demo reducer (creates a mock "boss" envelope)
- Shift+Enter inserts newline
- Attachment and schedule buttons remain non-functional (styled only)

This requires adding `ADD_ENVELOPE` action to the demo reducer in `page.tsx`.

### 5. Scrollbar fixes

Add `scrollbar-thin` utility class to `globals.css` and ensure all scrollable containers (`overflow-y-auto`) get consistent scrollbar treatment. The existing WebKit rules are global but Firefox needs `scrollbar-width: thin; scrollbar-color: var(--border) transparent;` added.

## Risks / Trade-offs

- **Bundle size** — `react-syntax-highlighter` with Prism is ~40KB gzipped with selective language imports. Acceptable for a management console, not a mobile app.
  → Mitigation: Use `PrismLight` + dynamic imports if needed later.

- **@mention parsing runs after markdown** — If a message has `@name` inside a code block, it shouldn't be highlighted.
  → Mitigation: The `MessageContent` component applies @mention highlighting only to text nodes from `react-markdown`, not code blocks.

- **Demo reducer grows** — Adding `ADD_ENVELOPE` adds state management complexity.
  → Mitigation: Keep it simple — push to envelopes array, update conversation metadata. No routing logic.
