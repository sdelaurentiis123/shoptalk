"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export interface WorkspaceOption {
  id: string;
  name: string;
}

export default function WorkspaceSwitcher({
  current,
  workspaces,
  allWorkspaces,
  isPlatformAdmin,
}: {
  current: WorkspaceOption | null;
  workspaces: WorkspaceOption[];
  allWorkspaces?: WorkspaceOption[];
  isPlatformAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(id: string) {
    if (current?.id === id) {
      setOpen(false);
      return;
    }
    start(async () => {
      const res = await fetch("/api/workspaces/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facility_id: id }),
      });
      setOpen(false);
      if (res.ok) {
        window.location.assign("/procedures");
      }
    });
  }

  const showAll = isPlatformAdmin && allWorkspaces && allWorkspaces.length > 0;
  const onlyOne = workspaces.length <= 1 && !showAll;
  if (onlyOne) return null;

  const ownIds = new Set(workspaces.map((w) => w.id));
  const extra = (allWorkspaces ?? []).filter((w) => !ownIds.has(w.id));

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className="flex items-center gap-1 px-3 py-[5px] border border-border rounded-lg bg-surface text-[13px] text-text-primary disabled:opacity-60 max-w-[180px]"
      >
        {pending && (
          <span className="w-3 h-3 border-2 border-text-tertiary border-t-transparent rounded-full animate-spin" />
        )}
        <span className="truncate">{current?.name ?? "No workspace"}</span>
        <span className="text-[9px] ml-0.5">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] bg-surface rounded-xl shadow-cardlg overflow-hidden min-w-[220px] z-[100] border border-border py-1 max-h-[360px] overflow-y-auto">
          {workspaces.length > 0 && (
            <div className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-text-tertiary">
              Your workspaces
            </div>
          )}
          {workspaces.map((w) => (
            <button
              key={w.id}
              onClick={() => pick(w.id)}
              className={`block w-full px-4 py-[9px] text-left text-[13px] truncate ${
                w.id === current?.id ? "bg-primary-bg text-primary" : "text-text-primary hover:bg-background"
              }`}
            >
              {w.name}
            </button>
          ))}
          {showAll && extra.length > 0 && (
            <>
              <div className="h-px bg-border my-1" />
              <div className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-text-tertiary">
                All workspaces (platform)
              </div>
              {extra.map((w) => (
                <button
                  key={w.id}
                  onClick={() => pick(w.id)}
                  className="block w-full px-4 py-[9px] text-left text-[13px] text-text-primary hover:bg-background truncate"
                >
                  {w.name}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
