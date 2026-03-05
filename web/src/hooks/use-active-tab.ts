"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import type { BottomTab } from "@/lib/types";

/**
 * Derives the left panel's active tab from the URL pathname.
 * Allows local override when user clicks a different tab.
 * Resets the override when the pathname changes.
 */
export function useActiveTab(): [BottomTab, (tab: BottomTab) => void] {
  const pathname = usePathname();

  function deriveTab(p: string): BottomTab {
    if (p.startsWith("/admin")) return "settings";
    if (p.startsWith("/agents")) return "agents";
    if (p.startsWith("/teams")) return "teams";
    return "agents";
  }

  const derived = deriveTab(pathname);
  const [override, setOverride] = useState<BottomTab | null>(null);

  // Reset override when pathname changes (navigating to new route)
  useEffect(() => {
    setOverride(null);
  }, [pathname]);

  const activeTab = override ?? derived;

  return [activeTab, setOverride];
}
