import assert from "node:assert/strict";
import test from "node:test";

import { parseDailyResetAt } from "./session-policy.js";

test("parseDailyResetAt accepts strict HH:MM format", () => {
  const parsed = parseDailyResetAt("03:07");
  assert.deepEqual(parsed, {
    hour: 3,
    minute: 7,
    normalized: "03:07",
  });
});

test("parseDailyResetAt trims surrounding whitespace", () => {
  const parsed = parseDailyResetAt(" 23:59 ");
  assert.deepEqual(parsed, {
    hour: 23,
    minute: 59,
    normalized: "23:59",
  });
});

test("parseDailyResetAt rejects single-digit hour to enforce HH:MM", () => {
  assert.throws(
    () => parseDailyResetAt("3:07"),
    /expected HH:MM/
  );
});
