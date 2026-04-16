"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// Fire /api/translate-stale at most once per SPA session. Shared with
// sop-detail via a window-level sentinel so library + detail mounts don't
// both trigger the healer when the user navigates between them.
import type { Sop, Station, LangCode } from "@/lib/types";
import { fmtTime } from "@/lib/utils";
import { t } from "@/lib/i18n";
import StationFilter from "./station-filter";
import UploadArea from "./upload-area";
import { pickI18n } from "@/lib/sop-i18n";

export default function LibraryView({
  sops: initial,
  stations,
  role,
  facilityId,
  lang,
}: {
  sops: (Sop & { stepCount: number })[];
  stations: Station[];
  role: "admin" | "operator";
  facilityId: string;
  lang: LangCode;
}) {
  const router = useRouter();
  const [sops, setSops] = useState(initial);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [station, setStation] = useState<string | "all">("all");
  const [search, setSearch] = useState("");

  // Keep the list in sync when the server version changes (navigating back, etc.).
  useEffect(() => {
    setSops(initial);
  }, [initial]);

  // On mount: nudge the server to heal any stuck-pending translations.
  useEffect(() => {
    if (role !== "admin" || typeof window === "undefined") return;
    if ((window as any).__shoptalkHealerFired) return;
    (window as any).__shoptalkHealerFired = true;
    fetch("/api/translate-stale", { method: "POST" }).catch(() => {});
  }, [role]);

  // If any SOP is still translating, poll the route's server components every
  // few seconds so the badge clears and Spanish content lands without a manual
  // refresh.
  const anyPending = useMemo(() => sops.some((s) => s.translation_status === "pending"), [sops]);
  useEffect(() => {
    if (!anyPending) return;
    const id = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(id);
  }, [anyPending, router]);

  // Per-SOP stall detection: mark any SOP whose pending state persists for
  // >90s as stalled in local state (shows a distinct pill + retry).
  const [stalledIds, setStalledIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const now = Date.now();
    for (const s of sops) {
      if (s.translation_status !== "pending") continue;
      if (stalledIds.has(s.id)) continue;
      const age = now - new Date(s.updated_at).getTime();
      const remaining = Math.max(0, 90000 - age);
      if (remaining === 0) {
        setStalledIds((prev) => new Set(prev).add(s.id));
      } else {
        timers.push(
          setTimeout(() => {
            setStalledIds((prev) => new Set(prev).add(s.id));
          }, remaining),
        );
      }
    }
    // Drop any ids that are no longer pending.
    setStalledIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        const still = sops.find((s) => s.id === id);
        if (still && still.translation_status === "pending") next.add(id);
      }
      return next;
    });
    return () => timers.forEach((tm) => clearTimeout(tm));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sops]);

  async function retrySop(e: React.MouseEvent, sopId: string) {
    e.stopPropagation();
    e.preventDefault();
    await fetch(`/api/sops/${sopId}/translate`, { method: "POST" }).catch(() => {});
    setStalledIds((prev) => {
      const next = new Set(prev);
      next.delete(sopId);
      return next;
    });
    router.refresh();
  }

  async function deleteSop(e: React.MouseEvent, sop: Sop) {
    e.stopPropagation();
    e.preventDefault();
    const title = pickI18n(sop, "title", lang) || "this procedure";
    if (!confirm(t(lang, "deleteSopConfirm", { title }))) return;
    setDeleting(sop.id);
    const prev = sops;
    setSops((list) => list.filter((s) => s.id !== sop.id));
    const res = await fetch(`/api/sops/${sop.id}`, { method: "DELETE" });
    setDeleting(null);
    if (!res.ok) {
      setSops(prev);
      const data = await res.json().catch(() => ({}));
      alert(data.error || "delete failed");
    } else {
      router.refresh();
    }
  }

  const filtered = useMemo(() => {
    return sops.filter((s) => {
      if (station !== "all" && s.station_id !== station) return false;
      if (search && !pickI18n(s, "title", lang).toLowerCase().includes(search.toLowerCase())) return false;
      if (role === "operator" && s.status !== "active") return false;
      return true;
    });
  }, [sops, station, search, role, lang]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { total: sops.length };
    for (const s of sops) if (s.station_id) c[s.station_id] = (c[s.station_id] ?? 0) + 1;
    return c;
  }, [sops]);

  return (
    <div className="max-w-[960px] mx-auto px-7 py-8">
      {role === "admin" && <UploadArea facilityId={facilityId} lang={lang} />}

      <div className="flex justify-between items-center mb-5">
        <h1 className="text-2xl font-bold tracking-tight2 m-0">{t(lang, "proceduresTitle")}</h1>
        <div className="relative">
          <span className="absolute left-[11px] top-1/2 -translate-y-1/2 text-[13px] text-text-tertiary">⌕</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t(lang, "search")}
            className="pl-[30px] pr-3 py-2 border border-border rounded-lg text-[13px] w-[200px] outline-none bg-surface"
          />
        </div>
      </div>

      <StationFilter stations={stations} active={station} onChange={setStation} counts={counts} lang={lang} />

      <div className="flex flex-col gap-px bg-border rounded-xl overflow-hidden">
        {filtered.map((sop) => (
          <Link
            key={sop.id}
            href={`/procedures/${sop.id}`}
            className="group relative px-6 py-[18px] bg-surface hover:bg-[#FAFAFA] transition"
          >
            <div className="flex justify-between items-baseline mb-1 pr-8 gap-3">
              <span className="text-[15px] font-semibold">{pickI18n(sop, "title", lang)}</span>
              <div className="flex items-center gap-2 flex-shrink-0">
                {sop.translation_status === "pending" && !stalledIds.has(sop.id) && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary bg-primary-bg px-2 py-0.5 rounded-full">
                    <span className="w-2 h-2 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    {t(lang, "translatingBadge")}
                  </span>
                )}
                {sop.translation_status === "pending" && stalledIds.has(sop.id) && (
                  <button
                    onClick={(e) => retrySop(e, sop.id)}
                    className="inline-flex items-center gap-1.5 text-[11px] font-medium text-warning bg-warning-bg px-2 py-0.5 rounded-full hover:text-white hover:bg-warning transition"
                  >
                    {t(lang, "translationStalledBadge")} · {t(lang, "retryNow")}
                  </button>
                )}
                {sop.status === "draft" && <span className="text-[11px] font-medium text-warning">{t(lang, "draft")}</span>}
                {sop.status === "archived" && <span className="text-[11px] font-medium text-text-tertiary">{t(lang, "archived")}</span>}
              </div>
            </div>
            {role === "admin" && (
              <button
                onClick={(e) => deleteSop(e, sop)}
                disabled={deleting === sop.id}
                title={t(lang, "deleteSop")}
                className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 focus:opacity-100 transition w-7 h-7 flex items-center justify-center rounded-full text-text-tertiary hover:bg-danger-bg hover:text-danger disabled:opacity-50"
              >
                {deleting === sop.id ? (
                  <span className="w-3 h-3 border-2 border-danger border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span className="text-[16px] leading-none">×</span>
                )}
              </button>
            )}
            <div className="text-[13px] text-text-secondary leading-relaxed mb-2">{pickI18n(sop, "description", lang)}</div>
            <div className="text-[12px] text-text-tertiary">
              {[
                stations.find((s) => s.id === sop.station_id)?.name,
                sop.type === "video" && sop.total_seconds > 0 ? fmtTime(sop.total_seconds) : null,
                sop.type === "pdf" ? "PDF" : null,
                sop.type === "image" ? "Image" : null,
                sop.trainer || null,
                `${sop.stepCount} ${t(lang, "steps")}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </Link>
        ))}
        {filtered.length === 0 && (
          <div className="py-10 text-center bg-surface text-[13px] text-text-tertiary">{t(lang, "noProcedures")}</div>
        )}
      </div>
    </div>
  );
}
