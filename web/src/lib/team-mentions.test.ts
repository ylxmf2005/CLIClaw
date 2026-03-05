import assert from "node:assert/strict";
import test from "node:test";

import { resolveTeamMentions, isAllMention, buildMentionsPayload } from "./team-mentions";

// ── resolveTeamMentions ──────────────────────────────────────────

test("resolveTeamMentions returns invalid when no mentions provided", () => {
  const result = resolveTeamMentions([], "hello team", ["nex", "echo"]);
  assert.equal(result.kind, "invalid");
  assert.deepEqual(result.recipients, []);
  assert.equal(result.text, "hello team");
});

test("resolveTeamMentions resolves single mention to targeted", () => {
  const result = resolveTeamMentions(["nex"], "please check this", ["nex", "echo"]);
  assert.equal(result.kind, "targeted");
  assert.deepEqual(result.recipients, ["nex"]);
  assert.equal(result.text, "please check this");
});

test("resolveTeamMentions resolves multiple mentions to targeted", () => {
  const result = resolveTeamMentions(["nex", "echo"], "sync up", ["nex", "echo", "walt"]);
  assert.equal(result.kind, "targeted");
  assert.deepEqual(result.recipients, ["nex", "echo"]);
  assert.equal(result.text, "sync up");
});

test("resolveTeamMentions resolves @all to broadcast", () => {
  const result = resolveTeamMentions(["@all"], "standup in 5", ["nex", "echo"]);
  assert.equal(result.kind, "broadcast");
  assert.deepEqual(result.recipients, ["nex", "echo"]);
  assert.equal(result.text, "standup in 5");
});

test("resolveTeamMentions handles case-insensitive @ALL", () => {
  const result = resolveTeamMentions(["@ALL"], "status update", ["nex", "echo"]);
  assert.equal(result.kind, "broadcast");
  assert.deepEqual(result.recipients, ["nex", "echo"]);
});

test("resolveTeamMentions handles case-insensitive member names", () => {
  const result = resolveTeamMentions(["NEX"], "hello", ["nex", "echo"]);
  assert.equal(result.kind, "targeted");
  assert.deepEqual(result.recipients, ["nex"]);
});

test("resolveTeamMentions reports invalid member names", () => {
  const result = resolveTeamMentions(["nex", "ghost"], "ping", ["nex", "echo"]);
  assert.equal(result.kind, "invalid");
  assert.deepEqual(result.recipients, []);
  if (result.kind === "invalid") {
    assert.deepEqual(result.invalidNames, ["ghost"]);
  }
});

test("resolveTeamMentions deduplicates mentions", () => {
  const result = resolveTeamMentions(["nex", "nex"], "hello", ["nex", "echo"]);
  assert.equal(result.kind, "targeted");
  assert.deepEqual(result.recipients, ["nex"]);
});

test("resolveTeamMentions trims text", () => {
  const result = resolveTeamMentions(["nex"], "  hello  ", ["nex"]);
  assert.equal(result.text, "hello");
});

// ── isAllMention ─────────────────────────────────────────────────

test("isAllMention recognizes @all variants", () => {
  assert.equal(isAllMention("@all"), true);
  assert.equal(isAllMention("@ALL"), true);
  assert.equal(isAllMention("@All"), true);
  assert.equal(isAllMention("all"), true);
  assert.equal(isAllMention("nex"), false);
});

// ── buildMentionsPayload ─────────────────────────────────────────

test("buildMentionsPayload normalizes @all", () => {
  assert.deepEqual(buildMentionsPayload(["@all"]), ["@all"]);
  assert.deepEqual(buildMentionsPayload(["@ALL"]), ["@all"]);
});

test("buildMentionsPayload passes through individual names", () => {
  assert.deepEqual(buildMentionsPayload(["nex", "echo"]), ["nex", "echo"]);
});
