"use client";

import { useState } from "react";
import { fmtTime } from "@/lib/utils";
import { t } from "@/lib/i18n";
import type { LangCode, SessionKeyPoint } from "@/lib/types";
import TimeScrubber from "./time-scrubber";

const TYPE_COLORS: Record<string, string> = {
  technique: "bg-blue-500",
  safety: "bg-red-500",
  quality: "bg-green-500",
  tool: "bg-purple-500",
  other: "bg-gray-400",
};

const TYPES = ["technique", "safety", "quality", "tool", "other"];

interface EditableKP {
  id?: string;
  text: string;
  type: string;
  time_sec: number | null;
}

interface EditableAI {
  text: string;
  priority: string;
}

export default function SessionOverview({
  sessionId,
  summary: initialSummary,
  keyPoints: initialKP,
  actionItems: initialAI,
  onJump,
  editMode,
  totalSeconds,
  lang,
}: {
  sessionId: string;
  summary: string;
  keyPoints: SessionKeyPoint[];
  actionItems: { text: string; priority: string }[];
  onJump: (sec: number) => void;
  editMode: boolean;
  totalSeconds: number;
  lang: LangCode;
}) {
  const [summary, setSummary] = useState(initialSummary);
  const [keyPoints, setKeyPoints] = useState<EditableKP[]>(
    initialKP.map((kp) => ({ id: kp.id, text: kp.text, type: kp.type, time_sec: kp.time_sec })),
  );
  const [actionItems, setActionItems] = useState<EditableAI[]>(
    initialAI.map((a) => ({ text: a.text, priority: a.priority })),
  );

  async function saveSummary() {
    await fetch(`/api/sessions/${sessionId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary }),
    });
  }

  async function saveKeyPoints(updated: EditableKP[]) {
    setKeyPoints(updated);
    await fetch(`/api/sessions/${sessionId}/key-points`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyPoints: updated }),
    });
  }

  async function saveActionItems(updated: EditableAI[]) {
    setActionItems(updated);
    await fetch(`/api/sessions/${sessionId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action_items: updated }),
    });
  }

  function updateKP(i: number, field: string, value: any) {
    const next = [...keyPoints];
    (next[i] as any)[field] = value;
    setKeyPoints(next);
  }

  return (
    <div className="p-4 space-y-5">
      {/* Summary */}
      <div>
        <div className="text-[11px] uppercase tracking-wide text-text-tertiary font-semibold mb-2">{t(lang, "summary")}</div>
        {editMode ? (
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            onBlur={saveSummary}
            rows={3}
            className="w-full text-[13px] leading-relaxed text-text-primary border border-border rounded-lg p-2 outline-none resize-none"
          />
        ) : (
          <p className="text-[13px] text-text-secondary leading-relaxed">{summary || "No summary."}</p>
        )}
      </div>

      {/* Key Points */}
      <div>
        <div className="text-[11px] uppercase tracking-wide text-text-tertiary font-semibold mb-2">{t(lang, "keyPoints")}</div>
        <div className="space-y-3">
          {keyPoints.map((kp, i) => (
            <div key={i} className="group">
              {editMode ? (
                <div className="border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${TYPE_COLORS[kp.type] ?? TYPE_COLORS.other}`} />
                      <select
                        value={kp.type}
                        onChange={(e) => updateKP(i, "type", e.target.value)}
                        onBlur={() => saveKeyPoints(keyPoints)}
                        className="text-[11px] border border-border rounded px-1 py-0.5 outline-none bg-surface"
                      >
                        {TYPES.map((tp) => <option key={tp} value={tp}>{tp}</option>)}
                      </select>
                      {kp.time_sec != null && (
                        <span className="text-[11px] tabular-nums text-primary font-semibold">{fmtTime(kp.time_sec)}</span>
                      )}
                    </div>
                    <button
                      onClick={() => saveKeyPoints(keyPoints.filter((_, j) => j !== i))}
                      className="text-text-tertiary hover:text-danger text-[14px]"
                    >
                      x
                    </button>
                  </div>
                  <input
                    value={kp.text}
                    onChange={(e) => updateKP(i, "text", e.target.value)}
                    onBlur={() => saveKeyPoints(keyPoints)}
                    className="w-full text-[13px] border border-border rounded px-2 py-1 outline-none"
                  />
                  <TimeScrubber
                    totalSeconds={totalSeconds}
                    value={kp.time_sec}
                    onChange={(sec) => { updateKP(i, "time_sec", sec); }}
                  />
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <span className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${TYPE_COLORS[kp.type] ?? TYPE_COLORS.other}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] text-text-tertiary uppercase font-medium">{kp.type}</span>
                      {kp.time_sec != null && (
                        <button
                          onClick={() => onJump(kp.time_sec!)}
                          className="text-[11px] tabular-nums text-primary font-semibold"
                        >
                          {fmtTime(kp.time_sec)}
                        </button>
                      )}
                    </div>
                    <p className="text-[13px] text-text-primary leading-relaxed">{kp.text}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
          {editMode && (
            <button
              onClick={() => setKeyPoints([...keyPoints, { text: "", type: "technique", time_sec: null }])}
              className="text-[12px] text-primary hover:underline"
            >
              {t(lang, "addKeyPoint")}
            </button>
          )}
          {!editMode && keyPoints.length === 0 && (
            <p className="text-[13px] text-text-tertiary">No key points.</p>
          )}
        </div>
      </div>

      {/* Action Items */}
      <div>
        <div className="text-[11px] uppercase tracking-wide text-text-tertiary font-semibold mb-2">{t(lang, "actionItems")}</div>
        <div className="space-y-2">
          {actionItems.map((a, i) => (
            <div key={i} className="flex items-start gap-2 group">
              {editMode ? (
                <>
                  <select
                    value={a.priority}
                    onChange={(e) => {
                      const next = [...actionItems];
                      next[i] = { ...next[i], priority: e.target.value };
                      setActionItems(next);
                    }}
                    onBlur={() => saveActionItems(actionItems)}
                    className="text-[11px] font-semibold uppercase border border-border rounded px-1 py-0.5 outline-none bg-surface flex-shrink-0"
                  >
                    <option value="high">HIGH</option>
                    <option value="medium">MED</option>
                    <option value="low">LOW</option>
                  </select>
                  <input
                    value={a.text}
                    onChange={(e) => {
                      const next = [...actionItems];
                      next[i] = { ...next[i], text: e.target.value };
                      setActionItems(next);
                    }}
                    onBlur={() => saveActionItems(actionItems)}
                    className="flex-1 text-[13px] border border-border rounded px-2 py-0.5 outline-none"
                  />
                  <button
                    onClick={() => saveActionItems(actionItems.filter((_, j) => j !== i))}
                    className="text-text-tertiary hover:text-danger text-[14px] flex-shrink-0"
                  >
                    x
                  </button>
                </>
              ) : (
                <>
                  <span className={`text-[11px] font-semibold uppercase flex-shrink-0 ${
                    a.priority === "high" ? "text-red-600" : a.priority === "medium" ? "text-yellow-600" : "text-text-secondary"
                  }`}>
                    {a.priority}
                  </span>
                  <span className="flex-1 text-[13px] text-text-primary">{a.text}</span>
                </>
              )}
            </div>
          ))}
          {editMode && (
            <button
              onClick={() => setActionItems([...actionItems, { text: "", priority: "medium" }])}
              className="text-[12px] text-primary hover:underline"
            >
              {t(lang, "addActionItem")}
            </button>
          )}
          {!editMode && actionItems.length === 0 && (
            <p className="text-[13px] text-text-tertiary">No action items.</p>
          )}
        </div>
      </div>
    </div>
  );
}
