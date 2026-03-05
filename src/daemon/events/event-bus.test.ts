import assert from "node:assert/strict";
import test from "node:test";
import { DaemonEventBus } from "./event-bus.js";

test("emits and receives typed events", () => {
  const bus = new DaemonEventBus();
  let received: unknown = null;

  bus.on("envelope.new", (payload) => {
    received = payload;
  });
  bus.emit("envelope.new", { envelope: { id: "test-id" } as never });

  assert.deepStrictEqual(received, { envelope: { id: "test-id" } });
});

test("onAll receives all event types", () => {
  const bus = new DaemonEventBus();
  const calls: Array<[string, unknown]> = [];

  bus.onAll((event, payload) => {
    calls.push([event, payload]);
  });

  bus.emit("envelope.new", { envelope: { id: "1" } as never });
  bus.emit("agent.status", { name: "nex", agentState: "running", agentHealth: "ok" });

  assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[0]![0], "envelope.new");
  assert.strictEqual(calls[1]![0], "agent.status");
});

test("onAll unsubscribe removes listeners", () => {
  const bus = new DaemonEventBus();
  let callCount = 0;

  const unsub = bus.onAll(() => {
    callCount++;
  });
  bus.emit("envelope.done", { id: "1" });
  assert.strictEqual(callCount, 1);

  unsub();
  bus.emit("envelope.done", { id: "2" });
  assert.strictEqual(callCount, 1);
});

test("off removes specific listener", () => {
  const bus = new DaemonEventBus();
  let callCount = 0;

  const handler = () => {
    callCount++;
  };

  bus.on("agent.registered", handler);
  bus.emit("agent.registered", { name: "nex" });
  assert.strictEqual(callCount, 1);

  bus.off("agent.registered", handler);
  bus.emit("agent.registered", { name: "nex" });
  assert.strictEqual(callCount, 1);
});

test("removeAllListeners clears everything", () => {
  const bus = new DaemonEventBus();
  let callCount = 0;

  bus.on("run.started", () => { callCount++; });
  bus.on("run.completed", () => { callCount++; });

  bus.removeAllListeners();

  bus.emit("run.started", { runId: "1", agentName: "nex", startedAt: 0 });
  bus.emit("run.completed", { runId: "1", agentName: "nex", completedAt: 0, status: "completed" });

  assert.strictEqual(callCount, 0);
});
