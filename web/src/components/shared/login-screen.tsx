"use client";

import { useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCircle, Loader2 } from "lucide-react";

export function LoginScreen() {
  const { login, error, isLoading } = useAuth();
  const [token, setToken] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (token.trim()) {
      await login(token.trim());
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center noise-overlay">
      {/* Ambient glow (dark only) */}
      <div className="pointer-events-none fixed inset-0 dark:block hidden">
        <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-glow/[0.03] blur-[120px]" />
        <div className="absolute left-1/3 top-2/3 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-lavender-info/[0.02] blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-sm px-6">
        {/* Logo / Brand */}
        <div className="mb-10 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-accent/50 shadow-lg">
            <svg
              width="28"
              height="28"
              viewBox="0 0 32 32"
              fill="none"
              className="text-cyan-glow"
            >
              <path
                d="M16 2L2 9l14 7 14-7-14-7z"
                fill="currentColor"
                opacity="0.2"
              />
              <path
                d="M16 2L2 9l14 7 14-7-14-7zM2 23l14 7 14-7M2 16l14 7 14-7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Hi-Boss
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Agent Operations Console
          </p>
        </div>

        {/* Login form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-rose-alert/10 px-4 py-3 text-sm text-rose-alert">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="admin-token" className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Admin Token
            </label>
            <Input
              id="admin-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Enter your admin token"
              className="h-11 border-border bg-input text-sm placeholder:text-muted-foreground focus:border-cyan-glow/40 focus:ring-cyan-glow/10"
              autoFocus
            />
          </div>

          <Button
            type="submit"
            disabled={isLoading || !token.trim()}
            className="h-11 w-full bg-cyan-glow text-sm font-semibold text-primary-foreground hover:bg-cyan-glow/90 disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {isLoading ? "Connecting..." : "Connect to Daemon"}
          </Button>
        </form>
      </div>
    </div>
  );
}
