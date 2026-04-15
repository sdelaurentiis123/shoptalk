"use client";

import type { Station, LangCode } from "@/lib/types";
import { t } from "@/lib/i18n";

export default function StationFilter({
  stations,
  active,
  onChange,
  counts,
  lang,
}: {
  stations: Station[];
  active: string | "all";
  onChange: (id: string | "all") => void;
  counts: Record<string, number>;
  lang: LangCode;
}) {
  const all = [{ id: "all" as const, name: t(lang, "allStations") }, ...stations];
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
