import assert from "node:assert/strict";
import test from "node:test";

import { resolveTeamRecipients } from "./team-mentions";

test("resolveTeamRecipients uses broadcast when no leading mention", () => {
  const result = resolveTeamRecipients("hello team", ["nex", "echo"]);
  assert.equal(result.kind, "broadcast");
  assert.deepEqual(result.recipients, ["nex", "echo"]);
  assert.equal(result.text, "hello team");
});

test("resolveTeamRecipients targets mentioned member", () => {
  const result = resolveTeamRecipients("@nex please check this", ["nex", "echo"]);
  assert.equal(result.kind, "single");
  assert.deepEqual(result.recipients, ["nex"]);
  assert.equal(result.text, "please check this");
});

test("resolveTeamRecipients supports case-insensitive @all", () => {
  const result = resolveTeamRecipients("@ALL status update", ["nex", "echo"]);
  assert.equal(result.kind, "broadcast");
  assert.deepEqual(result.recipients, ["nex", "echo"]);
  assert.equal(result.text, "status update");
});

test("resolveTeamRecipients reports unknown member mention", () => {
  const result = resolveTeamRecipients("@ghost ping", ["nex", "echo"]);
  assert.equal(result.kind, "unknown");
  assert.deepEqual(result.recipients, []);
  assert.equal(result.mentioned, "ghost");
});
