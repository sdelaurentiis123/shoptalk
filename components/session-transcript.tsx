"use client";

import { useEffect, useRef, useState } from "react";
import { fmtTime } from "@/lib/utils";
import { t } from "@/lib/i18n";
import type { LangCode, TranscriptBeat } from "@/lib/types";

export default function SessionTranscript({
  sessionId,
  beats,
  currentTime,
  onJump,
  lang,
}: {
  sessionId: string;
  beats: TranscriptBeat[];
  currentTime: number;
  onJump: (sec: number) => void;
  lang: LangCode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<{ role: string; text: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  const activeIdx = findActiveBeat(beats, currentTime);

  useEffect(() => {
    if (!activeRef.current || !containerRef.current) return;
    const container = containerRef.current;
    const el = activeRef.current;
    const top = el.offsetTop - container.offsetTop - container.clientHeight / 3;
    container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [activeIdx]);

  async function sendChat(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;
    const msg = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", text: msg }]);
    setChatLoading(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();
      setChatMessages((prev) => [...prev, { role: "assistant", text: data.reply || data.error || "No response" }]);
    } catch {
      setChatMessages((prev) => [...prev, { role: "assistant", text: "Failed to get response." }]);
    }
    setChatLoading(false);
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Transcript */}
      <div ref={containerRef} className="flex-1 overflow-auto p-3 space-y-0.5">
        {beats.length === 0 ? (
          <div className="text-[13px] text-text-secondary text-center py-6">No transcript yet.</div>
        ) : (
          beats.map((b, i) => {
            const isActive = i === activeIdx;
            return (
              <div
                key={i}
                ref={isActive ? activeRef : undefined}
                onClick={() => onJump(b.timeSeconds)}
                className={`flex gap-3 px-2 py-1.5 rounded-lg cursor-pointer transition text-[13px] ${
                  isActive ? "bg-primary-bg" : "hover:bg-background"
                }`}
              >
                <span className="text-[11px] tabular-nums text-primary font-semibold flex-shrink-0 w-10 pt-0.5">
                  {fmtTime(b.timeSeconds)}
                </span>
                <span className={`flex-1 leading-relaxed ${isActive ? "text-text-primary" : "text-text-secondary"}`}>
                  {b.text}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Chat at bottom */}
      <div className="border-t border-border">
        {chatMessages.length > 0 && (
          <div className="px-3 pt-3 space-y-2 max-h-[160px] overflow-auto">
            {chatMessages.map((m, i) => (
              <div key={i} className={`text-[13px] leading-relaxed ${m.role === "user" ? "text-text-primary font-medium" : "text-text-secondary"}`}>
                {m.text}
              </div>
            ))}
          </div>
        )}
        <form onSubmit={sendChat} className="flex gap-2 p-3">
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder={t(lang, "askAboutSession")}
            className="flex-1 text-[13px] px-3 py-2 border border-border rounded-lg outline-none"
          />
          <button
            disabled={chatLoading || !chatInput.trim()}
            className="px-3 py-2 bg-primary text-white rounded-lg text-[12px] font-medium disabled:opacity-50"
          >
            {chatLoading ? "..." : "Ask"}
          </button>
        </form>
      </div>
    </div>
  );
}

function findActiveBeat(beats: TranscriptBeat[], time: number): number {
  let lo = 0, hi = beats.length - 1, best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid].timeSeconds <= time) { best = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return best;
}
