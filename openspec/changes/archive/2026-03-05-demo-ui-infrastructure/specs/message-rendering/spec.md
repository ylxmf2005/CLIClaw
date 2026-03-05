## ADDED Requirements

### Requirement: Shared MessageContent component renders markdown
The system SHALL provide a shared `<MessageContent>` component at `components/shared/message-content.tsx` that renders message text as GitHub-flavored markdown using `react-markdown` + `remark-gfm`.

The component SHALL accept:
- `text: string` — the raw message content
- `mentions?: string[]` — optional list of names to highlight as @mentions

The component SHALL render:
- Paragraphs, bold, italic, strikethrough
- Fenced code blocks with language labels
- Inline code
- Ordered and unordered lists
- Links (open in new tab)
- Tables (GFM)

#### Scenario: Fenced code block renders with language label
- **WHEN** message text contains ` ```typescript\nconst x = 1;\n``` `
- **THEN** the component SHALL render a `<pre>` block with syntax highlighting and a "typescript" language label

#### Scenario: Inline code renders distinctly
- **WHEN** message text contains `` `variableName` ``
- **THEN** the component SHALL render it as an inline `<code>` element with distinct background color

#### Scenario: Plain text renders as paragraphs
- **WHEN** message text contains no markdown syntax
- **THEN** the component SHALL render the text as `<p>` elements preserving line breaks

### Requirement: Syntax highlighting for code blocks
The system SHALL use `react-syntax-highlighter` with `PrismLight` build to syntax-highlight fenced code blocks. The following languages SHALL be registered: typescript, javascript, python, bash, json, yaml, css, go, rust.

The syntax theme SHALL be `oneDark` (or equivalent dark theme matching the application palette).

#### Scenario: TypeScript code block is highlighted
- **WHEN** a fenced code block specifies `typescript` as the language
- **THEN** keywords, strings, types, and comments SHALL render in distinct colors

#### Scenario: Unknown language falls back to plain monospace
- **WHEN** a fenced code block specifies an unregistered language (e.g., `haskell`)
- **THEN** the code SHALL render as plain monospace text without highlighting errors

### Requirement: @mention highlighting in message content
The system SHALL highlight `@name` patterns in message text when a `mentions` list is provided. Mentions SHALL render with a distinct background and text color (cyan).

Mentions inside code blocks (fenced or inline) SHALL NOT be highlighted.

#### Scenario: Team message with @mention
- **WHEN** message text contains `@shieru` and `mentions` includes `"shieru"`
- **THEN** `@shieru` SHALL render as a highlighted span with cyan styling

#### Scenario: @mention inside code block is not highlighted
- **WHEN** message text contains `` `@shieru` `` inside a fenced code block
- **THEN** `@shieru` SHALL render as plain code text, not highlighted

### Requirement: MessageContent used across all chat views
The `<MessageContent>` component SHALL be used by:
- `demo-chat-view.tsx` (demo agent chat)
- `demo-team-chat.tsx` (demo team chat, with `mentions` prop)
- `components/chat/message-list.tsx` (live agent chat)

#### Scenario: Demo chat view uses MessageContent
- **WHEN** a message is displayed in the demo chat view
- **THEN** it SHALL be rendered through `<MessageContent text={env.content.text} />`

#### Scenario: Demo team chat uses MessageContent with mentions
- **WHEN** a message is displayed in the demo team chat
- **THEN** it SHALL be rendered through `<MessageContent text={env.content.text} mentions={team.members} />`
