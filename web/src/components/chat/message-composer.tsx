"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ArrowUp, AtSign, Paperclip, Clock, X, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { SchedulePopover } from "./schedule-popover";
import { MessageContent } from "@/components/shared/message-content";
import { AttachmentBar } from "./attachment-bar";
import { PlusMenu } from "./plus-menu";
import { MentionBar } from "./mention-bar";
import { MentionAutocomplete } from "./mention-autocomplete";
import { isAllMention } from "@/lib/team-mentions";
import type { AttachmentFile } from "./attachment-bar";

// ── Types ──────────────────────────────────────────────────────────

export type { AttachmentFile } from "./attachment-bar";

export interface SlashCommand {
  command: string;
  description: string;
}

export interface TeamModeProps {
  teamMembers: string[];
  mentions: string[];
  onMentionsChange: (mentions: string[]) => void;
}

export interface MessageComposerProps {
  onSend: (text: string, attachments?: AttachmentFile[]) => void | Promise<void>;
  placeholder?: string;
  disabled?: boolean;
  onScheduleSend?: (text: string, scheduledAt: Date) => void | Promise<void>;
  /** Current draft text for this conversation (from parent state). */
  draft?: string;
  /** Called when draft text changes (debounced internally at 500ms). */
  onDraftChange?: (text: string) => void;
  /** Slash commands available for autocomplete. */
  slashCommands?: SlashCommand[];
  /** Team mode configuration. When provided, enables mention bar and send gate. */
  teamMode?: TeamModeProps;
}

// ── Constants ──────────────────────────────────────────────────────

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"];
const ACCEPTED_TYPES = [
  ...IMAGE_TYPES,
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
].join(",");

// ── Helpers ────────────────────────────────────────────────────────

function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function classifyFile(file: File): AttachmentFile["type"] {
  if (IMAGE_TYPES.includes(file.type)) return "image";
  if (
    file.type.includes("pdf") ||
    file.type.includes("word") ||
    file.type.includes("document") ||
    file.type.includes("text/")
  ) {
    return "document";
  }
  return "other";
}

