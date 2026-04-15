"use client";

import { useState } from "react";
import Link from "next/link";
import type { Flag } from "@/lib/types";

type FlagWithSop = Flag & { sops?: { title: string } | null };

export default function FlagsList({ flags: initial }: { flags: FlagWithSop[] }) {
  const [flags, setFlags] = useState(initial);

  async function update(id: string, status: "resolved" | "dismissed") {
    const res = await fetch("/api/flags", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) setFlags((f) => f.map((x) => (x.id === id ? { ...x, status } : x)));
  }

  const open = flags.filter((f) => f.status === "open");
  const closed = flags.filter((f) => f.status !== "open");

  if (flags.length === 0) {
    return <div className="bg-surface border border-border rounded-xl p-6 text-center text-[13px] text-text-tertiary">No gaps reported.</div>;
  }

  return (
    <div className="space-y-4">
      {open.length > 0 && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          {open.map((f) => (
            <div key={f.id} className="px-5 py-4 border-b border-border last:border-0">
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1">
                  <div className="text-[14px]">{f.text}</div>
                  <div className="text-[12px] text-text-tertiary mt-1">
                    {f.sops?.title ? (
                      <Link href={`/procedures/${f.sop_id}`} className="text-primary">
                        {f.sops.title}
                      </Link>
                    ) : (
                      "No procedure linked"
                    )}{" "}
                    · {new Date(f.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => update(f.id, "resolved")} className="px-3 py-1 rounded-full bg-success-bg text-success text-[12px] font-medium">
                    Resolve
                  </button>
                  <button onClick={() => update(f.id, "dismissed")} className="px-3 py-1 rounded-full border border-border text-[12px]">
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {closed.length > 0 && (
        <details>
          <summary className="text-[13px] text-text-secondary cursor-pointer">Closed ({closed.length})</summary>
          <div className="mt-2 bg-surface border border-border rounded-xl overflow-hidden">
            {closed.map((f) => (
              <div key={f.id} className="px-5 py-3 border-b border-border last:border-0 text-[13px] text-text-secondary">
                <span className="text-[11px] mr-2 text-text-tertiary uppercase">{f.status}</span>
                {f.text}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
