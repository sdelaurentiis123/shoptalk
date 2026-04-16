"use client";

import { fmtTime } from "@/lib/utils";
import type { SessionTopic } from "@/lib/types";

export default function SessionTopicsBar({
  topics,
  currentTime,
  onJump,
}: {
  topics: SessionTopic[];
  currentTime: number;
  onJump: (sec: number) => void;
}) {
  if (topics.length === 0) return null;

  return (
    <div className="flex gap-2 flex-wrap mt-4">
      {topics.map((t) => {
        const active =
          t.start_sec != null && t.end_sec != null &&
          currentTime >= t.start_sec && currentTime <= t.end_sec;
        return (
          <button
            key={t.id}
            onClick={() => t.start_sec != null && onJump(t.start_sec)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition ${
              active
                ? "bg-primary text-white"
                : "bg-background text-text-secondary hover:bg-border"
            }`}
          >
            {t.title}
            {t.start_sec != null && (
              <span className="ml-1 opacity-70">{fmtTime(t.start_sec)}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
