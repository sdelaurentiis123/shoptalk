"use client";

import { fmtTime } from "@/lib/utils";
import type { SessionKeyPoint } from "@/lib/types";

const TYPE_ICONS: Record<string, string> = {
  technique: "🔧",
  safety: "⚠️",
  quality: "✅",
  tool: "🛠️",
  other: "📝",
};

export default function SessionNotes({
  keyPoints,
  actionItems,
  onJump,
}: {
  keyPoints: SessionKeyPoint[];
  actionItems: { text: string; priority: string }[];
  onJump: (sec: number) => void;
}) {
  if (keyPoints.length === 0 && actionItems.length === 0) {
    return <div className="p-6 text-[13px] text-text-secondary text-center">No notes yet.</div>;
  }

  const grouped: Record<string, SessionKeyPoint[]> = {};
  for (const kp of keyPoints) {
    const t = kp.type || "other";
    if (!grouped[t]) grouped[t] = [];
    grouped[t].push(kp);
  }

  return (
    <div className="p-4 space-y-5">
      {Object.entries(grouped).map(([type, points]) => (
        <div key={type}>
          <div className="text-[11px] uppercase tracking-wide text-text-tertiary font-semibold mb-2">
            {TYPE_ICONS[type] ?? "📝"} {type}
          </div>
          <div className="space-y-1">
            {points.map((kp, i) => (
              <div
                key={kp.id ?? i}
                onClick={() => kp.time_sec != null && onJump(kp.time_sec)}
                className={`flex gap-3 p-2 rounded-lg text-[13px] ${
                  kp.time_sec != null ? "cursor-pointer hover:bg-background" : ""
                }`}
              >
                {kp.time_sec != null && (
                  <span className="text-[11px] tabular-nums text-primary font-semibold flex-shrink-0 w-10 pt-0.5">
                    {fmtTime(kp.time_sec)}
                  </span>
                )}
                <span className="flex-1 text-text-primary leading-relaxed">{kp.text}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {actionItems.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wide text-text-tertiary font-semibold mb-2">
            📋 Action items
          </div>
          <div className="space-y-1">
            {actionItems.map((a, i) => {
              const colors: Record<string, string> = {
                high: "text-red-600", medium: "text-yellow-600", low: "text-text-secondary",
              };
              return (
                <div key={i} className="flex items-start gap-2 p-2 text-[13px]">
                  <span className={`text-[11px] font-semibold uppercase ${colors[a.priority] ?? ""}`}>
                    {a.priority}
                  </span>
                  <span className="flex-1 text-text-primary">{a.text}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
