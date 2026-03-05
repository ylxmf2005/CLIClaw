## Why

The demo frontend renders message content as plain text — code blocks show raw triple-backticks, no syntax highlighting, and no markdown formatting. The demo also has invisible scrollbars on some views, non-functional input fields (static `<div>` placeholders instead of real `<textarea>`), and hand-rolled regex parsing that doesn't scale. Since the demo will become the real frontend (just swapping mock data for API calls), the UI infrastructure needs to be production-grade now.

## What Changes

- Install `react-markdown` + `remark-gfm` for proper markdown rendering (GFM: tables, strikethrough, task lists)
- Install `react-syntax-highlighter` (with `prism` light build) for code block syntax highlighting
- Create a shared `<MessageContent>` component used by both demo and live chat/team views
- Replace static `<div>` composers in demo views with real `<textarea>` composers (auto-resize, Enter to send, Shift+Enter for newline) — matching the existing `MessageComposer` pattern but demo-mode (no API calls)
- Fix scrollbar visibility across all scrollable containers (message lists, member panels, left panel)
- Wire the existing `.message-content` CSS in `globals.css` to actually render via the new markdown component
- Remove hand-rolled regex parsing from `demo-team-chat.tsx` in favor of the shared component

## Capabilities

### New Capabilities
- `message-rendering`: Shared markdown + code highlighting component for message content display across all chat views

### Modified Capabilities
- `web-frontend`: Demo composers become functional textarea inputs; scrollbar and layout infrastructure improvements

## Impact

- **New dependencies**: `react-markdown`, `remark-gfm`, `react-syntax-highlighter`, `@types/react-syntax-highlighter`
- **Modified files**: `demo-chat-view.tsx`, `demo-team-chat.tsx`, `message-list.tsx` (live), `globals.css`
- **New file**: shared `MessageContent` component (e.g., `components/shared/message-content.tsx`)
- **Removed code**: Hand-rolled `MessageText` regex parser in `demo-team-chat.tsx`
