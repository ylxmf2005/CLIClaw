import type { Envelope } from "../envelope/types.js";
import { parseAddress } from "../adapters/types.js";
import { formatShortId } from "../shared/id-format.js";

export interface AgentFailureNoticeTarget {
  toAddress: string;
  replyToEnvelopeId: string;
}

export function buildAgentFailureNoticeText(agentName: string, runId: string): string {
  return [
    `Agent "${agentName}" is temporarily unavailable and could not process your message.`,
    "Please try again in a moment.",
    "",
    `run-id: ${formatShortId(runId)}`,
  ].join("\n");
}

export function listChannelFailureNoticeTargets(
  envelopes: Envelope[],
): AgentFailureNoticeTarget[] {
  const latestByFrom = new Map<string, Envelope>();

  for (const envelope of envelopes) {
    let parsedFrom: ReturnType<typeof parseAddress>;
    try {
      parsedFrom = parseAddress(envelope.from);
    } catch {
      continue;
    }

    if (parsedFrom.type !== "channel") continue;

    const existing = latestByFrom.get(envelope.from);
    if (!existing || envelope.createdAt >= existing.createdAt) {
      latestByFrom.set(envelope.from, envelope);
    }
  }

  return [...latestByFrom.entries()]
    .sort((a, b) => a[1].createdAt - b[1].createdAt)
    .map(([toAddress, envelope]) => ({
      toAddress,
      replyToEnvelopeId: envelope.id,
    }));
}
