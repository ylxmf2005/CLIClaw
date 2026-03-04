"use client";

import { User, Users, MessageCircle, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BottomTab } from "@/lib/types";

interface BottomTabBarProps {
  activeTab: BottomTab;
  onTabChange: (tab: BottomTab) => void;
}

const TABS: { id: BottomTab; label: string; icon: typeof User }[] = [
  { id: "agents", label: "Agents", icon: User },
  { id: "teams", label: "Teams", icon: Users },
  { id: "chats", label: "Chats", icon: MessageCircle },
  { id: "settings", label: "Settings", icon: Settings },
];

export function BottomTabBar({ activeTab, onTabChange }: BottomTabBarProps) {
  return (
    <div className="flex border-t border-white/[0.04]">
      {TABS.map(({ id, label, icon: Icon }) => {
        const active = activeTab === id;
        return (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className={cn(
              "relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] transition-colors",
              active
                ? "text-cyan-glow"
                : "text-muted-foreground/50 hover:text-muted-foreground"
            )}
          >
            {active && (
              <span className="absolute left-3 right-3 top-0 h-[2px] rounded-b bg-cyan-glow" />
            )}
            <Icon className="h-4 w-4" />
            <span className="font-medium">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
