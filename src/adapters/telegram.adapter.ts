import { Telegraf } from "telegraf";
import type { Agent as HttpAgent } from "node:http";
import { HttpsProxyAgent } from "https-proxy-agent";
import type {
  ChatAdapter,
  ChannelMessageHandler,
  MessageContent,
  ChannelCommandHandler,
  ChannelCommand,
  ChannelCommandResponse,
  SendMessageOptions,
  TelegramInlineKeyboardButton,
} from "./types.js";
import { getHiBossPaths } from "../shared/hiboss-paths.js";
import { formatTelegramMessageIdCompact, parseTelegramMessageId } from "../shared/telegram-message-id.js";
import { buildTelegramChannelMessage, type MessageContext } from "./telegram/incoming.js";
import { sendTelegramMessage } from "./telegram/outgoing.js";
import {
  computeBackoff,
  isGetUpdatesConflict,
  isTransientNetworkError,
  sleep,
  splitTextForTelegram,
  TELEGRAM_MAX_TEXT_CHARS,
} from "./telegram/shared.js";
import type { UiLocale } from "../shared/ui-locale.js";
import { getUiText } from "../shared/ui-text.js";
import { DEFAULT_TELEGRAM_COMMAND_REPLY_AUTO_DELETE_SECONDS } from "../shared/defaults.js";

/** Telegram typing status expires quickly; refresh every few seconds while active. */
const TELEGRAM_TYPING_HEARTBEAT_MS = 4500;
/** Prevent noisy logs if chat action repeatedly fails (e.g., chat blocked). */
const TELEGRAM_TYPING_ERROR_THROTTLE_MS = 60_000;
const TELEGRAM_COMMAND_REPLY_AUTO_DELETE_SECONDS_MAX = 86_400;
const TELEGRAM_COMMAND_API_TIMEOUT_MS = 15_000;

export interface TelegramAdapterOptions {
  getCommandReplyAutoDeleteSeconds?: () => number;
}
/**
 * Telegram adapter for the chat bot.
 */
export class TelegramAdapter implements ChatAdapter {
  readonly platform = "telegram";
  private bot: Telegraf;
  private handlers: ChannelMessageHandler[] = [];
  private commandHandlers: ChannelCommandHandler[] = [];
  private mediaDir: string;
  private stopped = false;
  private started = false;

  /** Active typing heartbeat timers keyed by chat id. */
  private typingTimers = new Map<string, ReturnType<typeof setInterval>>();
  /** Guards against overlapping chat-action calls per chat id. */
  private typingInFlight = new Set<string>();
  /** Last warning timestamp for chat-action failures per chat id. */
  private typingLastErrorAtMs = new Map<string, number>();
  private readonly uiLocale: UiLocale;
  private readonly getCommandReplyAutoDeleteSeconds: () => number;
  private commandReplyDeleteTimers = new Map<string, ReturnType<typeof setTimeout>>();

  private static buildTelegramNetworkOptions(): { apiRoot?: string; agent?: HttpAgent } {
    const apiRoot = process.env.TELEGRAM_API_ROOT?.trim();
    const proxyUrl = process.env.TELEGRAM_PROXY_URL?.trim();
    const result: { apiRoot?: string; agent?: HttpAgent } = {};

    if (apiRoot) {
      result.apiRoot = apiRoot;
    }

    if (!proxyUrl) {
      return result;
    }

    try {
      const parsed = new URL(proxyUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        console.warn(`[telegram] ignored TELEGRAM_PROXY_URL with unsupported protocol: ${parsed.protocol}`);
        return result;
      }

      result.agent = new HttpsProxyAgent(parsed);
      console.info(`[telegram] using proxy for bot api: ${parsed.origin}`);
      return result;
    } catch {
      console.warn("[telegram] ignored invalid TELEGRAM_PROXY_URL");
      return result;
    }
  }

  constructor(token: string, uiLocale: UiLocale = "en", options: TelegramAdapterOptions = {}) {
    const { apiRoot, agent } = TelegramAdapter.buildTelegramNetworkOptions();
    this.bot = new Telegraf(token, (apiRoot || agent) ? { telegram: { ...(apiRoot ? { apiRoot } : {}), ...(agent ? { agent } : {}) } } : {});
    this.mediaDir = getHiBossPaths().mediaDir;
    this.uiLocale = uiLocale;
    this.getCommandReplyAutoDeleteSeconds = options.getCommandReplyAutoDeleteSeconds
      ?? (() => DEFAULT_TELEGRAM_COMMAND_REPLY_AUTO_DELETE_SECONDS);
    this.setupListeners();
  }

