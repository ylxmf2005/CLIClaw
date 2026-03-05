## 1. Dependencies

- [x] 1.1 Install `react-markdown`, `remark-gfm`, `react-syntax-highlighter`, `@types/react-syntax-highlighter` in `web/`

## 2. Shared MessageContent Component

- [x] 2.1 Create `web/src/components/shared/message-content.tsx` with `react-markdown` + `remark-gfm`, custom code block renderer using `PrismLight` with `oneDark` theme, and @mention highlighting for text nodes (skip mentions inside code)
- [x] 2.2 Register PrismLight languages: typescript, javascript, python, bash, json, yaml, css, go, rust

## 3. Integrate MessageContent

- [x] 3.1 Replace raw text rendering in `demo-chat-view.tsx` with `<MessageContent text={env.content.text} />`
- [x] 3.2 Replace hand-rolled `MessageText` in `demo-team-chat.tsx` with `<MessageContent text={env.content.text} mentions={team.members} />`
- [x] 3.3 Replace raw text rendering in `components/chat/message-list.tsx` (live view) with `<MessageContent>`

## 4. Interactive Demo Composer

- [x] 4.1 Add `ADD_ENVELOPE` action to demo reducer in `page.tsx` — creates envelope with generated ID, `fromBoss: true`, appends to correct envelope list, updates conversation metadata
- [x] 4.2 Create a shared `DemoComposer` component (or inline) with real `<textarea>`, auto-resize up to 160px, Enter to send, Shift+Enter for newline, border highlight when text present
- [x] 4.3 Wire `DemoComposer` into `demo-chat-view.tsx` replacing the static div composer
- [x] 4.4 Wire `DemoComposer` into `demo-team-chat.tsx` replacing the static div composer

## 5. Scrollbar & CSS Infrastructure

- [x] 5.1 Add Firefox scrollbar styles to `globals.css`: `scrollbar-width: thin; scrollbar-color: var(--border) transparent;` on all scrollable containers
- [x] 5.2 Audit and fix `overflow-y-auto` on left panel, message lists, member panels to ensure scrollbars appear consistently

## 6. Cleanup

- [x] 6.1 Remove the hand-rolled `MessageText` component and associated `useMemo` parsing from `demo-team-chat.tsx`
- [x] 6.2 Verify `globals.css` `.message-content` rules now activate with the new markdown-rendered HTML
