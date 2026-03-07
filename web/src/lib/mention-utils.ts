import type { Envelope } from "./types";
import { formatChannelMentionTarget, parseAddress } from "./utils";

export interface MentionInfo {
  /** The name to display after @ */
  target: string;
  /** "outbound" = agent sent to someone else, "inbound" = someone sent to this agent */
  direction: "outbound" | "inbound";
}

/**
 * Derives an @mention prefix for display in a message bubble.
 *
 * Rules (from design doc Decision 8):
 * - Outbound (agent sends to someone else): show @recipient
 * - Inbound (another agent sends to this agent): show @this-agent
 * - Channel: @channel-name
 * - Team: @team-name
 *
 * Returns null if no mention prefix should be shown (e.g., agent talking to itself
 * or boss sending directly to the current agent).
 */
export function deriveMention(
  envelope: Envelope,
  currentAgent: string
): MentionInfo | null {
  const from = parseAddress(envelope.from);
  const to = parseAddress(envelope.to);

  // Boss sending to this agent — no mention needed
  if (envelope.fromBoss && to.name === currentAgent) {
    return null;
  }

  // Agent sending to a channel
  if (to.type === "channel") {
    return {
      target: formatChannelMentionTarget(to.adapterType, to.chatId),
      direction: "outbound",
    };
  }

  // Agent sending to a team
  if (to.type === "team") {
    return { target: to.name, direction: "outbound" };
  }

  // Agent-to-agent communication
  if (from.type === "agent" && to.type === "agent") {
    // Same agent talking to itself — no mention
    if (from.name === to.name) return null;

    // Current agent is viewing their own chat
    if (from.name === currentAgent) {
      // Outbound: this agent sent to another
      return { target: to.name, direction: "outbound" };
    }
    if (to.name === currentAgent) {
      // Inbound: another agent sent to this agent
      return { target: currentAgent, direction: "inbound" };
    }

    // Viewing a third-party conversation — show recipient
    return { target: to.name, direction: "outbound" };
  }

  return null;
}
