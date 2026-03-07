import assert from "node:assert/strict";
import test from "node:test";

import type { Envelope } from "../envelope/types.js";
import {
  buildAgentFailureNoticeText,
  listChannelFailureNoticeTargets,
} from "./agent-failure-notice.js";

function makeEnvelope(params: {
  id: string;
  from: string;
  to?: string;
  createdAt: number;
}): Envelope {
  return {
    id: params.id,
    from: params.from,
    to: params.to ?? "agent:nex:default",
    fromBoss: false,
    content: { text: "ping" },
    status: "pending",
    createdAt: params.createdAt,
    metadata: { origin: "channel" },
  };
}

test("listChannelFailureNoticeTargets returns latest source envelope per channel chat", () => {
  const envelopes: Envelope[] = [
    makeEnvelope({
      id: "env-channel-1-old",
      from: "channel:console:chat-1",
      createdAt: 1_000,
    }),
    makeEnvelope({
      id: "env-channel-2",
      from: "channel:console:chat-2",
      createdAt: 1_100,
    }),
    makeEnvelope({
      id: "env-channel-1-new",
      from: "channel:console:chat-1",
      createdAt: 1_200,
    }),
    makeEnvelope({
      id: "env-agent-source",
      from: "agent:alpha:chat-3",
      createdAt: 1_300,
    }),
  ];

  const targets = listChannelFailureNoticeTargets(envelopes);
  assert.deepEqual(targets, [
    {
      toAddress: "channel:console:chat-2",
      replyToEnvelopeId: "env-channel-2",
    },
    {
      toAddress: "channel:console:chat-1",
      replyToEnvelopeId: "env-channel-1-new",
    },
  ]);
});

test("buildAgentFailureNoticeText includes short run id and agent name", () => {
  const text = buildAgentFailureNoticeText("nex", "12345678-9abc-def0-1234-56789abcdef0");
  assert.ok(text.includes('Agent "nex" is temporarily unavailable'));
  assert.ok(text.includes("run-id: 12345678"));
});
