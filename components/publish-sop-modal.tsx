"use client";

import { useState } from "react";
import type { Station, LangCode } from "@/lib/types";
import { t } from "@/lib/i18n";

export default function PublishSopModal({
  sopId,
  sopTitle,
  currentStationId,
  stations,
  mode,
  lang,
  onClose,
  onDone,
}: {
  sopId: string;
  sopTitle: string;
  currentStationId: string | null;
  stations: Station[];
  mode: "publish" | "recategorize";
  lang: LangCode;
  onClose: () => void;
  onDone: (nextStationId: string | null, newStations?: Station[]) => void;
}) {
  const [stationId, setStationId] = useState<string | "__new__" | "">(
    currentStationId ?? "",
  );
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(skipCategory: boolean) {
    setError("");
    setSaving(true);
    try {
      let nextStationId: string | null = skipCategory ? null : null;
      let created: Station | null = null;

      if (!skipCategory) {
        if (stationId === "__new__") {
          const name = newName.trim();
          if (!name) {
            setError("enter a station name");
            setSaving(false);
            return;
          }
          const res = await fetch("/api/stations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
          });
          const data = await res.json();
          if (!res.ok) {
            setError(data.error || "couldn't create station");
            setSaving(false);
            return;
          }
          created = data.station as Station;
          nextStationId = created.id;
        } else if (stationId) {
          nextStationId = stationId;
        } else {
          // No selection and no skip → treat as skip.
          nextStationId = null;
        }
      }

      const payload: Record<string, unknown> = { station_id: nextStationId };
      if (mode === "publish") payload.status = "active";

      const res = await fetch(`/api/sops/${sopId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "failed");
        setSaving(false);
        return;
      }

      const nextStations = created ? [...stations, created] : undefined;
      onDone(nextStationId, nextStations);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div onClick={onClose} className="absolute inset-0 bg-black/25 backdrop-blur-sm" />
      <div className="relative bg-surface rounded-2xl w-[460px] max-w-[92vw] shadow-cardlg p-7">
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="text-[11px] font-semibold tracking-wider uppercase text-text-tertiary mb-1">
              {mode === "publish" ? t(lang, "publishProcedure") : t(lang, "changeStation")}
            </div>
            <div className="text-[17px] font-semibold">{sopTitle}</div>
          </div>
          <button
            onClick={onClose}
            className="bg-background w-7 h-7 rounded-full text-[15px] text-text-secondary flex items-center justify-center flex-shrink-0"
          >
            ×
          </button>
        </div>

        <label className="block text-[13px] font-medium text-text-secondary mb-2">
          {mode === "publish" ? t(lang, "stationOptional") : t(lang, "station")}
        </label>
        <select
          value={stationId}
          onChange={(e) => setStationId(e.target.value as any)}
          className="w-full px-3 py-2.5 border border-border rounded-lg text-[14px] outline-none bg-surface mb-3"
        >
          <option value="">{t(lang, "noStationOption")}</option>
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          <option value="__new__">{t(lang, "createNewStation")}</option>
        </select>

        {stationId === "__new__" && (
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t(lang, "stationName")}
            className="w-full px-3 py-2.5 border border-border rounded-lg text-[14px] outline-none mb-3"
          />
        )}

        {error && <div className="text-[13px] text-danger mb-3">{error}</div>}

        <div className="flex flex-col gap-2 mt-4">
          <button
            onClick={() => submit(false)}
            disabled={saving}
            className="w-full py-2.5 rounded-full bg-primary text-white text-[14px] font-medium disabled:opacity-60"
          >
            {saving ? t(lang, "saving") : mode === "publish" ? t(lang, "publish") : t(lang, "save")}
          </button>
          {mode === "publish" && (
            <button
              onClick={() => submit(true)}
              disabled={saving}
              className="w-full py-2.5 rounded-full border border-border text-[13px] text-text-secondary"
            >
              {t(lang, "publishWithoutCategory")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
