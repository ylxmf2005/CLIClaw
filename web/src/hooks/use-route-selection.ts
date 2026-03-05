"use client";

import { useParams, usePathname } from "next/navigation";

export type ActiveView = "chat" | "team" | "admin" | "home";

export interface RouteSelection {
  agentName: string | null;
  chatId: string | null;
  teamName: string | null;
  activeView: ActiveView;
}

/**
 * Derives selection state from URL params instead of reducer state.
 * Works within the (app) route group.
 */
export function useRouteSelection(): RouteSelection {
  const params = useParams<{ name?: string; chatId?: string }>();
  const pathname = usePathname();

  if (pathname.startsWith("/admin")) {
    return { agentName: null, chatId: null, teamName: null, activeView: "admin" };
  }

  if (pathname.startsWith("/teams/") && params.name) {
    return { agentName: null, chatId: null, teamName: params.name, activeView: "team" };
  }

  if (pathname.startsWith("/agents/") && params.name) {
    return {
      agentName: params.name,
      chatId: params.chatId ?? null,
      teamName: null,
      activeView: "chat",
    };
  }

  return { agentName: null, chatId: null, teamName: null, activeView: "home" };
}
