"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { ArrowUp, AtSign, Paperclip, Clock, X, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { SchedulePopover } from "./schedule-popover";
import { MessageContent } from "@/components/shared/message-content";
import { AttachmentBar } from "./attachment-bar";
import { PlusMenu } from "./plus-menu";
import { MentionBar } from "./mention-bar";
import { MentionAutocomplete } from "./mention-autocomplete";
import { isAllMention } from "@/lib/team-mentions";
import { useAttachments, ACCEPTED_TYPES } from "./use-attachments";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Provider, ReasoningEffort } from "@/lib/types";
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

export interface ChatModelOverrideProps {
  provider: Provider;
  agentDefaultModel?: string;
  agentDefaultReasoningEffort?: ReasoningEffort;
  modelOverride?: string | null;
  reasoningEffortOverride?: ReasoningEffort | null;
  onModelOverrideChange?: (modelOverride: string | null) => void;
  onReasoningEffortOverrideChange?: (reasoningEffortOverride: ReasoningEffort | null) => void;
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
  /** Optional per-chat model/reasoning override controls. */
  chatModelOverrides?: ChatModelOverrideProps;
}

const MODEL_OPTIONS_BY_PROVIDER: Record<Provider, string[]> = {
  claude: ["haiku", "sonnet", "opus"],
  codex: ["gpt-5.3-codex", "gpt-5.2-codex", "gpt-5.1-codex-max", "gpt-5.2", "gpt-5.1-codex-mini"],
};

/** Display-friendly model names (lowercase value → formatted label). */
const MODEL_DISPLAY_NAMES: Record<string, string> = {
  haiku: "Haiku",
  sonnet: "Sonnet",
  opus: "Opus",
  "gpt-5.3-codex": "GPT-5.3-Codex",
  "gpt-5.2-codex": "GPT-5.2-Codex",
  "gpt-5.1-codex-max": "GPT-5.1-Codex-Max",
  "gpt-5.2": "GPT-5.2",
  "gpt-5.1-codex-mini": "GPT-5.1-Codex-Mini",
};

function formatModelName(model: string): string {
  return MODEL_DISPLAY_NAMES[model] ?? model;
}

const REASONING_LABELS: Record<ReasoningEffort, string> = {
  none: "None",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
  max: "Max",
};

