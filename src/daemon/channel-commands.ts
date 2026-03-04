import type { ChannelCommand, ChannelCommandHandler, ChannelCommandResponse } from "../adapters/types.js";
import { formatAgentAddress, formatChannelAddress } from "../adapters/types.js";
import type { AgentExecutor } from "../agent/executor.js";
import type { OneshotType } from "../envelope/types.js";
import { DEFAULT_AGENT_PROVIDER } from "../shared/defaults.js";
import { logEvent, errorMessage } from "../shared/daemon-log.js";
import { formatShortId } from "../shared/id-format.js";
import { resolveUiLocale } from "../shared/ui-locale.js";
import { getUiText } from "../shared/ui-text.js";
import type { HiBossDatabase } from "./db/database.js";
import type { MessageRouter } from "./router/message-router.js";
import { handleProviderSwitchCommand } from "./channel-provider-command.js";
import { buildAgentStatusText } from "./channel-status-command.js";
import { handleTraceCommand } from "./channel-trace-command.js";

type EnrichedChannelCommand = ChannelCommand & { agentName?: string };

export function createChannelCommandHandler(params: {
  db: HiBossDatabase;
  executor: AgentExecutor;
  router: MessageRouter;
  hibossDir?: string;
}): ChannelCommandHandler {
  return (command): ChannelCommandResponse | void | Promise<ChannelCommandResponse | void> => {
    const ui = getUiText(resolveUiLocale(params.db.getConfig("ui_locale")));
    const c = command as EnrichedChannelCommand;
    if (typeof c.command !== "string") return;

    if (c.command === "new" && typeof c.agentName === "string" && c.agentName) {
      const agent = params.db.getAgentByNameCaseInsensitive(c.agentName);
      if (!agent) return { text: ui.channel.agentNotFound };
      const adapterType = c.adapterType ?? "telegram";

      const switched = params.db.createFreshChannelSession({
        agentName: agent.name,
        adapterType,
        chatId: c.chatId,
        ownerUserId: c.userToken,
        provider: agent.provider ?? DEFAULT_AGENT_PROVIDER,
      });
      if (switched.oldSessionId) {
        params.executor.closeActiveHistorySessionForChannel(agent.name, c.chatId, `${adapterType}:/new`);
      }
      params.executor.invalidateChannelSessionCache(agent.name, adapterType, c.chatId);

      return {
        text: [
          "session-new: ok",
          `old-session-id: ${switched.oldSessionId ? formatShortId(switched.oldSessionId) : "(none)"}`,
          `new-session-id: ${formatShortId(switched.newSession.id)}`,
        ].join("\n"),
      };
    }

    if (c.command === "status" && typeof c.agentName === "string" && c.agentName) {
      return { text: buildAgentStatusText({ db: params.db, executor: params.executor, agentName: c.agentName }) };
    }

    if (c.command === "trace" && typeof c.agentName === "string" && c.agentName) {
      return handleTraceCommand({
        db: params.db,
        hibossDir: params.hibossDir,
        agentName: c.agentName,
        args: c.args,
        ui,
      });
    }

    if (c.command === "provider" && typeof c.agentName === "string" && c.agentName) {
      return handleProviderSwitchCommand({
        db: params.db,
        executor: params.executor,
        hibossDir: params.hibossDir,
        agentName: c.agentName,
        adapterType: c.adapterType,
        args: c.args,
        ui,
      });
    }

    if (c.command === "abort" && typeof c.agentName === "string" && c.agentName) {
      const adapterType = c.adapterType ?? "telegram";
      const cancelledRun = params.executor.abortCurrentRunForChannel(
        c.agentName,
        adapterType,
        c.chatId,
        `${adapterType}:/abort`
      );
      const clearedPendingCount = params.db.markDuePendingNonCronEnvelopesDoneForAgentChannel(
        c.agentName,
        adapterType,
        c.chatId,
        {
          reason: "abort-clear",
          origin: "internal",
          outcome: "cleared-by-abort-command",
        }
      );
      const lines = [
        ui.channel.abortOk,
        `agent-name: ${c.agentName}`,
        `cancelled-run: ${cancelledRun ? "true" : "false"}`,
        `cleared-pending-count: ${clearedPendingCount}`,
      ];
      return { text: lines.join("\n") };
    }

    // One-shot commands: /isolated and /clone
    if (
      (c.command === "isolated" || c.command === "clone") &&
      typeof c.agentName === "string" && c.agentName
    ) {
      return handleOneshotCommand(params, c, c.command as OneshotType);
    }
  };
}

async function handleOneshotCommand(
  params: { db: HiBossDatabase; router: MessageRouter },
  command: EnrichedChannelCommand,
  mode: OneshotType,
): Promise<ChannelCommandResponse | void> {
  const ui = getUiText(resolveUiLocale(params.db.getConfig("ui_locale")));
  const agentName = command.agentName!;
  const text = command.args?.trim();

  if (!text) {
    return { text: ui.channel.usage(mode) };
  }

  const fromAddress = formatChannelAddress(command.adapterType ?? "telegram", command.chatId);
  const toAddress = formatAgentAddress(agentName);

  try {
    const adapterType = command.adapterType ?? "telegram";
    const agent = params.db.getAgentByNameCaseInsensitive(agentName);
    if (!agent) {
      return { text: ui.channel.agentNotFound };
    }
    const channelSession = params.db.getOrCreateChannelSession({
      agentName: agent.name,
      adapterType,
      chatId: command.chatId,
      ownerUserId: command.userToken,
      provider: agent.provider ?? DEFAULT_AGENT_PROVIDER,
    });
    await params.router.routeEnvelope({
      from: fromAddress,
      to: toAddress,
      fromBoss: command.fromBoss === true,
      content: { text },
      metadata: {
        origin: "channel",
        oneshotType: mode,
        platform: adapterType,
        channelMessageId: command.messageId,
        channelSessionId: channelSession.session.id,
        ...(command.userToken ? { userToken: command.userToken } : {}),
        channelUser:
          command.channelUserId || command.channelUsername
            ? {
                ...(command.channelUserId ? { id: command.channelUserId } : {}),
                ...(command.channelUsername ? { username: command.channelUsername } : {}),
              }
            : undefined,
        chat: { id: command.chatId },
      },
    });
  } catch (err) {
    logEvent("error", "oneshot-envelope-create-failed", {
      "agent-name": agentName,
      mode,
      error: errorMessage(err),
    });
    return { text: ui.channel.failedToCreateEnvelope(mode) };
  }

  return {
    text: [
      ui.channel.turnInitiated(mode),
      `oneshot-mode: ${mode}`,
      "chat-session-changed: false",
    ].join("\n"),
  };
}
