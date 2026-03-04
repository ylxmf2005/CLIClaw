"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { sendEnvelope } from "@/lib/api";
import { ArrowUp, Paperclip, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageComposerProps {
  toAddress: string;
  placeholder?: string;
  onSent?: () => void;
}

export function MessageComposer({
  toAddress,
  placeholder = "Type a message...",
  onSent,
}: MessageComposerProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    try {
      await sendEnvelope({ to: toAddress, text: trimmed });
      setText("");
      onSent?.();
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch {
      // TODO: surface error in UI
    } finally {
      setSending(false);
    }
  }, [text, toAddress, sending, onSent]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-resize textarea
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  };

  return (
    <div className="border-t border-white/[0.04] bg-[#080c16] px-4 py-3">
      <div className="mx-auto max-w-3xl">
        <div
          className={cn(
            "flex items-end gap-2 rounded-xl border bg-white/[0.02] px-3 py-2 transition-colors",
            text.trim()
              ? "border-cyan-glow/20"
              : "border-white/[0.06]"
          )}
        >
          {/* Attachment button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground/40 hover:text-muted-foreground"
          >
            <Paperclip className="h-4 w-4" />
          </Button>

          {/* Text input */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            className="max-h-40 min-h-[32px] flex-1 resize-none bg-transparent text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/30"
          />

          {/* Schedule button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground/40 hover:text-muted-foreground"
          >
            <Clock className="h-4 w-4" />
          </Button>

          {/* Send button */}
          <Button
            onClick={handleSend}
            disabled={!text.trim() || sending}
            size="icon"
            className={cn(
              "h-8 w-8 shrink-0 rounded-lg transition-all",
              text.trim()
                ? "bg-cyan-glow text-black hover:bg-cyan-glow/90 shadow-[0_0_12px_rgba(0,212,255,0.3)]"
                : "bg-white/[0.05] text-muted-foreground/30"
            )}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        </div>

        <p className="mt-1.5 text-center text-[10px] text-muted-foreground/30">
          <kbd className="rounded bg-white/[0.04] px-1 py-0.5 font-mono text-[9px]">
            Enter
          </kbd>{" "}
          to send,{" "}
          <kbd className="rounded bg-white/[0.04] px-1 py-0.5 font-mono text-[9px]">
            Shift+Enter
          </kbd>{" "}
          for new line
        </p>
      </div>
    </div>
  );
}