function createImagePreview(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Component ──────────────────────────────────────────────────────

export function MessageComposer({
  onSend,
  placeholder = "Type a message...",
  disabled = false,
  onScheduleSend,
  draft,
  onDraftChange,
  slashCommands,
  teamMode,
}: MessageComposerProps) {
  const [text, setText] = useState(draft ?? "");
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [slashFilter, setSlashFilter] = useState<string | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [showMentionAutocomplete, setShowMentionAutocomplete] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const mentionBarRef = useRef<HTMLDivElement>(null);
  const dragCounterRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textRef = useRef(draft ?? "");
  const attachmentsRef = useRef<AttachmentFile[]>([]);
  const sendLockedRef = useRef(false);

  const isTeamMode = !!teamMode;
  const hasMentions = teamMode ? teamMode.mentions.length > 0 : true;

  // Sync text when draft prop changes (conversation switch)
  useEffect(() => {
    const nextText = draft ?? "";
    textRef.current = nextText;
    setText(nextText);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [draft]);

  useEffect(() => {
    textRef.current = text;
  }, [text]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  // Debounce draft saving
  const saveDraft = useCallback(
    (value: string) => {
      if (!onDraftChange) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onDraftChange(value);
      }, 500);
    },
    [onDraftChange]
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Clear error after a timeout
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);

  // ── Mention autocomplete ───────────────────────────────────────

  const handleMentionSelect = useCallback(
    (name: string) => {
      if (!teamMode) return;

      let newMentions: string[];
      if (isAllMention(name)) {
        // @all replaces all individual mentions
        newMentions = ["@all"];
      } else {
        // Individual mention replaces @all
        const withoutAll = teamMode.mentions.filter((m) => !isAllMention(m));
        newMentions = [...withoutAll, name];
      }

      teamMode.onMentionsChange(newMentions);
      setShowMentionAutocomplete(false);
      setMentionFilter("");

      // Clear any @ text from textarea
      const currentText = textRef.current;
      const atMatch = currentText.match(/@[A-Za-z0-9._-]*$/);
      if (atMatch) {
        const cleaned = currentText.slice(0, currentText.length - atMatch[0].length);
        textRef.current = cleaned;
        setText(cleaned);
        saveDraft(cleaned);
      }

      textareaRef.current?.focus();
    },
    [teamMode, saveDraft]
  );

  const handleMentionRemove = useCallback(
    (name: string) => {
      if (!teamMode) return;
      teamMode.onMentionsChange(teamMode.mentions.filter((m) => m !== name));
    },
    [teamMode]
  );

  const handleTriggerAutocomplete = useCallback(() => {
    setMentionFilter("");
    setShowMentionAutocomplete(true);
    textareaRef.current?.focus();
  }, []);

  const handleDismissAutocomplete = useCallback(() => {
    setShowMentionAutocomplete(false);
    setMentionFilter("");
  }, []);

  // ── Slash command autocomplete ──────────────────────────────────

  const filteredCommands = slashCommands && slashFilter !== null
    ? slashCommands.filter((sc) => sc.command.startsWith(slashFilter))
    : [];
  const showSlash = filteredCommands.length > 0;

  const updateSlashState = useCallback((value: string) => {
    if (!slashCommands || slashCommands.length === 0) {
      setSlashFilter(null);
      return;
    }
    // Only trigger slash autocomplete if text starts with "/" and has no space yet
    if (value.startsWith("/") && !value.includes(" ")) {
      setSlashFilter(value.slice(1).toLowerCase());
      setSlashIndex(0);
    } else {
      setSlashFilter(null);
    }
  }, [slashCommands]);

  const acceptSlashCommand = useCallback((command: string) => {
    const nextText = `/${command}`;
    textRef.current = nextText;
    setText(nextText);
    setSlashFilter(null);
    textareaRef.current?.focus();
  }, []);

  // ── Attachment helpers ────────────────────────────────────────

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const oversized = fileArray.filter((f) => f.size > MAX_FILE_SIZE);
    if (oversized.length > 0) {
      setError(
        `File${oversized.length > 1 ? "s" : ""} too large (max 10 MB): ${oversized.map((f) => f.name).join(", ")}`
      );
    }

    const valid = fileArray.filter((f) => f.size <= MAX_FILE_SIZE);
    const newAttachments: AttachmentFile[] = await Promise.all(
      valid.map(async (file) => {
        const type = classifyFile(file);
        const preview = type === "image" ? await createImagePreview(file) : undefined;
        return { id: generateId(), file, preview, type };
      })
    );

    setAttachments((prev) => [...prev, ...newAttachments]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // ── Send ──────────────────────────────────────────────────────

  const hasContent = text.trim().length > 0 || attachments.length > 0;
  // In team mode, also require mentions for non-slash-command messages
  const isSlashCommand = text.trim().startsWith("/");
  const canSend = isTeamMode
    ? hasMentions && (hasContent || isSlashCommand)
    : hasContent;

  const resetComposerState = useCallback(() => {
    textRef.current = "";
    attachmentsRef.current = [];
    setText("");
    setAttachments([]);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    onDraftChange?.("");
    setShowPreview(false);
    setSlashFilter(null);
    setShowMentionAutocomplete(false);
    setMentionFilter("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [onDraftChange]);

  const releaseSendLock = useCallback(() => {
    requestAnimationFrame(() => {
      sendLockedRef.current = false;
    });
  }, []);

  const handleSend = useCallback(() => {
    const currentText = textRef.current;
    const currentAttachments = attachmentsRef.current;
    const hasCurrentContent = currentText.trim().length > 0 || currentAttachments.length > 0;
    if (!hasCurrentContent || disabled || sendLockedRef.current) return;
    // In team mode, block send without mentions (unless it's handled by parent)
    if (isTeamMode && !hasMentions) return;
    sendLockedRef.current = true;

    const textToSend = currentText.trim();
    const attachmentsToSend = currentAttachments.length > 0 ? currentAttachments : undefined;

    resetComposerState();

    try {
      Promise.resolve(onSend(textToSend, attachmentsToSend)).finally(releaseSendLock);
    } catch {
      releaseSendLock();
    }
  }, [disabled, isTeamMode, hasMentions, onSend, resetComposerState, releaseSendLock]);

  const handleSchedule = useCallback(
    (date: Date) => {
      const currentText = textRef.current;
      const currentAttachments = attachmentsRef.current;
      const hasCurrentContent = currentText.trim().length > 0 || currentAttachments.length > 0;
      if (!hasCurrentContent || disabled || sendLockedRef.current || !onScheduleSend) return;
      if (isTeamMode && !hasMentions) return;
      sendLockedRef.current = true;

      const textToSend = currentText.trim();
      resetComposerState();

      try {
        Promise.resolve(onScheduleSend(textToSend, date)).finally(releaseSendLock);
      } catch {
        releaseSendLock();
      }
    },
    [disabled, isTeamMode, hasMentions, onScheduleSend, resetComposerState, releaseSendLock]
  );

  // ── Keyboard ──────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Mention autocomplete takes priority when visible
      if (showMentionAutocomplete) {
        // Let MentionAutocomplete's window keydown handler handle it
        return;
      }

      if (showSlash) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSlashIndex((i) => (i + 1) % filteredCommands.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSlashIndex((i) => (i - 1 + filteredCommands.length) % filteredCommands.length);
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          const selected = filteredCommands[slashIndex];
          const normalized = text.trim().toLowerCase();
          const isExactCommand = normalized === `/${selected.command}`;
          // Enter sends immediately when the full slash command is already typed.
          if (e.key === "Enter" && isExactCommand) {
            handleSend();
            return;
          }
          acceptSlashCommand(selected.command);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setSlashFilter(null);
          return;
        }
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [text, handleSend, showSlash, showMentionAutocomplete, filteredCommands, slashIndex, acceptSlashCommand]
  );

  // ── Auto-resize ───────────────────────────────────────────────

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    textRef.current = value;
    setText(value);
    saveDraft(value);
    updateSlashState(value);

    // Detect @mention typing in team mode
    if (isTeamMode) {
      const atMatch = value.match(/@([A-Za-z0-9._-]*)$/);
      if (atMatch) {
        setShowMentionAutocomplete(true);
        setMentionFilter(atMatch[1] ?? "");
      } else if (showMentionAutocomplete && !value.includes("@")) {
        setShowMentionAutocomplete(false);
        setMentionFilter("");
      }
    }

    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [saveDraft, updateSlashState, isTeamMode, showMentionAutocomplete]);

  // ── Clipboard paste ───────────────────────────────────────────

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file" && IMAGE_TYPES.includes(item.type)) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        addFiles(imageFiles);
      }
    },
    [addFiles]
  );

  // ── Drag and drop ─────────────────────────────────────────────

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.types.includes("Files")) {
      setDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setDragOver(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        addFiles(files);
      }
    },
    [addFiles]
  );

  // ── File picker ───────────────────────────────────────────────

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        addFiles(files);
      }
      e.target.value = "";
    },
    [addFiles]
  );

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // ── Render ────────────────────────────────────────────────────

  return (
    <div
      ref={composerRef}
      className="relative border-t border-border bg-card px-4 py-3"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {dragOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-cyan-glow/50 bg-cyan-glow/5 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-1 text-cyan-glow">
            <Paperclip className="h-6 w-6" />
            <span className="text-sm font-medium">Drop files here</span>
          </div>
        </div>
      )}

      <div className="chat-content-shell">
        {/* Markdown preview */}
        {showPreview && text.trim().length > 0 && (
          <div className="mb-2 rounded-lg border border-border bg-background p-3">
            <div className="mb-1.5 flex items-center gap-1.5">
              <Eye className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Preview
              </span>
            </div>
            <div className="text-sm leading-relaxed text-foreground/90">
              <MessageContent text={text} />
            </div>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-rose-alert/30 bg-rose-alert/10 px-3 py-1.5 text-xs text-rose-alert">
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss error" className="shrink-0 hover:opacity-70 focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:outline-none">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Attachment preview bar */}
        {attachments.length > 0 && <AttachmentBar attachments={attachments} onRemove={removeAttachment} />}

        {/* Mention autocomplete dropdown (team mode) */}
        {isTeamMode && showMentionAutocomplete && (
          <MentionAutocomplete
            members={teamMode.teamMembers}
            currentMentions={teamMode.mentions}
            filter={mentionFilter}
            onSelect={handleMentionSelect}
            onDismiss={handleDismissAutocomplete}
            anchorRef={mentionBarRef}
          />
        )}

        {/* Slash command autocomplete popup */}
        {showSlash && (
          <div className="mb-1 overflow-hidden rounded-lg border border-border bg-background shadow-lg">
            {filteredCommands.map((sc, i) => (
              <button
                key={sc.command}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  acceptSlashCommand(sc.command);
                }}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors",
                  i === slashIndex
                    ? "bg-accent text-foreground"
                    : "text-foreground/80 hover:bg-accent/50"
                )}
              >
                <span className="font-mono font-medium text-cyan-glow">/{sc.command}</span>
                <span className="text-xs text-muted-foreground">{sc.description}</span>
              </button>
            ))}
          </div>
        )}

        {/* Mention chips (team mode, only shown when mentions selected) */}
        {isTeamMode && (
          <div ref={mentionBarRef}>
            <MentionBar
              mentions={teamMode.mentions}
              onRemove={handleMentionRemove}
              onTriggerAutocomplete={handleTriggerAutocomplete}
              teamMembers={teamMode.teamMembers}
              disabled={disabled}
            />
          </div>
        )}

        {/* Main input row */}
        <div
          className={cn(
            "flex items-end gap-2 rounded-xl border bg-background px-3 py-2 transition-colors",
            canSend ? "border-cyan-glow/30" : "border-border"
          )}
        >
          {/* Plus menu (attach files, etc.) */}
          <PlusMenu disabled={disabled} onAddFiles={openFilePicker} />

          {/* @ mention button (team mode, inline) */}
          {isTeamMode && (
            <button
              type="button"
              onClick={handleTriggerAutocomplete}
              disabled={disabled}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/50"
              aria-label="Mention a team member"
            >
              <AtSign className="h-4 w-4" />
            </button>
          )}

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_TYPES}
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            aria-label={placeholder}
            className="max-h-40 min-h-[32px] flex-1 resize-none bg-transparent text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-40"
          />

          {/* Markdown preview toggle */}
          <button
            type="button"
            onClick={() => setShowPreview((p) => !p)}
            aria-label={showPreview ? "Hide preview" : "Show markdown preview"}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:outline-none",
              showPreview
                ? "text-cyan-glow"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>

          {/* Schedule button with popover */}
          <SchedulePopover onSchedule={handleSchedule}>
            <button
              type="button"
              disabled={disabled || !canSend}
              aria-label="Schedule message"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:outline-none"
            >
              <Clock className="h-4 w-4" />
            </button>
          </SchedulePopover>

          {/* Send button */}
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend || disabled}
            aria-label="Send message"
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:outline-none",
              canSend
                ? "bg-cyan-glow text-primary-foreground shadow-[0_0_12px_rgba(0,212,255,0.3)] hover:opacity-90"
                : "bg-accent text-muted-foreground"
            )}
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>

      </div>
    </div>
  );
}
