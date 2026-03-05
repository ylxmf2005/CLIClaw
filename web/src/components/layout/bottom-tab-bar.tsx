"use client";

import { User, Users, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BottomTab } from "@/lib/types";

interface BottomTabBarProps {
  activeTab: BottomTab;
  onTabChange: (tab: BottomTab) => void;
}

const TABS: { id: BottomTab; label: string; icon: typeof User }[] = [
  { id: "agents", label: "Agents", icon: User },
  { id: "teams", label: "Teams", icon: Users },
  { id: "settings", label: "Settings", icon: Settings },
];

export function BottomTabBar({ activeTab, onTabChange }: BottomTabBarProps) {
  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex: number | null = null;
    if (e.key === "ArrowRight") {
      nextIndex = (index + 1) % TABS.length;
    } else if (e.key === "ArrowLeft") {
      nextIndex = (index - 1 + TABS.length) % TABS.length;
    }
    if (nextIndex !== null) {
      e.preventDefault();
      onTabChange(TABS[nextIndex].id);
      const nextButton = (e.currentTarget.parentElement?.children[nextIndex] as HTMLElement);
      nextButton?.focus();
    }
  };

  return (
    <nav aria-label="Main navigation" role="tablist" className="flex border-t border-sidebar-border">
      {TABS.map(({ id, label, icon: Icon }, index) => {
        const active = activeTab === id;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={active}
            aria-label={label}
            onClick={() => onTabChange(id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={cn(
              "relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] transition-colors focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:outline-none",
              active
                ? "text-cyan-glow"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {active && (
              <span className="absolute left-3 right-3 top-0 h-[2px] rounded-b bg-cyan-glow" />
            )}
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span className="font-medium">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
