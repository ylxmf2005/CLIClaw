/**
 * Register all HTTP routes.
 */

import { HttpRouter } from "./router.js";
import type { RpcMethodRegistry } from "../ipc/types.js";
import type { DaemonContext } from "../rpc/context.js";
import { registerAuthRoutes } from "./routes-auth.js";
import { registerDaemonRoutes } from "./routes-daemon.js";
import { registerAgentRoutes } from "./routes-agents.js";
import { registerEnvelopeRoutes } from "./routes-envelopes.js";
import { registerSessionRoutes } from "./routes-sessions.js";
import { registerUploadRoutes } from "./routes-upload.js";
import { registerTeamRoutes } from "./routes-teams.js";
import { registerCronRoutes } from "./routes-cron.js";

/**
 * Create an HttpRouter with all routes registered.
 */
export function createRoutes(rpc: RpcMethodRegistry, daemonCtx: DaemonContext): HttpRouter {
  const router = new HttpRouter();

  registerAuthRoutes(router, rpc);
  registerDaemonRoutes(router, rpc);
  registerAgentRoutes(router, rpc);
  registerEnvelopeRoutes(router, rpc);
  registerSessionRoutes(router, rpc, daemonCtx);
  registerUploadRoutes(router, daemonCtx);
  registerTeamRoutes(router, rpc);
  registerCronRoutes(router, rpc);

  return router;
}
