"use client";

import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useTheme } from "@/providers/theme-provider";

// Register languages
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import go from "react-syntax-highlighter/dist/esm/languages/prism/go";
import rust from "react-syntax-highlighter/dist/esm/languages/prism/rust";

SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("ts", typescript);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("js", javascript);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("sh", bash);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("yaml", yaml);
SyntaxHighlighter.registerLanguage("yml", yaml);
SyntaxHighlighter.registerLanguage("css", css);
SyntaxHighlighter.registerLanguage("go", go);
SyntaxHighlighter.registerLanguage("rust", rust);

interface MessageContentProps {
  text: string;
  mentions?: string[];
}

/** Highlight @mentions in a text string, returning React nodes */
function highlightMentions(text: string, _mentions?: string[]): React.ReactNode {
  const mentionRe = /@(\w[\w-]*)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = mentionRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <span key={key++} className="rounded bg-cyan-glow/10 px-1 py-0.5 text-cyan-glow font-medium">
        {match[0]}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length > 0 ? parts : text;
}

export function MessageContent({ text, mentions = [] }: MessageContentProps) {
  const { theme } = useTheme();
  const codeStyle = theme === "dark" ? oneDark : oneLight;

  const components = useMemo(() => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    code({ className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || "");
      const codeStr = String(children).replace(/\n$/, "");

      // Inline code (no language class, single line, no newlines)
      if (!match && !className) {
        return (
          <code className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[0.85em] text-primary" {...props}>
            {children}
          </code>
        );
      }

      // Fenced code block
      return (
        <div className="my-2 overflow-hidden rounded-lg border border-border">
          {match && (
            <div className="flex items-center border-b border-border bg-accent/30 px-3 py-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">{match[1]}</span>
            </div>
          )}
          <SyntaxHighlighter
            style={codeStyle}
            language={match?.[1] || "text"}
            PreTag="div"
            customStyle={{
              margin: 0,
              padding: "12px 16px",
              background: "var(--card)",
              fontSize: "0.85em",
              lineHeight: "1.6",
            }}
          >
            {codeStr}
          </SyntaxHighlighter>
        </div>
      );
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    p({ children }: any) {
      const processed = React.Children.map(children, (child: React.ReactNode) => {
        if (typeof child === "string") return highlightMentions(child);
        return child;
      });
      return <p className="mb-2 last:mb-0">{processed}</p>;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    a({ href, children }: any) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-cyan-glow underline underline-offset-2 hover:text-cyan-glow/80">
          {children}
        </a>
      );
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ul({ children }: any) {
      return <ul className="mb-2 ml-4 list-disc space-y-0.5 last:mb-0">{children}</ul>;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ol({ children }: any) {
      return <ol className="mb-2 ml-4 list-decimal space-y-0.5 last:mb-0">{children}</ol>;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    table({ children }: any) {
      return (
        <div className="my-2 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">{children}</table>
        </div>
      );
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    th({ children }: any) {
      return <th className="border-b border-border bg-accent/30 px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground">{children}</th>;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    td({ children }: any) {
      return <td className="border-b border-border px-3 py-1.5">{children}</td>;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    blockquote({ children }: any) {
      return <blockquote className="my-2 border-l-2 border-cyan-glow/30 pl-3 text-muted-foreground">{children}</blockquote>;
    },
  }), [codeStyle]);

  return (
    <div className="message-content break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
