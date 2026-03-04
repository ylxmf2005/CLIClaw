import assert from "node:assert/strict";
import test from "node:test";
import { HttpRouter } from "./router.js";

test("matches exact path", () => {
  const router = new HttpRouter();
  const handler = async () => "ok";
  router.get("/api/agents", handler);

  const match = router.match("GET", "/api/agents");
  assert.ok(match);
  assert.deepStrictEqual(match.params, {});
});

test("matches path with parameters", () => {
  const router = new HttpRouter();
  const handler = async () => "ok";
  router.get("/api/agents/:name", handler);

  const match = router.match("GET", "/api/agents/nex");
  assert.ok(match);
  assert.deepStrictEqual(match.params, { name: "nex" });
});

test("matches path with multiple parameters", () => {
  const router = new HttpRouter();
  const handler = async () => "ok";
  router.get("/api/agents/:name/chats/:chatId/relay", handler);

  const match = router.match("GET", "/api/agents/nex/chats/abc123/relay");
  assert.ok(match);
  assert.deepStrictEqual(match.params, { name: "nex", chatId: "abc123" });
});

test("returns null for wrong method", () => {
  const router = new HttpRouter();
  router.get("/api/agents", async () => "ok");

  const match = router.match("POST", "/api/agents");
  assert.strictEqual(match, null);
});

test("returns null for wrong path", () => {
  const router = new HttpRouter();
  router.get("/api/agents", async () => "ok");

  const match = router.match("GET", "/api/teams");
  assert.strictEqual(match, null);
});

test("returns null for path with extra segments", () => {
  const router = new HttpRouter();
  router.get("/api/agents", async () => "ok");

  const match = router.match("GET", "/api/agents/extra");
  assert.strictEqual(match, null);
});

test("decodes URI-encoded path parameters", () => {
  const router = new HttpRouter();
  router.get("/api/agents/:name", async () => "ok");

  const match = router.match("GET", "/api/agents/my%20agent");
  assert.ok(match);
  assert.deepStrictEqual(match.params, { name: "my agent" });
});

test("registers and matches different methods for same path", () => {
  const router = new HttpRouter();
  const getHandler = async () => "get";
  const postHandler = async () => "post";

  router.get("/api/agents", getHandler);
  router.post("/api/agents", postHandler);

  const getMatch = router.match("GET", "/api/agents");
  const postMatch = router.match("POST", "/api/agents");

  assert.ok(getMatch);
  assert.ok(postMatch);
  assert.strictEqual(getMatch.handler, getHandler);
  assert.strictEqual(postMatch.handler, postHandler);
});
