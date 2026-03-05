"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
} from "react";
import {
  ToastContainer,
  type ToastData,
  type ToastVariant,
} from "@/components/shared/toast";

const MAX_TOASTS = 3;

interface ToastOptions {
  title?: string;
  description: string;
  variant?: ToastVariant;
}

interface ToastContextValue {
  toast: (opts: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let toastCounter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((opts: ToastOptions) => {
    const id = `toast-${++toastCounter}-${Date.now()}`;
    const newToast: ToastData = {
      id,
      title: opts.title,
      description: opts.description,
      variant: opts.variant ?? "default",
      createdAt: Date.now(),
    };

    setToasts((prev) => {
      const next = [...prev, newToast];
      // Evict oldest if exceeding max
      if (next.length > MAX_TOASTS) {
        return next.slice(next.length - MAX_TOASTS);
      }
      return next;
    });
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
