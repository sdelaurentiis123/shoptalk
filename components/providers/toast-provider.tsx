"use client";

import { createContext, useCallback, useContext, useState } from "react";

export interface Toast {
  id: string;
  message: string;
  type: "info" | "success" | "error";
  action?: { label: string; href: string };
}

interface ToastCtx {
  toasts: Toast[];
  addToast: (message: string, opts?: { type?: Toast["type"]; action?: Toast["action"] }) => void;
  removeToast: (id: string) => void;
}

const Ctx = createContext<ToastCtx>({ toasts: [], addToast: () => {}, removeToast: () => {} });

export function useToast() {
  return useContext(Ctx);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, opts?: { type?: Toast["type"]; action?: Toast["action"] }) => {
    const id = Math.random().toString(36).slice(2);
    const toast: Toast = { id, message, type: opts?.type ?? "info", action: opts?.action };
    setToasts((prev) => [...prev, toast]);
    if (toast.type !== "error") {
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 8000);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return <Ctx.Provider value={{ toasts, addToast, removeToast }}>{children}</Ctx.Provider>;
}
