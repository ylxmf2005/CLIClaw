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
    <div className="flex min-h-screen items-center justify-center bg-grid noise-overlay">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-glow/[0.03] blur-[120px]" />
        <div className="absolute left-1/3 top-2/3 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-lavender-info/[0.02] blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-sm px-6">
        {/* Logo / Brand */}
        <div className="mb-10 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02] shadow-[0_0_40px_rgba(0,212,255,0.08)]">
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
          <p className="mt-1.5 text-sm text-muted-foreground/60">
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
            <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
              Admin Token
            </label>
            <Input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Enter your admin token"
              className="h-11 border-white/[0.08] bg-white/[0.03] text-sm placeholder:text-muted-foreground/30 focus:border-cyan-glow/30 focus:ring-cyan-glow/10"
              autoFocus
            />
          </div>

          <Button
            type="submit"
            disabled={isLoading || !token.trim()}
            className="h-11 w-full bg-cyan-glow text-sm font-semibold text-black shadow-[0_0_20px_rgba(0,212,255,0.2)] hover:bg-cyan-glow/90 hover:shadow-[0_0_30px_rgba(0,212,255,0.3)] disabled:opacity-50 disabled:shadow-none"
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {isLoading ? "Connecting..." : "Connect to Daemon"}
          </Button>
        </form>

        <p className="mt-6 text-center text-[11px] text-muted-foreground/30">
          Token from{" "}
          <code className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px]">
            hiboss setup
          </code>
        </p>
      </div>
    </div>
  );
}
