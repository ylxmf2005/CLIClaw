/**
 * Envelope HTTP route handlers.
 */

import type { HttpRouter } from "./router.js";
import type { RpcMethodRegistry } from "../ipc/types.js";
import { requireTokenFromCtx } from "./route-helpers.js";

/**
 * Register envelope routes.
 */
export function registerEnvelopeRoutes(router: HttpRouter, rpc: RpcMethodRegistry): void {
  // POST /api/envelopes
  router.post("/api/envelopes", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    const body = (ctx.body ?? {}) as Record<string, unknown>;
    return rpc["envelope.send"]!({
      token,
      to: body.to,
      from: body.from,
      text: body.text,
      attachments: body.attachments,
      deliverAt: body.deliverAt,
      interruptNow: body.interruptNow,
      parseMode: body.parseMode,
      replyToEnvelopeId: body.replyToEnvelopeId,
      origin: "cli",
    });
  });

  // GET /api/envelopes
  router.get("/api/envelopes", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    const q = ctx.query;

    const params: Record<string, unknown> = { token };
    if (q.has("to")) params.to = q.get("to");
    if (q.has("from")) params.from = q.get("from");
    if (q.has("status")) params.status = q.get("status");
    if (q.has("limit")) params.limit = parseInt(q.get("limit")!, 10);
    if (q.has("createdAfter")) params.createdAfter = q.get("createdAfter");
    if (q.has("createdBefore")) params.createdBefore = q.get("createdBefore");
    if (q.has("chatId")) params.chatId = q.get("chatId");

    return rpc["envelope.list"]!(params);
  });

  // GET /api/envelopes/:id/thread
  router.get("/api/envelopes/:id/thread", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    return rpc["envelope.thread"]!({ token, envelopeId: ctx.params.id });
  });
}