/** Valid reasoning effort options per provider. */
const REASONING_OPTIONS_BY_PROVIDER: Record<Provider, ReasoningEffort[]> = {
  claude: ["low", "medium", "high", "max"],
  codex: ["none", "low", "medium", "high", "xhigh"],
};

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
  chatModelOverrides,
}: MessageComposerProps) {
  const [text, setText] = useState(draft ?? "");
  const [dragOver, setDragOver] = useState(false);
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
  const sendLockedRef = useRef(false);

  const isTeamMode = !!teamMode;
  const hasMentions = teamMode ? teamMode.mentions.length > 0 : true;
  const showModelOverrideControls = Boolean(chatModelOverrides && !isTeamMode);

  // Use the effective value directly (no "__default__" pseudo-value)
  const effectiveModel = chatModelOverrides?.modelOverride?.trim()
    || chatModelOverrides?.agentDefaultModel?.trim()
    || (chatModelOverrides?.provider === "codex" ? "gpt-5.3-codex" : chatModelOverrides?.provider === "claude" ? "sonnet" : "model");
  const providerReasoningOptions = chatModelOverrides
    ? REASONING_OPTIONS_BY_PROVIDER[chatModelOverrides.provider]
    : [];
  const rawEffectiveReasoning: ReasoningEffort = chatModelOverrides?.reasoningEffortOverride
    ?? chatModelOverrides?.agentDefaultReasoningEffort
    ?? "high";
  // Ensure the value is valid for the current provider; fall back to "high" if not.
  const effectiveReasoning: ReasoningEffort = providerReasoningOptions.includes(rawEffectiveReasoning)
    ? rawEffectiveReasoning
    : "high";
  const modelSelectValue = chatModelOverrides?.modelOverride ?? effectiveModel;
  const reasoningSelectValue = chatModelOverrides?.reasoningEffortOverride
    && providerReasoningOptions.includes(chatModelOverrides.reasoningEffortOverride)
    ? chatModelOverrides.reasoningEffortOverride
    : effectiveReasoning;
  const modelSelectOptions = useMemo(() => {
    if (!chatModelOverrides) return [];
    const base = MODEL_OPTIONS_BY_PROVIDER[chatModelOverrides.provider] ?? [];
    const set = new Set<string>(base);
    const agentDefaultModel = chatModelOverrides.agentDefaultModel?.trim();
    if (agentDefaultModel) set.add(agentDefaultModel);
    const modelOverride = chatModelOverrides.modelOverride?.trim();
    if (modelOverride) set.add(modelOverride);
    return Array.from(set);
  }, [
    chatModelOverrides?.provider,
    chatModelOverrides?.agentDefaultModel,
    chatModelOverrides?.modelOverride,
  ]);

  const {
    attachments, attachmentsRef, error,
    addFiles, removeAttachment, clearAttachments, clearError,
    IMAGE_TYPES,
  } = useAttachments();

  // Sync text when draft prop changes (conversation switch)
  useEffect(() => {
    const nextText = draft ?? "";
    textRef.current = nextText;
    setText(nextText);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [draft]);

  useEffect(() => { textRef.current = text; }, [text]);

  // Debounce draft saving
  const saveDraft = useCallback(
    (value: string) => {
      if (!onDraftChange) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => onDraftChange(value), 500);
    },
    [onDraftChange]
  );

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  // Clear error after a timeout
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(clearError, 4000);
    return () => clearTimeout(t);
  }, [error, clearError]);

  // ── Mention autocomplete ───────────────────────────────────────

  const handleMentionSelect = useCallback(
    (name: string) => {
      if (!teamMode) return;

      const newMentions = isAllMention(name)
        ? ["@all"]
        : [...teamMode.mentions.filter((m) => !isAllMention(m)), name];

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
    if (!slashCommands || slashCommands.length === 0) { setSlashFilter(null); return; }
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

  // ── Send ──────────────────────────────────────────────────────

  const hasContent = text.trim().length > 0 || attachments.length > 0;
  const isSlashCommand = text.trim().startsWith("/");
  const canSend = isTeamMode
    ? hasMentions && (hasContent || isSlashCommand)
    : hasContent;


  const handleModelOverrideSelect = useCallback((value: string) => {
    if (!chatModelOverrides?.onModelOverrideChange) return;
    // If chosen model matches agent default, clear the override
    const agentDefault = chatModelOverrides.agentDefaultModel?.trim();
    chatModelOverrides.onModelOverrideChange(value === agentDefault ? null : value);
  }, [chatModelOverrides]);

  const handleReasoningOverrideSelect = useCallback((value: string) => {
    if (!chatModelOverrides?.onReasoningEffortOverrideChange) return;
    const agentDefault = chatModelOverrides.agentDefaultReasoningEffort;
    chatModelOverrides.onReasoningEffortOverrideChange(
      value === agentDefault ? null : value as ReasoningEffort
    );
  }, [chatModelOverrides]);

  const resetComposerState = useCallback(() => {
    textRef.current = "";
    setText("");
    clearAttachments();
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    onDraftChange?.("");
    setShowPreview(false);
    setSlashFilter(null);
    setShowMentionAutocomplete(false);
    setMentionFilter("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [onDraftChange, clearAttachments]);

  const releaseSendLock = useCallback(() => {
    requestAnimationFrame(() => { sendLockedRef.current = false; });
  }, []);

  const handleSend = useCallback(() => {
    const currentText = textRef.current;
    const currentAttachments = attachmentsRef.current;
    const hasCurrentContent = currentText.trim().length > 0 || currentAttachments.length > 0;
    if (!hasCurrentContent || disabled || sendLockedRef.current) return;
    if (isTeamMode && !hasMentions) return;
    sendLockedRef.current = true;

    const textToSend = currentText.trim();
    const attachmentsToSend = currentAttachments.length > 0 ? currentAttachments : undefined;
    resetComposerState();

    try {
      Promise.resolve(onSend(textToSend, attachmentsToSend)).finally(releaseSendLock);
    } catch { releaseSendLock(); }
  }, [disabled, isTeamMode, hasMentions, onSend, resetComposerState, releaseSendLock, attachmentsRef]);

  const handleSchedule = useCallback(
    (date: Date) => {
      const currentText = textRef.current;
      const hasCurrentContent = currentText.trim().length > 0 || attachmentsRef.current.length > 0;
      if (!hasCurrentContent || disabled || sendLockedRef.current || !onScheduleSend) return;
      if (isTeamMode && !hasMentions) return;
      sendLockedRef.current = true;
      resetComposerState();
      try {
        Promise.resolve(onScheduleSend(currentText.trim(), date)).finally(releaseSendLock);
      } catch { releaseSendLock(); }
    },
    [disabled, isTeamMode, hasMentions, onScheduleSend, resetComposerState, releaseSendLock, attachmentsRef]
  );

  // ── Keyboard ──────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (showMentionAutocomplete) return;
      if (showSlash) {
        if (e.key === "ArrowDown") { e.preventDefault(); setSlashIndex((i) => (i + 1) % filteredCommands.length); return; }
        if (e.key === "ArrowUp") { e.preventDefault(); setSlashIndex((i) => (i - 1 + filteredCommands.length) % filteredCommands.length); return; }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          const selected = filteredCommands[slashIndex];
          if (e.key === "Enter" && text.trim().toLowerCase() === `/${selected.command}`) { handleSend(); return; }
          acceptSlashCommand(selected.command);
          return;
        }
        if (e.key === "Escape") { e.preventDefault(); setSlashFilter(null); return; }
      }
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
    },
    [text, handleSend, showSlash, showMentionAutocomplete, filteredCommands, slashIndex, acceptSlashCommand]
  );

  // ── Input handling ────────────────────────────────────────────

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    textRef.current = value;
    setText(value);
    saveDraft(value);
    updateSlashState(value);

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
      if (imageFiles.length > 0) { e.preventDefault(); addFiles(imageFiles); }
    },
    [addFiles, IMAGE_TYPES]
  );

  // ── Drag and drop ─────────────────────────────────────────────

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.types.includes("Files")) setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) { dragCounterRef.current = 0; setDragOver(false); }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault(); e.stopPropagation();
      dragCounterRef.current = 0;
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); }, []);
  const openFilePicker = useCallback(() => { fileInputRef.current?.click(); }, []);
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) addFiles(e.target.files);
      e.target.value = "";
    },
    [addFiles]
  );

  // ── Render ────────────────────────────────────────────────────

  return (
    <div
      ref={composerRef}
      className="relative border-t border-border bg-card px-4 py-4"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {dragOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-cyan-glow/50 bg-cyan-glow/5 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-1 text-cyan-glow">
            <Paperclip className="h-6 w-6" />
            <span className="text-sm font-medium">Drop files here</span>
          </div>
        </div>
      )}

      <div className="chat-content-shell">
        {showPreview && text.trim().length > 0 && (
          <div className="mb-2 rounded-lg border border-border bg-background p-3">
            <div className="mb-1.5 flex items-center gap-1.5">
              <Eye className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Preview</span>
            </div>
            <div className="text-sm leading-relaxed text-foreground/90">
              <MessageContent text={text} />
            </div>
          </div>
        )}

        {error && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-rose-alert/30 bg-rose-alert/10 px-3 py-1.5 text-xs text-rose-alert">
            <span className="flex-1">{error}</span>
            <button onClick={clearError} aria-label="Dismiss error" className="shrink-0 hover:opacity-70 focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:outline-none">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {attachments.length > 0 && <AttachmentBar attachments={attachments} onRemove={removeAttachment} />}

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

        {showSlash && (
          <div className="mb-1 overflow-hidden rounded-lg border border-border bg-background shadow-lg">
            {filteredCommands.map((sc, i) => (
              <button
                key={sc.command}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); acceptSlashCommand(sc.command); }}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors",
                  i === slashIndex ? "bg-accent text-foreground" : "text-foreground/80 hover:bg-accent/50"
                )}
              >
                <span className="font-mono font-medium text-cyan-glow">/{sc.command}</span>
                <span className="text-xs text-muted-foreground">{sc.description}</span>
              </button>
            ))}
          </div>
        )}

        {isTeamMode && (
          <div ref={mentionBarRef}>
            <MentionBar mentions={teamMode.mentions} onRemove={handleMentionRemove} disabled={disabled} />
          </div>
        )}

        <div className={cn(
          "flex flex-col rounded-xl border bg-background transition-colors",
          canSend ? "border-cyan-glow/30" : "border-border"
        )}>
          {/* Top: textarea + send button */}
          <div className="flex items-end gap-2 px-3 pt-3 pb-1">
            <input ref={fileInputRef} type="file" multiple accept={ACCEPTED_TYPES} onChange={handleFileSelect} className="hidden" />

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
              className="max-h-40 min-h-[36px] flex-1 resize-none bg-transparent text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-40"
            />

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

          {/* Bottom toolbar: + button, model selectors, action buttons */}
          <div className="flex items-center gap-1 px-2 pb-2 pt-1">
            <PlusMenu disabled={disabled} onAddFiles={openFilePicker} />

            {showModelOverrideControls && chatModelOverrides && (
              <>
                <Select
                  value={modelSelectValue}
                  onValueChange={handleModelOverrideSelect}
                  disabled={disabled}
                >
                  <SelectTrigger
                    size="sm"
                    aria-label="Model"
                    className="h-7 min-w-[100px] max-w-[200px] border-none bg-transparent px-2 text-xs text-muted-foreground shadow-none ring-0 focus-visible:ring-1 focus-visible:ring-cyan-400/50"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Select model</SelectLabel>
                      {modelSelectOptions.map((model) => (
                        <SelectItem key={model} value={model}>
                          {formatModelName(model)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>

                <Select
                  value={reasoningSelectValue}
                  onValueChange={handleReasoningOverrideSelect}
                  disabled={disabled}
                >
                  <SelectTrigger
                    size="sm"
                    aria-label="Reasoning effort"
                    className="h-7 min-w-[80px] max-w-[160px] border-none bg-transparent px-2 text-xs text-muted-foreground shadow-none ring-0 focus-visible:ring-1 focus-visible:ring-cyan-400/50"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Select reasoning</SelectLabel>
                      {REASONING_OPTIONS_BY_PROVIDER[chatModelOverrides.provider].map((level) => (
                        <SelectItem key={level} value={level}>
                          {REASONING_LABELS[level]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </>
            )}

            {isTeamMode && (
              <button
                type="button"
                onClick={handleTriggerAutocomplete}
                disabled={disabled}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/50"
                aria-label="Mention a team member"
              >
                <AtSign className="h-4 w-4" />
              </button>
            )}

            <div className="flex-1" />

            <button
              type="button"
              onClick={() => setShowPreview((p) => !p)}
              aria-label={showPreview ? "Hide preview" : "Show markdown preview"}
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:outline-none",
                showPreview ? "text-cyan-glow" : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>

            <SchedulePopover onSchedule={handleSchedule}>
              <button
                type="button"
                disabled={disabled || !canSend}
                aria-label="Schedule message"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:outline-none"
              >
                <Clock className="h-3.5 w-3.5" />
              </button>
            </SchedulePopover>
          </div>
        </div>
      </div>
    </div>
  );
}
