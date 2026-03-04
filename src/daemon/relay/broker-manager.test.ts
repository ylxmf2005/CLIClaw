/**
 * Unit tests for BrokerManager.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BrokerManager } from "./broker-manager.js";
import { DaemonEventBus } from "../events/event-bus.js";

describe("BrokerManager", () => {
  let eventBus: DaemonEventBus;
  let broker: BrokerManager;

  beforeEach(() => {
    eventBus = new DaemonEventBus();
    broker = new BrokerManager({ cwd: "/tmp/test", eventBus });
  });

  it("reports not available before start", () => {
    assert.equal(broker.isAvailable(), false);
  });

  // Note: start() with a real broker binary is tested via integration tests.
  // The SDK's adapter.start() spawns a child process which may throw ENOENT
  // as an unhandled event when the binary is missing. This is tested implicitly
  // by the daemon's graceful degradation — the daemon still starts without relay.

  it("stop is idempotent before start", async () => {
    await broker.stop();
    assert.equal(broker.isAvailable(), false);
  });

  it("spawnAgent returns error when not available", async () => {
    const result = await broker.spawnAgent({
      name: "test-agent",
      cli: "claude",
    });
    assert.equal(result.success, false);
    assert.ok(result.error?.includes("not available"));
  });

  it("hasAgent returns false when not available", async () => {
    const result = await broker.hasAgent("test-agent");
    assert.equal(result, false);
  });

  it("interruptAgent returns false when not available", async () => {
    const result = await broker.interruptAgent("test-agent");
    assert.equal(result, false);
  });

  it("sendInput is a no-op when not available", async () => {
    // Should not throw
    await broker.sendInput("test-agent", "hello");
  });

  it("sendMessage is a no-op when not available", async () => {
    // Should not throw
    await broker.sendMessage({ to: "test-agent", text: "hello" });
  });

  it("releaseAgent is a no-op when not available", async () => {
    // Should not throw
    await broker.releaseAgent("test-agent", "test");
  });
});