  private static extractCommandArgs(text: string, command: string): string {
    const re = new RegExp(`^\\/${command}(?:@\\w+)?\\s*`, "i");
    return text.replace(re, "");
  }

  private toInlineKeyboard(
    keyboard: TelegramInlineKeyboardButton[][]
  ): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } {
    return {
      inline_keyboard: keyboard.map((row) =>
        row.map((item) => ({
          text: item.text,
          callback_data: item.callbackData,
        }))
      ),
    };
  }

  private async safeAnswerCallback(callbackQueryId?: string): Promise<void> {
    if (!callbackQueryId) return;
    try {
      await this.bot.telegram.answerCbQuery(callbackQueryId);
    } catch {
      // best-effort
    }
  }

  private normalizeCommandReplyAutoDeleteSeconds(): number {
    const raw = this.getCommandReplyAutoDeleteSeconds();
    if (!Number.isFinite(raw)) {
      return DEFAULT_TELEGRAM_COMMAND_REPLY_AUTO_DELETE_SECONDS;
    }
    const normalized = Math.trunc(raw);
    return Math.max(0, Math.min(TELEGRAM_COMMAND_REPLY_AUTO_DELETE_SECONDS_MAX, normalized));
  }

  private commandReplyDeleteTimerKey(chatId: string, messageId: number): string {
    return `${chatId}:${messageId}`;
  }

  private scheduleCommandReplyDelete(chatId: string, messageId: number | undefined): void {
    if (messageId === undefined || messageId === null || !Number.isFinite(messageId)) {
      return;
    }

    const seconds = this.normalizeCommandReplyAutoDeleteSeconds();
    if (seconds <= 0) return;

    const key = this.commandReplyDeleteTimerKey(chatId, messageId);
    const existing = this.commandReplyDeleteTimers.get(key);
    if (existing) {
      clearTimeout(existing);
      this.commandReplyDeleteTimers.delete(key);
    }

    const timer = setTimeout(() => {
      void this.bot.telegram.deleteMessage(chatId, messageId).catch(() => {
        // best-effort
      }).finally(() => {
        this.commandReplyDeleteTimers.delete(key);
      });
    }, seconds * 1000);

    this.commandReplyDeleteTimers.set(key, timer);
  }

  private async callCommandApi<T>(label: string, action: () => Promise<T>): Promise<T | null> {
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), TELEGRAM_COMMAND_API_TIMEOUT_MS));
    const result = await Promise.race([
      action().catch((err) => {
        console.warn(`[${this.platform}] command api failed (${label}):`, err);
        return null;
      }),
      timeout,
    ]);
    if (result === null) {
      console.warn(`[${this.platform}] command api timed out (${label}) after ${TELEGRAM_COMMAND_API_TIMEOUT_MS}ms`);
    }
    return result as T | null;
  }

  private async sendCommandResponse(command: ChannelCommand, response: ChannelCommandResponse): Promise<void> {
    const chatId = command.chatId;
    const text = response.text?.trim();
    if (!text) {
      await this.safeAnswerCallback(command.callbackQueryId);
      return;
    }

    const inlineKeyboard = response.telegram?.inlineKeyboard;
    const replyMarkup = inlineKeyboard ? this.toInlineKeyboard(inlineKeyboard) : undefined;
    const safeText = text.length <= TELEGRAM_MAX_TEXT_CHARS
      ? text
      : `${text.slice(0, TELEGRAM_MAX_TEXT_CHARS - 3)}...`;

    if (command.isCallback && response.telegram?.editMessageId) {
      try {
        const messageId = parseTelegramMessageId(response.telegram.editMessageId, "callback-message-id");
        const edited = await this.callCommandApi("editMessageText", () => this.bot.telegram.editMessageText(chatId, messageId, undefined, safeText, {
          ...(replyMarkup ? { reply_markup: replyMarkup as never } : {}),
        } as never));
        if (!edited) throw new Error("edit-message-timeout-or-failed");
        this.scheduleCommandReplyDelete(chatId, messageId);
        await this.safeAnswerCallback(command.callbackQueryId);
        return;
      } catch {
        // Fallback to sending a new message if edit fails (e.g., message too old).
      }
    }

    if (replyMarkup) {
      const sent = await this.callCommandApi("sendMessage-replyMarkup", () => this.bot.telegram.sendMessage(chatId, safeText, {
        reply_markup: replyMarkup as never,
      } as never));
      this.scheduleCommandReplyDelete(chatId, sent?.message_id);
      await this.safeAnswerCallback(command.callbackQueryId);
      return;
    }

    const chunks = splitTextForTelegram(text, TELEGRAM_MAX_TEXT_CHARS);
    for (const chunk of chunks) {
      const sent = await this.callCommandApi("sendMessage-chunk", () => this.bot.telegram.sendMessage(chatId, chunk));
      if (!sent) break;
      this.scheduleCommandReplyDelete(chatId, sent?.message_id);
    }
    await this.safeAnswerCallback(command.callbackQueryId);
  }

  private async dispatchCommand(ctx: any, commandName: string): Promise<void> {
    const chatId = String(ctx.chat?.id ?? "");
    if (!chatId) return;

    const username = ctx.from?.username;
    const channelUserId =
      ctx.from?.id !== undefined && ctx.from?.id !== null
        ? String(ctx.from.id)
        : undefined;
    const rawText = typeof ctx.message?.text === "string" ? ctx.message.text : `/${commandName}`;

    const command: ChannelCommand = {
      command: commandName,
      args: TelegramAdapter.extractCommandArgs(rawText, commandName),
      adapterType: this.platform,
      chatId,
      channelUserId,
      channelUsername: username,
      messageId:
        ctx.message?.message_id != null
          ? formatTelegramMessageIdCompact(String(ctx.message.message_id))
          : undefined,
    };

    let response: ChannelCommandResponse | undefined;

    for (const handler of this.commandHandlers) {
      try {
        const result = await handler(command);
        if (result && (typeof result.text === "string" || (result.attachments?.length ?? 0) > 0)) {
          response = result;
          break;
        }
      } catch (err) {
        console.error(`[${this.platform}] command handler error:`, err);
      }
    }

    if (!response?.text) {
      // Handlers can intentionally return no response (for deny/drop cases).
      return;
    }

    const sendStartedAtMs = Date.now();
    await this.sendCommandResponse(command, response);
    console.log(`[${this.platform}] command response sent command=${commandName} chat=${chatId} duration-ms=${Date.now() - sendStartedAtMs}`);
  }

  private registerCommand(name: string): void {
    this.bot.command(name, async (ctx) => {
      await this.dispatchCommand(ctx, name);
    });
  }

  private setupListeners(): void {
    for (const name of ["new", "status", "trace", "provider", "abort", "isolated", "clone"] as const) {
      this.registerCommand(name);
    }

    this.bot.on("text", (ctx) => { void this.handleMessage(ctx as unknown as MessageContext).catch((err) => console.error(`[${this.platform}] message handler error:`, err)); });
    this.bot.on("photo", (ctx) => { void this.handleMessage(ctx as unknown as MessageContext).catch((err) => console.error(`[${this.platform}] message handler error:`, err)); });
    this.bot.on("video", (ctx) => { void this.handleMessage(ctx as unknown as MessageContext).catch((err) => console.error(`[${this.platform}] message handler error:`, err)); });
    this.bot.on("document", (ctx) => { void this.handleMessage(ctx as unknown as MessageContext).catch((err) => console.error(`[${this.platform}] message handler error:`, err)); });
    this.bot.on("voice", (ctx) => { void this.handleMessage(ctx as unknown as MessageContext).catch((err) => console.error(`[${this.platform}] message handler error:`, err)); });
    this.bot.on("audio", (ctx) => { void this.handleMessage(ctx as unknown as MessageContext).catch((err) => console.error(`[${this.platform}] message handler error:`, err)); });
  }

  private async handleMessage(ctx: MessageContext): Promise<void> {
    const message = await buildTelegramChannelMessage({
      platform: this.platform,
      telegram: this.bot.telegram as any,
      ctx,
      mediaDir: this.mediaDir,
    });
    for (const handler of this.handlers) {
      await handler(message);
    }
  }

  async sendMessage(chatId: string, content: MessageContent, options: SendMessageOptions = {}): Promise<void> {
    await sendTelegramMessage(this.bot.telegram as any, chatId, content, options);
  }

  onMessage(handler: ChannelMessageHandler): void {
    this.handlers.push(handler);
  }

  onCommand(handler: ChannelCommandHandler): void {
    this.commandHandlers.push(handler);
  }

  async setReaction(chatId: string, messageId: string, emoji: string): Promise<void> {
    const trimmed = emoji.trim();
    if (!trimmed) {
      throw new Error("Reaction emoji is required");
    }

    const mid = parseTelegramMessageId(messageId, "channel-message-id");

    await this.bot.telegram.callApi("setMessageReaction", {
      chat_id: chatId,
      message_id: mid,
      reaction: [{ type: "emoji", emoji: trimmed as unknown as never }],
    });
  }

  async setTyping(chatId: string, active: boolean): Promise<void> {
    if (!chatId.trim()) return;

    if (!active) {
      const timer = this.typingTimers.get(chatId);
      if (timer) clearInterval(timer);
      this.typingTimers.delete(chatId);
      this.typingInFlight.delete(chatId);
      return;
    }

    if (this.typingTimers.has(chatId)) {
      return;
    }

    await this.sendTypingHeartbeat(chatId);

    const timer = setInterval(() => {
      void this.sendTypingHeartbeat(chatId);
    }, TELEGRAM_TYPING_HEARTBEAT_MS);

    this.typingTimers.set(chatId, timer);
  }

  private async sendTypingHeartbeat(chatId: string): Promise<void> {
    if (this.stopped || !this.started) return;
    if (this.typingInFlight.has(chatId)) return;

    this.typingInFlight.add(chatId);
    try {
      await this.bot.telegram.sendChatAction(chatId, "typing");
    } catch (err) {
      const nowMs = Date.now();
      const lastMs = this.typingLastErrorAtMs.get(chatId) ?? 0;
      if (nowMs - lastMs >= TELEGRAM_TYPING_ERROR_THROTTLE_MS) {
        this.typingLastErrorAtMs.set(chatId, nowMs);
        console.warn(`[${this.platform}] Failed to send typing action for chat ${chatId}:`, err);
      }
    } finally {
      this.typingInFlight.delete(chatId);
    }
  }

  private async registerCommands(): Promise<void> {
    const commands = getUiText(this.uiLocale).telegram.commandDescriptions;
    const registered = await this.callCommandApi("setMyCommands", () => this.bot.telegram.setMyCommands(commands));
    if (registered !== null) {
      console.log(`[${this.platform}] Commands registered (${commands.length})`);
    }
  }

  async start(): Promise<void> {
    if (this.started) {
      return; // Already started, ignore duplicate calls
    }
    this.started = true;
    this.stopped = false;
    console.log(`[${this.platform}] Bot starting...`);

    // Register commands with Telegram so they appear in the / menu.
    await this.registerCommands();

    // Fire-and-forget: launch() only resolves when the bot stops,
    // so we run the retry loop in the background.
    this.launchWithRetry();
  }

  private async launchWithRetry(): Promise<void> {
    let attempt = 0;

    while (!this.stopped) {
      try {
        await this.bot.launch({ dropPendingUpdates: true });
        return; // Clean exit when bot stops normally
      } catch (err) {
        if (this.stopped) return;

        const isTimeout = err instanceof Error && err.name === "TimeoutError";
        if (isGetUpdatesConflict(err) || isTransientNetworkError(err) || isTimeout) {
          const delayMs = computeBackoff(attempt);
          const reason = isGetUpdatesConflict(err) ? "409 conflict" : isTimeout ? "handler timeout" : "network error";
          console.log(`[${this.platform}] ${reason}, retrying in ${delayMs}ms (attempt ${attempt + 1})`);
          await sleep(delayMs);
          attempt++;
          continue;
        }

        // Non-recoverable error
        console.error(`[${this.platform}] Bot launch error:`, err);
        return;
      }
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.started = false;
    for (const timer of this.typingTimers.values()) clearInterval(timer);
    this.typingTimers.clear();
    for (const timer of this.commandReplyDeleteTimers.values()) clearTimeout(timer);
    this.commandReplyDeleteTimers.clear();
    this.typingInFlight.clear();
    this.typingLastErrorAtMs.clear();
    this.bot.stop();
    console.log(`[${this.platform}] Bot stopped`);
  }
}
