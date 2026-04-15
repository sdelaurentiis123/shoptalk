"use client";

import type { Station } from "@/lib/types";

export default function StationFilter({
  stations,
  active,
  onChange,
  counts,
}: {
  stations: Station[];
  active: string | "all";
  onChange: (id: string | "all") => void;
  counts: Record<string, number>;
}) {
  const all = [{ id: "all", name: "All" } as const, ...stations];
  return (
    <div className="flex gap-1.5 mb-6 flex-wrap">
      {all.map((s) => {
        const isActive = active === s.id;
        const c = s.id === "all" ? counts.total : counts[s.id] ?? 0;
        return (
          <button
            key={s.id}
            onClick={() => onChange(s.id as any)}
            className={`px-[14px] py-[6px] rounded-full text-[13px] font-medium border transition ${
              isActive ? "bg-text-primary text-white border-transparent" : "bg-surface text-text-secondary border-border"
            }`}
          >
            {s.name}
            <span className="ml-1.5 opacity-60">{c}</span>
          </button>
        );
      })}
    </div>
  );
}
