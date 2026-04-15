"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fmtTime } from "@/lib/utils";

export default function Filmstrip({
  totalSeconds,
  startSec,
  endSec,
  onRangeChange,
}: {
  totalSeconds: number;
  startSec: number;
  endSec: number;
  onRangeChange: (s: number, e: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<null | "start" | "end">(null);
  const pct = (sec: number) => (sec / Math.max(totalSeconds, 1)) * 100;

  const secFromX = useCallback(
    (cx: number) => {
      if (!ref.current) return 0;
      const r = ref.current.getBoundingClientRect();
      return Math.round(Math.max(0, Math.min(1, (cx - r.left) / r.width)) * totalSeconds);
    },
    [totalSeconds],
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const s = secFromX(e.clientX);
      if (dragging === "start") onRangeChange(Math.min(s, endSec - 1), endSec);
      else onRangeChange(startSec, Math.max(s, startSec + 1));
    };
    const onUp = () => setDragging(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, startSec, endSec, secFromX, onRangeChange]);

  const ticks: number[] = [];
  const interval = totalSeconds > 120 ? 60 : totalSeconds > 30 ? 15 : 5;
  for (let i = 0; i <= totalSeconds; i += interval) ticks.push(i);

  return (
    <div className="select-none">
      <div ref={ref} className="relative h-10 bg-background rounded-md overflow-hidden cursor-pointer">
        {Array.from({ length: Math.ceil(totalSeconds / 2) }).map((_, i) => (
          <div
            key={i}
            className="absolute top-1 bottom-1 bg-[#D1D1D6] rounded-[1px]"
            style={{
              left: `${((i * 2) / Math.max(totalSeconds, 1)) * 100}%`,
              width: `${(1.2 / Math.max(totalSeconds, 1)) * 100}%`,
            }}
          />
        ))}
        <div
          className="absolute top-0 bottom-0 bg-primary/10 border-l-2 border-r-2 border-primary"
          style={{ left: `${pct(startSec)}%`, width: `${pct(endSec - startSec)}%` }}
        >
          <div
            onMouseDown={() => setDragging("start")}
            className="absolute top-0 bottom-0 cursor-ew-resize"
            style={{ left: -6, width: 12 }}
          />
          <div
            onMouseDown={() => setDragging("end")}
            className="absolute top-0 bottom-0 cursor-ew-resize"
            style={{ right: -6, width: 12 }}
          />
        </div>
      </div>
      <div className="relative h-4 mt-1">
        {ticks.map((t) => (
          <span
            key={t}
            className="absolute text-[10px] text-text-tertiary tabular-nums"
            style={{ left: `${pct(t)}%`, transform: "translateX(-50%)" }}
          >
            {fmtTime(t)}
          </span>
        ))}
      </div>
    </div>
  );
}
