"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Sop, Station } from "@/lib/types";
import { fmtTime } from "@/lib/utils";
import StationFilter from "./station-filter";
import UploadArea from "./upload-area";

export default function LibraryView({
  sops,
  stations,
  role,
  facilityId,
}: {
  sops: (Sop & { stepCount: number })[];
  stations: Station[];
  role: "admin" | "operator";
  facilityId: string;
}) {
  const [station, setStation] = useState<string | "all">("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return sops.filter((s) => {
      if (station !== "all" && s.station_id !== station) return false;
      if (search && !s.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (role === "operator" && s.status !== "active") return false;
      return true;
    });
  }, [sops, station, search, role]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { total: sops.length };
    for (const s of sops) if (s.station_id) c[s.station_id] = (c[s.station_id] ?? 0) + 1;
    return c;
  }, [sops]);

  return (
    <div className="max-w-[960px] mx-auto px-7 py-8">
      {role === "admin" && (
        <UploadArea facilityId={facilityId} stationId={station === "all" ? null : station} />
      )}

      <div className="flex justify-between items-center mb-5">
        <h1 className="text-2xl font-bold tracking-tight2 m-0">Procedures</h1>
        <div className="relative">
          <span className="absolute left-[11px] top-1/2 -translate-y-1/2 text-[13px] text-text-tertiary">⌕</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="pl-[30px] pr-3 py-2 border border-border rounded-lg text-[13px] w-[200px] outline-none bg-surface"
          />
        </div>
      </div>

      <StationFilter stations={stations} active={station} onChange={setStation} counts={counts} />

      <div className="flex flex-col gap-px bg-border rounded-xl overflow-hidden">
        {filtered.map((sop) => (
          <Link
            key={sop.id}
            href={`/procedures/${sop.id}`}
            className="px-6 py-[18px] bg-surface hover:bg-[#FAFAFA] transition"
          >
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-[15px] font-semibold">{sop.title}</span>
              {sop.status === "draft" && <span className="text-[11px] font-medium text-warning">Draft</span>}
              {sop.status === "archived" && <span className="text-[11px] font-medium text-text-tertiary">Archived</span>}
            </div>
            <div className="text-[13px] text-text-secondary leading-relaxed mb-2">{sop.description}</div>
            <div className="text-[12px] text-text-tertiary">
              {[
                stations.find((s) => s.id === sop.station_id)?.name,
                sop.type === "video" && sop.total_seconds > 0 ? fmtTime(sop.total_seconds) : null,
                sop.type === "pdf" ? "PDF" : null,
                sop.type === "image" ? "Image" : null,
                sop.trainer || null,
                `${sop.stepCount} steps`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </Link>
        ))}
        {filtered.length === 0 && (
          <div className="py-10 text-center bg-surface text-[13px] text-text-tertiary">No procedures found.</div>
        )}
      </div>
    </div>
  );
}
