"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Facility, Station, LangCode } from "@/lib/types";
import { t } from "@/lib/i18n";

export default function SettingsForm({ facility, stations, lang }: { facility: Facility; stations: Station[]; lang: LangCode }) {
  const [code, setCode] = useState(facility.join_code);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [origin, setOrigin] = useState("");
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  const joinUrl = origin ? `${origin}/join?code=${encodeURIComponent(code)}` : `/join?code=${encodeURIComponent(code)}`;

  async function regen() {
    if (!confirm(t(lang, "regenerateConfirm"))) return;
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
      <h1 className="text-2xl font-bold tracking-tight2 mb-6">{t(lang, "settingsTitle")}</h1>

      <Link
        href="/settings/members"
        className="block bg-surface border border-border rounded-xl p-5 mb-6 hover:bg-background transition"
      >
        <div className="text-[15px] font-semibold">Workspace members</div>
        <div className="text-[13px] text-text-secondary mt-0.5">Invite other admins to this workspace.</div>
      </Link>

      <section className="bg-surface border border-border rounded-xl p-6 mb-6">
        <div className="text-[15px] font-semibold mb-1">{facility.name}</div>
        <div className="text-[13px] text-text-secondary mb-4">{t(lang, "operatorJoin")}</div>

        <div className="flex items-center gap-3 flex-wrap mb-3">
          <code className="px-4 py-2 bg-background rounded-lg text-[15px] font-mono tabular-nums">{code}</code>
          <button
            onClick={() => {
              navigator.clipboard.writeText(code);
              setCopiedCode(true);
              setTimeout(() => setCopiedCode(false), 1500);
            }}
            className="px-3 py-2 rounded-lg border border-border text-[13px]"
          >
            {copiedCode ? t(lang, "copied") : t(lang, "copyCode")}
          </button>
          <button
            onClick={() => {
              navigator.clipboard.writeText(joinUrl);
              setCopiedLink(true);
              setTimeout(() => setCopiedLink(false), 1500);
            }}
            className="px-3 py-2 rounded-lg bg-primary text-white text-[13px] font-medium"
          >
            {copiedLink ? t(lang, "copiedLink") : t(lang, "copyLink")}
          </button>
          <button onClick={regen} disabled={regenerating} className="px-3 py-2 rounded-lg border border-border text-[13px]">
            {regenerating ? "…" : t(lang, "regenerate")}
          </button>
        </div>
        <div className="text-[12px] text-text-tertiary break-all">{t(lang, "shareLink")} {joinUrl}</div>
      </section>

      <StationsEditor initial={stations} lang={lang} />
    </div>
  );
}

function StationsEditor({ initial, lang }: { initial: Station[]; lang: LangCode }) {
  const [stations, setStations] = useState<Station[]>([...initial].sort((a, b) => a.sort_order - b.sort_order));
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function addStation() {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    setError("");
    const res = await fetch("/api/stations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    setAdding(false);
    if (!res.ok) return setError(data.error || "failed");
    setStations((s) => [...s, data.station]);
    setNewName("");
    router.refresh();
  }

  async function saveName(id: string) {
    const name = editingName.trim();
    if (!name) {
      setEditingId(null);
      return;
    }
    const prev = stations;
    setStations((s) => s.map((st) => (st.id === id ? { ...st, name } : st)));
    setEditingId(null);
    setError("");
    const res = await fetch(`/api/stations/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "failed");
      setStations(prev);
    } else {
      router.refresh();
    }
  }

  async function deleteStation(id: string) {
    if (!confirm(t(lang, "deleteStationConfirm"))) return;
    const prev = stations;
    setStations((s) => s.filter((st) => st.id !== id));
    const res = await fetch(`/api/stations/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "failed");
      setStations(prev);
    } else {
      router.refresh();
    }
  }

  async function move(id: string, dir: -1 | 1) {
    const idx = stations.findIndex((s) => s.id === id);
    const j = idx + dir;
    if (idx === -1 || j < 0 || j >= stations.length) return;
    const prev = stations;
    const next = [...stations];
    [next[idx], next[j]] = [next[j], next[idx]];
    next.forEach((s, i) => (s.sort_order = i));
    setStations(next);
    const a = next[idx], b = next[j];
    const [ra, rb] = await Promise.all([
      fetch(`/api/stations/${a.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sort_order: a.sort_order }),
      }),
      fetch(`/api/stations/${b.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sort_order: b.sort_order }),
      }),
    ]);
    if (!ra.ok || !rb.ok) {
      setStations(prev);
      setError("reorder failed");
    } else {
      router.refresh();
    }
  }

  return (
    <section className="bg-surface border border-border rounded-xl p-6">
      <div className="text-[15px] font-semibold mb-1">{t(lang, "stations")}</div>
      <div className="text-[13px] text-text-secondary mb-4">{t(lang, "stationsHint")}</div>

      {error && <div className="text-[13px] text-danger mb-3">{error}</div>}

      <div className="space-y-2 mb-4">
        {stations.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2 py-1.5">
            <div className="flex flex-col">
              <button
                onClick={() => move(s.id, -1)}
                disabled={i === 0}
                className="text-text-tertiary text-[10px] leading-none disabled:opacity-30"
              >
                ▲
              </button>
              <button
                onClick={() => move(s.id, 1)}
                disabled={i === stations.length - 1}
                className="text-text-tertiary text-[10px] leading-none disabled:opacity-30"
              >
                ▼
              </button>
            </div>
            {editingId === s.id ? (
              <input
                autoFocus
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={() => saveName(s.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveName(s.id);
                  if (e.key === "Escape") setEditingId(null);
                }}
                className="flex-1 px-3 py-1.5 border border-border rounded-lg text-[14px] outline-none"
              />
            ) : (
              <button
                onClick={() => {
                  setEditingId(s.id);
                  setEditingName(s.name);
                }}
                className="flex-1 text-left px-3 py-1.5 rounded-lg hover:bg-background text-[14px]"
              >
                {s.name}
              </button>
            )}
            <button
              onClick={() => deleteStation(s.id)}
              className="text-text-tertiary hover:text-danger text-[15px] px-1"
            >
              ×
            </button>
          </div>
        ))}
        {stations.length === 0 && (
          <div className="text-[13px] text-text-tertiary py-3 px-3">{t(lang, "noStationsYet")}</div>
        )}
      </div>

      <div className="flex gap-2 border-t border-border pt-4">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addStation();
          }}
          placeholder={t(lang, "newStationName")}
          className="flex-1 px-3 py-2 border border-border rounded-lg text-[14px] outline-none"
        />
        <button
          onClick={addStation}
          disabled={adding || !newName.trim()}
          className="px-4 py-2 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50"
        >
          {adding ? "…" : t(lang, "add")}
        </button>
      </div>
    </section>
  );
}
