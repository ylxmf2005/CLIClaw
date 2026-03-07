import { parseAddress } from "../../adapters/types.js";
import { createNewAgentChatId, computeTeamChatId } from "../../shared/chat-scope.js";
import { parseDateTimeInputToUnixMsInTimeZone } from "../../shared/time.js";
import { RPC_ERRORS } from "../ipc/types.js";
import type { DaemonContext } from "./context.js";
import { rpcError } from "./context.js";
import { resolveEnvelopeIdInput } from "./resolve-envelope-id.js";
import type { EnvelopeSendCoreInput, EnvelopeSendCoreResult } from "./envelope-send-core.js";

/**
 * Send an envelope as the boss (admin token). Sets fromBoss: true.
 * Supports agent destinations and team destinations (when mentions provided).
 */
export async function sendEnvelopeFromBoss(params: {
  ctx: DaemonContext;
  input: Omit<EnvelopeSendCoreInput, "chatScope">;
}): Promise<EnvelopeSendCoreResult> {
  const p = params.input;
  if (typeof p.to !== "string" || !p.to.trim()) {
    rpcError(RPC_ERRORS.INVALID_PARAMS, "Invalid to");
  }

  const toInput = p.to.trim();
  let destination: ReturnType<typeof parseAddress>;
  try {
    destination = parseAddress(toInput);
  } catch (err) {
    rpcError(RPC_ERRORS.INVALID_PARAMS, err instanceof Error ? err.message : "Invalid to");
  }

  if (
    destination.type !== "agent" &&
    destination.type !== "agent-new-chat" &&
    destination.type !== "agent-chat" &&
    destination.type !== "team"
  ) {
    rpcError(
      RPC_ERRORS.INVALID_PARAMS,
      "Admin can only send to agent destinations (agent:<name>:<chatId> or agent:<name>:new)"
    );
  }

  const metadata: Record<string, unknown> = {};
  let deliverAt: number | undefined;
  let interruptNow = false;
  let fromBoss = true;

  // Allow admin to specify a custom `from` address (channel address only).
  // This enables "send-as-adapter" from the web console.
  let from = "channel:web:boss";
  if (typeof p.from === "string" && p.from.trim()) {
    const fromInput = p.from.trim();
    let fromParsed: ReturnType<typeof parseAddress>;
    try {
      fromParsed = parseAddress(fromInput);
    } catch (err) {
      rpcError(RPC_ERRORS.INVALID_PARAMS, err instanceof Error ? err.message : "Invalid from");
    }
    if (fromParsed.type !== "channel") {
      rpcError(RPC_ERRORS.INVALID_PARAMS, "Custom from must be a channel address (channel:<adapter>:<chatId>)");
    }
    from = fromInput;
    fromBoss = false;
    metadata.origin = "console";
  }

  // --- Team destination with mentions ---
  if (destination.type === "team") {
    // Console-origin team sends require mentions
    if (metadata.origin === "console") {
      if (!Array.isArray(p.mentions) || p.mentions.length === 0) {
        rpcError(
          RPC_ERRORS.INVALID_PARAMS,
          "Team messages require at least one mention"
        );
      }
    } else if (!Array.isArray(p.mentions) || p.mentions.length === 0) {
      rpcError(
        RPC_ERRORS.INVALID_PARAMS,
        "Admin can only send to agent destinations (agent:<name>:<chatId> or agent:<name>:new)"
      );
    }

    const team = params.ctx.db.getTeamByNameCaseInsensitive(destination.teamName);
    if (!team) {
      rpcError(RPC_ERRORS.NOT_FOUND, "Team not found");
    }
    if (team.status !== "active") {
      rpcError(RPC_ERRORS.INVALID_PARAMS, "Cannot send to archived team");
    }

    const allMembers = params.ctx.db.listTeamMemberAgentNames(team.name);

    let recipients: string[];
    if (p.mentions.length === 1 && p.mentions[0] === "@all") {
      recipients = [...new Set(allMembers)];
    } else {
      // Validate each mention against team members
      recipients = [];
      for (const mention of p.mentions) {
        const found = allMembers.find(
          (name) => name.toLowerCase() === mention.toLowerCase()
        );
        if (!found) {
          rpcError(
            RPC_ERRORS.INVALID_PARAMS,
            `Invalid mention: '${mention}' is not a member of team '${team.name}'`
          );
        }
        if (!recipients.includes(found)) {
          recipients.push(found);
        }
      }
    }

    if (recipients.length === 0) {
      return { ids: [], noRecipients: true };
    }

    const teamChatScope = computeTeamChatId(team.name);
    const ids: string[] = [];
    for (const recipient of recipients) {
      const sent = await sendEnvelopeFromBoss({
        ctx: params.ctx,
        input: {
          ...p,
          to: `agent:${recipient}:${teamChatScope}`,
        },
      });
      if (!("id" in sent)) {
        rpcError(RPC_ERRORS.INTERNAL_ERROR, "Unexpected team broadcast result");
      }
      ids.push(sent.id);
    }
    return { ids };
  }

  // --- Agent destination ---
  const destAgent = params.ctx.db.getAgentByNameCaseInsensitive(destination.agentName);
  if (!destAgent) {
    rpcError(RPC_ERRORS.NOT_FOUND, "Agent not found");
  }

  let to: string;
  if (destination.type === "agent-new-chat") {
    const chatId = createNewAgentChatId();
    metadata.chatScope = chatId;
    to = `agent:${destAgent.name}:${chatId}`;
  } else if (destination.type === "agent-chat") {
    metadata.chatScope = destination.chatId;
    to = `agent:${destAgent.name}:${destination.chatId}`;
  } else {
    rpcError(
      RPC_ERRORS.INVALID_PARAMS,
      "Invalid to (agent destinations must use agent:<name>:new or agent:<name>:<chat-id>)"
    );
  }

  // Stamp mentions on metadata when present (from team fan-out)
  if (Array.isArray(p.mentions) && p.mentions.length > 0) {
    metadata.mentions = p.mentions;
  }

  if (p.interruptNow !== undefined) {
    if (typeof p.interruptNow !== "boolean") {
      rpcError(RPC_ERRORS.INVALID_PARAMS, "Invalid interrupt-now");
    }
    interruptNow = p.interruptNow;
  }

  // Only set origin from params if not already set by custom `from` (console origin).
  if (metadata.origin === undefined) {
    if (p.origin !== undefined) {
      if (p.origin !== "cli" && p.origin !== "internal") {
        rpcError(RPC_ERRORS.INVALID_PARAMS, "Invalid origin");
      }
      metadata.origin = p.origin;
    } else {
      metadata.origin = "cli";
    }
  }

  if (interruptNow && p.deliverAt !== undefined) {
    rpcError(RPC_ERRORS.INVALID_PARAMS, "interrupt-now cannot be used with deliver-at");
  }

  if (p.replyToEnvelopeId !== undefined) {
    if (typeof p.replyToEnvelopeId !== "string" || !p.replyToEnvelopeId.trim()) {
      rpcError(RPC_ERRORS.INVALID_PARAMS, "Invalid reply-to-envelope-id");
    }
    metadata.replyToEnvelopeId = resolveEnvelopeIdInput(params.ctx.db, p.replyToEnvelopeId.trim());
  }

  if (p.deliverAt) {
    try {
      deliverAt = parseDateTimeInputToUnixMsInTimeZone(p.deliverAt, params.ctx.db.getBossTimezone());
    } catch (err) {
      rpcError(
        RPC_ERRORS.INVALID_PARAMS,
        err instanceof Error ? err.message : "Invalid deliver-at"
      );
    }
  }

  let interruptedWork = false;
  if (interruptNow) {
    interruptedWork = params.ctx.executor.abortCurrentRun(
      destAgent.name,
      "rpc:envelope.send:boss-interrupt-now"
    );
  }

  const finalMetadata = Object.keys(metadata).length > 0 ? metadata : undefined;

  try {
    const envelope = await params.ctx.router.routeEnvelope({
      from,
      to,
      fromBoss,
      content: {
        text: p.text,
        attachments: p.attachments,
      },
      priority: interruptNow ? 1 : 0,
      deliverAt,
      metadata: finalMetadata,
    });

    params.ctx.scheduler.onEnvelopeCreated(envelope);
    if (interruptNow) {
      return {
        id: envelope.id,
        interruptedWork,
        priorityApplied: true,
      };
    }
    return { id: envelope.id };
  } catch (err) {
    const e = err as Error & { data?: unknown };
    if (e.data && typeof e.data === "object") {
      const id = (e.data as Record<string, unknown>).envelopeId;
      if (typeof id === "string" && id.trim()) {
        const env = params.ctx.db.getEnvelopeById(id.trim());
        if (env) {
          params.ctx.scheduler.onEnvelopeCreated(env);
        }
      }
    }
    throw err;
  }
}
