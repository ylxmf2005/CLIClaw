import assert from "node:assert/strict";
import test from "node:test";
import { getMostRecentDailyResetBoundaryMs, getRefreshReasonForPolicy } from "./executor-support.js";

test("getMostRecentDailyResetBoundaryMs returns today's boundary after reset time", () => {
  const now = new Date(2026, 2, 3, 20, 34, 0, 0);
  const boundaryMs = getMostRecentDailyResetBoundaryMs(now, { hour: 6, minute: 0 });
  const expected = new Date(2026, 2, 3, 6, 0, 0, 0).getTime();
  assert.equal(boundaryMs, expected);
});

test("getRefreshReasonForPolicy does not repeatedly trigger daily reset after post-boundary activity", () => {
  const now = new Date(2026, 2, 3, 20, 34, 0, 0);
  const reason = getRefreshReasonForPolicy(
    {
      createdAtMs: new Date(2026, 2, 2, 19, 33, 0, 0).getTime(),
      lastRunCompletedAtMs: new Date(2026, 2, 3, 19, 52, 0, 0).getTime(),
      provider: "claude",
      agentToken: "token",
      systemInstructions: "instructions",
      workspace: "/tmp",
    },
    {
      dailyResetAt: { hour: 6, minute: 0, normalized: "06:00" },
    },
    now
  );
  assert.equal(reason, null);
});

test("getRefreshReasonForPolicy triggers daily reset when last activity is before boundary", () => {
  const now = new Date(2026, 2, 3, 20, 34, 0, 0);
  const reason = getRefreshReasonForPolicy(
    {
      createdAtMs: new Date(2026, 2, 2, 19, 33, 0, 0).getTime(),
      lastRunCompletedAtMs: new Date(2026, 2, 3, 5, 59, 59, 0).getTime(),
      provider: "claude",
      agentToken: "token",
      systemInstructions: "instructions",
      workspace: "/tmp",
    },
    {
      dailyResetAt: { hour: 6, minute: 0, normalized: "06:00" },
    },
    now
  );
  assert.equal(reason, "daily-reset-at:06:00");
});

test("getRefreshReasonForPolicy still supports idle-timeout", () => {
  const now = new Date(2026, 2, 3, 20, 34, 0, 0);
  const reason = getRefreshReasonForPolicy(
    {
      createdAtMs: new Date(2026, 2, 3, 18, 0, 0, 0).getTime(),
      lastRunCompletedAtMs: new Date(2026, 2, 3, 19, 0, 0, 0).getTime(),
      provider: "claude",
      agentToken: "token",
      systemInstructions: "instructions",
      workspace: "/tmp",
    },
    {
      idleTimeoutMs: 30 * 60 * 1000,
    },
    now
  );
  assert.equal(reason, "idle-timeout-ms:1800000");
});
