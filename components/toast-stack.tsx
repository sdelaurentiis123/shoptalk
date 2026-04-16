"use client";

import Link from "next/link";
import { useToast } from "./providers/toast-provider";

const TYPE_STYLES: Record<string, string> = {
  info: "border-primary/30 bg-primary-bg text-text-primary",
  success: "border-green-300 bg-green-50 text-green-800",
  error: "border-danger bg-danger-bg text-danger",
};

export default function ToastStack() {
  const { toasts, removeToast } = useToast();
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[300] flex flex-col gap-2 max-w-[360px]">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`rounded-xl border px-4 py-3 shadow-card text-[13px] flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 ${
            TYPE_STYLES[t.type] ?? TYPE_STYLES.info
          }`}
        >
          <span className="flex-1">{t.message}</span>
          {t.action && (
            <Link
              href={t.action.href}
              onClick={() => removeToast(t.id)}
              className="text-primary font-semibold text-[12px] flex-shrink-0"
            >
              {t.action.label}
            </Link>
          )}
          <button onClick={() => removeToast(t.id)} className="text-text-tertiary text-[14px] flex-shrink-0">
            x
          </button>
        </div>
      ))}
    </div>
  );
}
