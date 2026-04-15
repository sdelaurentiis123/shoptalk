"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Facility, Station } from "@/lib/types";

export default function SettingsForm({ facility, stations }: { facility: Facility; stations: Station[] }) {
  const [code, setCode] = useState(facility.join_code);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const router = useRouter();

  async function regen() {
    if (!confirm("Regenerate the join code? Existing operators keep access; new operators must use the new code.")) return;
    setRegenerating(true);
    const res = await fetch("/api/settings/regenerate-code", { method: "POST" });
    const data = await res.json();
    setRegenerating(false);
    if (res.ok) {
      setCode(data.join_code);
      router.refresh();
    }
  }

  return (
    <div className="max-w-[720px] mx-auto px-7 py-8">
      <h1 className="text-2xl font-bold tracking-tight2 mb-6">Settings</h1>

      <section className="bg-surface border border-border rounded-xl p-6 mb-6">
        <div className="text-[15px] font-semibold mb-1">{facility.name}</div>
        <div className="text-[13px] text-text-secondary mb-4">Operator join code</div>
        <div className="flex items-center gap-3">
          <code className="px-4 py-2 bg-background rounded-lg text-[15px] font-mono tabular-nums">{code}</code>
          <button
            onClick={() => {
              navigator.clipboard.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="px-3 py-2 rounded-lg border border-border text-[13px]"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <button onClick={regen} disabled={regenerating} className="px-3 py-2 rounded-lg border border-border text-[13px]">
            {regenerating ? "…" : "Regenerate"}
          </button>
        </div>
      </section>

      <section className="bg-surface border border-border rounded-xl p-6">
        <div className="text-[15px] font-semibold mb-3">Stations</div>
        <div className="flex flex-wrap gap-2">
          {stations.map((s) => (
            <span key={s.id} className="px-3 py-1.5 rounded-full bg-background text-[13px]">
              {s.name}
            </span>
          ))}
          {stations.length === 0 && <span className="text-[13px] text-text-tertiary">No stations yet.</span>}
        </div>
      </section>
    </div>
  );
}
