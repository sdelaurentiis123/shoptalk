"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fmtTime } from "@/lib/utils";

export default function TimeScrubber({
  totalSeconds,
  value,
  onChange,
}: {
  totalSeconds: number;
  value: number | null;
  onChange: (sec: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const total = Math.max(totalSeconds, 1);
  const pct = (sec: number) => (sec / total) * 100;

  const secFromX = useCallback(
    (cx: number) => {
      if (!ref.current) return 0;
      const r = ref.current.getBoundingClientRect();
      return Math.round(Math.max(0, Math.min(1, (cx - r.left) / r.width)) * total);
    },
    [total],
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => onChange(secFromX(e.clientX));
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, secFromX, onChange]);

  const ticks: number[] = [];
  const interval = total > 300 ? 60 : total > 60 ? 15 : 5;
  for (let i = 0; i <= total; i += interval) ticks.push(i);

  return (
    <div className="select-none w-full">
      <div
        ref={ref}
        className="relative h-6 bg-background rounded-md cursor-pointer"
        onClick={(e) => onChange(secFromX(e.clientX))}
      >
        {/* Track */}
        {value != null && (
          <div
            className="absolute top-0 bottom-0 bg-primary/10 rounded-l-md"
            style={{ width: `${pct(value)}%` }}
          />
        )}
        {/* Dot */}
        {value != null && (
          <div
            onMouseDown={(e) => { e.stopPropagation(); setDragging(true); }}
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full shadow-sm cursor-grab active:cursor-grabbing"
            style={{ left: `calc(${pct(value)}% - 6px)` }}
          />
        )}
      </div>
      <div className="relative h-3 mt-0.5">
        {ticks.map((t) => (
          <span
            key={t}
            className="absolute text-[9px] text-text-tertiary tabular-nums"
            style={{ left: `${pct(t)}%`, transform: "translateX(-50%)" }}
          >
            {fmtTime(t)}
          </span>
        ))}
      </div>
    </div>
  );
}
