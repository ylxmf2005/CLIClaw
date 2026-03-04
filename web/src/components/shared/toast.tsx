"use client";

import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

export type ToastVariant = "default" | "success" | "error" | "warning";

export interface ToastData {
  id: string;
  title?: string;
  description: string;
  variant: ToastVariant;
  createdAt: number;
}

const VARIANT_STYLES: Record<ToastVariant, { border: string; bar: string; icon: string }> = {
  default: {
    border: "border-cyan-glow/30",
    bar: "bg-cyan-glow",
    icon: "text-cyan-glow",
  },
  success: {
    border: "border-emerald-signal/30",
    bar: "bg-emerald-signal",
    icon: "text-emerald-signal",
  },
  error: {
    border: "border-rose-alert/30",
    bar: "bg-rose-alert",
    icon: "text-rose-alert",
  },
  warning: {
    border: "border-amber-pulse/30",
    bar: "bg-amber-pulse",
    icon: "text-amber-pulse",
  },
};

const TOAST_DURATION = 4000;

interface ToastItemProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const [exiting, setExiting] = useState(false);
  const [progress, setProgress] = useState(100);
  const styles = VARIANT_STYLES[toast.variant];

  useEffect(() => {
    const startTime = toast.createdAt;
    const frame = () => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / TOAST_DURATION) * 100);
      setProgress(remaining);
      if (remaining > 0) {
        rafId = requestAnimationFrame(frame);
      }
    };
    let rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [toast.createdAt]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onDismiss(toast.id), 200);
    }, TOAST_DURATION);
    return () => clearTimeout(timeout);
  }, [toast.id, onDismiss]);

  const handleDismiss = () => {
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 200);
  };

  return (
    <div
      className={cn(
        "pointer-events-auto relative w-80 overflow-hidden rounded-lg border bg-card shadow-lg transition-all duration-200",
        styles.border,
        exiting
          ? "translate-x-full opacity-0"
          : "translate-x-0 opacity-100 animate-in slide-in-from-right-full"
      )}
    >
      <div className="flex items-start gap-3 p-3 pr-8">
        <div className="min-w-0 flex-1">
          {toast.title && (
            <p className={cn("text-sm font-semibold", styles.icon)}>
              {toast.title}
            </p>
          )}
          <p className="text-sm text-foreground/80">{toast.description}</p>
        </div>
      </div>

      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {/* Progress bar */}
      <div className="h-0.5 w-full bg-border/50">
        <div
          className={cn("h-full transition-none", styles.bar)}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

interface ToastContainerProps {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col-reverse gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
