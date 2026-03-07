/**
 * Adapter lifecycle helpers for the daemon.
 *
 * Extracted from daemon.ts to keep files under 500 lines.
 * Handles loading bindings, creating adapters, and removing them.
 */

import type { CliClawDatabase } from "./db/database.js";
import type { ChatAdapter } from "../adapters/types.js";
import type { ChannelBridge } from "./bridges/channel-bridge.js";
import { TelegramAdapter } from "../adapters/telegram.adapter.js";
import { resolveUiLocale } from "../shared/ui-locale.js";
import { logEvent } from "../shared/daemon-log.js";

export interface AdapterManagerDeps {
  db: CliClawDatabase;
  adapters: Map<string, ChatAdapter>;
  bridge: ChannelBridge;
  running: boolean;
}

/**
 * Load bindings from database and create adapters.
 */
export async function loadBindings(deps: AdapterManagerDeps): Promise<void> {
  const bindings = deps.db.listBindings();

  for (const binding of bindings) {
    await createAdapterForBinding(deps, binding.adapterType, binding.adapterToken);
  }
}

/**
 * Create an adapter for a binding.
 */
export async function createAdapterForBinding(
  deps: AdapterManagerDeps,
  adapterType: string,
  adapterToken: string,
): Promise<ChatAdapter | null> {
  if (deps.adapters.has(adapterToken)) {
    return deps.adapters.get(adapterToken)!;
  }

  let adapter: ChatAdapter;

  switch (adapterType) {
    case "telegram":
      adapter = new TelegramAdapter(
        adapterToken,
        resolveUiLocale(deps.db.getConfig("ui_locale")),
        {
          getCommandReplyAutoDeleteSeconds: () =>
            deps.db.getRuntimeTelegramCommandReplyAutoDeleteSeconds(),
        },
      );
      break;
    default:
      logEvent("error", "adapter-unknown-type", { "adapter-type": adapterType });
      return null;
  }

  deps.adapters.set(adapterToken, adapter);
  deps.bridge.connect(adapter, adapterToken);

  if (deps.running) {
    await adapter.start();
  }

  return adapter;
}

/**
 * Remove an adapter.
 */
export async function removeAdapter(
  adapters: Map<string, ChatAdapter>,
  adapterToken: string,
): Promise<void> {
  const adapter = adapters.get(adapterToken);
  if (adapter) {
    await adapter.stop();
    adapters.delete(adapterToken);
  }
}
