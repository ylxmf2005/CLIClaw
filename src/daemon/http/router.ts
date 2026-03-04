/**
 * Minimal path-based HTTP router.
 *
 * Supports path parameters (`:param`) and method-based routing.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE" | "OPTIONS";

export interface RouteParams {
  [key: string]: string;
}

export interface RouteContext {
  params: RouteParams;
  query: URLSearchParams;
  body: unknown;
  token: string | null;
}

export type RouteHandler = (
  ctx: RouteContext,
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<unknown>;

interface Route {
  method: HttpMethod;
  segments: string[];
  handler: RouteHandler;
}

/**
 * Simple path-based router with parameter extraction.
 */
export class HttpRouter {
  private routes: Route[] = [];

  get(path: string, handler: RouteHandler): void {
    this.addRoute("GET", path, handler);
  }

  post(path: string, handler: RouteHandler): void {
    this.addRoute("POST", path, handler);
  }

  patch(path: string, handler: RouteHandler): void {
    this.addRoute("PATCH", path, handler);
  }

  delete(path: string, handler: RouteHandler): void {
    this.addRoute("DELETE", path, handler);
  }

  private addRoute(method: HttpMethod, path: string, handler: RouteHandler): void {
    const segments = path.split("/").filter(Boolean);
    this.routes.push({ method, segments, handler });
  }

  /**
   * Match a request to a route.
   * Returns the handler and extracted parameters, or null if no match.
   */
  match(method: string, pathname: string): { handler: RouteHandler; params: RouteParams } | null {
    const reqSegments = pathname.split("/").filter(Boolean);

    for (const route of this.routes) {
      if (route.method !== method) continue;
      if (route.segments.length !== reqSegments.length) continue;

      const params: RouteParams = {};
      let matched = true;

      for (let i = 0; i < route.segments.length; i++) {
        const routeSeg = route.segments[i]!;
        const reqSeg = reqSegments[i]!;

        if (routeSeg.startsWith(":")) {
          params[routeSeg.slice(1)] = decodeURIComponent(reqSeg);
        } else if (routeSeg !== reqSeg) {
          matched = false;
          break;
        }
      }

      if (matched) {
        return { handler: route.handler, params };
      }
    }

    return null;
  }
}
