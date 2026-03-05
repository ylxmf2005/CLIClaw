import type { ChannelMessage } from "../../adapters/types.js";
import type { CreateEnvelopeInput } from "../../envelope/types.js";

const DEFAULT_INTERRUPT_WINDOW_MS = 3_000;
const MAX_INTERRUPT_WINDOW_MS = 60_000;
const INTERRUPT_PRIORITY = 1;

interface PendingChannelEnvelope {
  message: ChannelMessage;
  input: CreateEnvelopeInput;
}

interface RecentChannelBatch {
  items: PendingChannelEnvelope[];
  lastMessageAtMs: number;
  expiryTimer: ReturnType<typeof setTimeout> | null;
}

export interface ChannelMessageBatchDispatch {
  input: CreateEnvelopeInput;
  batchSize: number;
  interruptNow: boolean;
}

export interface ChannelMessageBatcherOptions {
  getInterruptWindowMs?: () => number;
}

export class ChannelMessageBatcher {
  private recentBatches: Map<string, RecentChannelBatch> = new Map();
  private readonly getInterruptWindowMs: () => number;

  constructor(options: ChannelMessageBatcherOptions = {}) {
    this.getInterruptWindowMs = options.getInterruptWindowMs ?? (() => DEFAULT_INTERRUPT_WINDOW_MS);
  }

  enqueue(message: ChannelMessage, input: CreateEnvelopeInput): ChannelMessageBatchDispatch {
    const key = this.getBatchKey(input, message);
    const interruptWindowMs = this.resolveInterruptWindowMs();
    if (interruptWindowMs === 0) {
      this.clearRecentBatch(key);
      return { input, batchSize: 1, interruptNow: false };
    }

    const nowMs = Date.now();
    const existing = this.recentBatches.get(key);
    const inInterruptWindow = existing !== undefined && (nowMs - existing.lastMessageAtMs) <= interruptWindowMs;

    if (!existing || !inInterruptWindow) {
      this.clearRecentBatch(key);
      const next: RecentChannelBatch = {
        items: [{ message, input }],
        lastMessageAtMs: nowMs,
        expiryTimer: null,
      };
      this.recentBatches.set(key, next);
      this.scheduleExpiry(key, next, interruptWindowMs);
      return { input, batchSize: 1, interruptNow: false };
    }

    existing.items.push({ message, input });
    existing.lastMessageAtMs = nowMs;
    this.scheduleExpiry(key, existing, interruptWindowMs);
    return {
      input: {
        ...this.mergeBatch(existing.items),
        priority: INTERRUPT_PRIORITY,
      },
      batchSize: existing.items.length,
      interruptNow: true,
    };
  }

  private resolveInterruptWindowMs(): number {
    const raw = this.getInterruptWindowMs();
    if (!Number.isFinite(raw)) return DEFAULT_INTERRUPT_WINDOW_MS;
    const normalized = Math.trunc(raw);
    if (normalized <= 0) return 0;
    return Math.max(1, Math.min(MAX_INTERRUPT_WINDOW_MS, normalized));
  }

  private clearRecentBatch(key: string): void {
    const existing = this.recentBatches.get(key);
    if (!existing) return;
    if (existing.expiryTimer) {
      clearTimeout(existing.expiryTimer);
    }
    this.recentBatches.delete(key);
  }

  private scheduleExpiry(key: string, batch: RecentChannelBatch, interruptWindowMs: number): void {
    if (batch.expiryTimer) {
      clearTimeout(batch.expiryTimer);
    }
    batch.expiryTimer = setTimeout(() => {
      const current = this.recentBatches.get(key);
      if (!current || current !== batch) return;
      const idleMs = Date.now() - current.lastMessageAtMs;
      if (idleMs < interruptWindowMs) {
        this.scheduleExpiry(key, current, interruptWindowMs);
        return;
      }
      this.recentBatches.delete(key);
    }, interruptWindowMs);
  }

  private getBatchKey(input: CreateEnvelopeInput, message: ChannelMessage): string {
    return `${message.platform}:${message.chat.id}:${input.to}`;
  }

  private mergeBatch(items: PendingChannelEnvelope[]): CreateEnvelopeInput {
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const textParts = items
      .map((item) => item.message.content.text)
      .filter((text): text is string => typeof text === "string" && text.trim().length > 0);
    const attachments = items.flatMap((item) => item.input.content.attachments ?? []);
    const metadataBase = last.input.metadata && typeof last.input.metadata === "object"
      ? { ...(last.input.metadata as Record<string, unknown>) }
      : {};

    const channelMessageIds = items.map((item) => item.message.id);
    metadataBase.channelMessageId = last.message.id;
    if (channelMessageIds.length > 1) {
      metadataBase.channelMessageIds = channelMessageIds;
    }

    const userTokens = Array.from(new Set(
      items
        .map((item) => {
          const md = item.input.metadata;
          if (!md || typeof md !== "object") return "";
          const token = (md as Record<string, unknown>).userToken;
          return typeof token === "string" ? token : "";
        })
        .filter((token) => token.length > 0)
    ));
    if (userTokens.length > 1) {
      metadataBase.userTokens = userTokens;
      delete metadataBase.userToken;
    } else if (userTokens.length === 1) {
      metadataBase.userToken = userTokens[0];
    }

    const latestReply = [...items].reverse().find((item) => item.message.inReplyTo)?.message.inReplyTo;
    if (latestReply) {
      metadataBase.inReplyTo = latestReply;
    }

    const firstUser = first.message.channelUser;
    const sameUser = items.every((item) =>
      item.message.channelUser.id === firstUser.id &&
      (item.message.channelUser.username ?? "") === (firstUser.username ?? "") &&
      item.message.channelUser.displayName === firstUser.displayName
    );
    if (!sameUser) {
      metadataBase.channelUser = { id: "batched", displayName: "Multiple users" };
      metadataBase.channelUsers = items.map((item) => item.message.channelUser);
    }

    return {
      from: first.input.from,
      to: first.input.to,
      fromBoss: items.every((item) => item.input.fromBoss === true),
      content: {
        text: textParts.length > 0 ? textParts.join("\n") : undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
      },
      metadata: metadataBase,
    };
  }
}
