"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtTime } from "@/lib/utils";
import type { LangCode, Station } from "@/lib/types";
import UploadArea from "@/components/upload-area";
import StationFilter from "@/components/station-filter";

interface Row {
  id: string;
  title: string;
  summary: string;
  total_seconds: number;
  processing_status: string;
  created_at: string;
  station_id: string | null;
}

export default function SessionsClient({
  sessions,
  stations,
  facilityId,
  lang,
}: {
  sessions: Row[];
  stations: Station[];
  facilityId: string;
  lang: LangCode;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [station, setStation] = useState("all");
  const [deleting, setDeleting] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = sessions;
    if (station !== "all") list = list.filter((s) => s.station_id === station);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.title.toLowerCase().includes(q) || s.summary.toLowerCase().includes(q));
    }
    return list;
  }, [sessions, station, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { total: sessions.length };
    for (const s of sessions) if (s.station_id) c[s.station_id] = (c[s.station_id] ?? 0) + 1;
    return c;
  }, [sessions]);

  async function deleteSession(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this session? This cannot be undone.")) return;
    setDeleting(id);
    const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
    setDeleting(null);
  }

  return (
    <main className="max-w-[960px] mx-auto px-7 py-8">
      <UploadArea facilityId={facilityId} lang={lang} mode="session" />

      <div className="flex justify-between items-center mb-5">
        <h1 className="text-2xl font-bold tracking-tight2 m-0">Work Sessions</h1>
        <div className="relative">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sessions..."
            className="pl-3 pr-3 py-2 border border-border rounded-lg text-[13px] w-[200px] outline-none bg-surface"
          />
        </div>
      </div>

      <StationFilter stations={stations} active={station} onChange={setStation} counts={counts} lang={lang} />

      {filtered.length === 0 && (
        <div className="text-center py-16 text-text-secondary text-[14px]">
          No work sessions yet. Upload a video to get started.
        </div>
      )}

      <div className="flex flex-col gap-px bg-border rounded-xl overflow-hidden">
        {filtered.map((s) => (
          <Link
            key={s.id}
            href={`/sessions/${s.id}`}
            className="group relative px-6 py-[18px] bg-surface hover:bg-[#FAFAFA] transition"
          >
            <button
              onClick={(e) => deleteSession(e, s.id)}
              disabled={deleting === s.id}
              className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 focus:opacity-100 transition w-7 h-7 flex items-center justify-center rounded-full text-text-tertiary hover:bg-danger-bg hover:text-danger disabled:opacity-50"
            >
              {deleting === s.id ? (
                <span className="w-3 h-3 border-2 border-danger border-t-transparent rounded-full animate-spin" />
              ) : (
                <span className="text-[16px] leading-none">x</span>
              )}
            </button>
            <div className="flex justify-between items-baseline mb-1 pr-8 gap-3">
              <span className="text-[15px] font-semibold">{s.title || "Untitled session"}</span>
              <StatusBadge status={s.processing_status} />
            </div>
            {s.summary && (
              <div className="text-[13px] text-text-secondary leading-relaxed mb-2 line-clamp-1">{s.summary}</div>
            )}
            <div className="text-[12px] text-text-tertiary">
              {[
                stations.find((st) => st.id === s.station_id)?.name,
                s.total_seconds > 0 ? fmtTime(s.total_seconds) : null,
                new Date(s.created_at).toLocaleDateString(),
              ].filter(Boolean).join(" · ")}
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ready: "text-green-600",
    processing: "text-yellow-600",
    summarizing: "text-blue-600",
    failed: "text-red-600",
    pending: "text-text-tertiary",
  };
  if (status === "ready") return null;
  return <span className={`text-[11px] font-medium ${styles[status] ?? styles.pending}`}>{status}</span>;
}
