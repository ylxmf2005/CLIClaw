import assert from "node:assert/strict";
import test from "node:test";

import { TelegramAdapter } from "./telegram.adapter.js";
import type { ChannelCommand } from "./types.js";

function buildCommand(overrides: Partial<ChannelCommand> = {}): ChannelCommand {
  return {
    command: "status",
    args: "",
    chatId: "chat-1",
    ...overrides,
  };
}

test("Telegram command response schedules auto-delete when enabled", { concurrency: false }, async () => {
  const scheduledCallbacks: Array<{ ms: number | undefined; run: () => void }> = [];
  const deleteCalls: Array<{ chatId: string; messageId: number }> = [];

  const adapter = new TelegramAdapter("123:abc", "en", {
    getCommandReplyAutoDeleteSeconds: () => 30,
  });

  (adapter as any).bot = {
    telegram: {
      sendMessage: async (_chatId: string, _text: string) => ({ message_id: 101 }),
      deleteMessage: async (chatId: string, messageId: number) => {
        deleteCalls.push({ chatId, messageId });
      },
    },
    stop: () => undefined,
  };

  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;

  try {
    globalThis.setTimeout = ((callback: (...args: unknown[]) => void, _ms?: number, ..._args: unknown[]) => {
      scheduledCallbacks.push({ ms: _ms, run: () => callback() });
      return { fake: true } as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;

    globalThis.clearTimeout = ((_timer?: ReturnType<typeof setTimeout>) => undefined) as typeof clearTimeout;

    await (adapter as any).sendCommandResponse(buildCommand(), { text: "ok" });

    const autoDeleteCallbacks = scheduledCallbacks.filter((item) => item.ms === 30_000);
    assert.equal(autoDeleteCallbacks.length, 1);
    assert.equal((adapter as any).commandReplyDeleteTimers.size, 1);

    await autoDeleteCallbacks[0]!.run();
    assert.deepEqual(deleteCalls, [{ chatId: "chat-1", messageId: 101 }]);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    await adapter.stop();
  }
});

test("Telegram command response auto-delete can be disabled", { concurrency: false }, async () => {
  const scheduledCallbacks: Array<{ ms: number | undefined; run: () => void }> = [];

  const adapter = new TelegramAdapter("123:abc", "en", {
    getCommandReplyAutoDeleteSeconds: () => 0,
  });

  (adapter as any).bot = {
    telegram: {
      sendMessage: async (_chatId: string, _text: string) => ({ message_id: 202 }),
      deleteMessage: async () => undefined,
    },
    stop: () => undefined,
  };

  const originalSetTimeout = globalThis.setTimeout;

  try {
    globalThis.setTimeout = ((callback: (...args: unknown[]) => void, _ms?: number, ..._args: unknown[]) => {
      scheduledCallbacks.push({ ms: _ms, run: () => callback() });
      return { fake: true } as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;

    await (adapter as any).sendCommandResponse(buildCommand(), { text: "ok" });

    const autoDeleteCallbacks = scheduledCallbacks.filter((item) => item.ms === 30_000);
    assert.equal(autoDeleteCallbacks.length, 0);
    assert.equal((adapter as any).commandReplyDeleteTimers.size, 0);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    await adapter.stop();
  }
});
