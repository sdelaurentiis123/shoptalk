"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { LangCode, Station } from "@/lib/types";
import { t } from "@/lib/i18n";

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  source_sop_id?: string | null;
  source_step?: string | null;
  sourceTitle?: string | null;
};

const QUICK: Record<LangCode, string[]> = {
  en: ["Oven temperature?", "How to load racks?", "Calibrate metal detector"],
  es: ["¿Temperatura del horno?", "¿Cómo cargar las rejillas?", "Calibrar detector de metales"],
  zh: ["烤箱温度？", "如何装架？", "校准金属探测器"],
  ar: ["حرارة الفرن؟", "كيف نحمّل الرفوف؟", "معايرة كاشف المعادن"],
};

export default function ChatInterface({
  lang,
  stations,
  sopTitles,
  initialMessages = [],
  initialConversationId = null,
  initialStationId = null,
}: {
  lang: LangCode;
  stations: Station[];
  sopTitles: Record<string, string>;
  initialMessages?: {
    id: string;
    role: "user" | "assistant";
    content: string;
    source_sop_id: string | null;
    source_step: string | null;
  }[];
  initialConversationId?: string | null;
  initialStationId?: string | null;
}) {
  const hydratedMessages: Msg[] = initialMessages.map((m) => ({
    ...m,
    sourceTitle: m.source_sop_id ? sopTitles[m.source_sop_id] ?? null : null,
  }));
  const [messages, setMessages] = useState<Msg[]>(hydratedMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const [stationId, setStationId] = useState<string | null>(initialStationId);
  const [pendingFlag, setPendingFlag] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    const userMsg: Msg = { id: `u-${Date.now()}`, role: "user", content: text };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          conversation_id: conversationId,
          station_id: stationId,
          language: lang,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "error");
      setConversationId(data.conversation_id);
      const m = data.message as Msg;
      m.sourceTitle = m.source_sop_id ? sopTitles[m.source_sop_id] ?? null : null;
      setMessages((prev) => [...prev, m]);
      if (!m.source_sop_id) setPendingFlag(text);
    } catch (e: any) {
      setMessages((prev) => [...prev, { id: `e-${Date.now()}`, role: "assistant", content: "⚠ " + e.message }]);
    } finally {
      setLoading(false);
    }
  }

  async function reportGap(text: string) {
    setPendingFlag(null);
    await fetch("/api/flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    setMessages((prev) => [
      ...prev,
      { id: `f-${Date.now()}`, role: "assistant", content: t(lang, "flagged") },
    ]);
  }

  return (
    <div className="max-w-[780px] mx-auto h-[calc(100vh-52px)] flex flex-col">
      <div className="px-5 py-3 border-b border-border flex items-center gap-2 flex-wrap">
        <span className="text-[12px] text-text-tertiary">{t(lang, "stationLabel")}</span>
        <button
          onClick={() => setStationId(null)}
          className={`px-3 py-1 rounded-full text-[12px] ${
            stationId === null ? "bg-text-primary text-white" : "border border-border text-text-secondary"
          }`}
        >
          {t(lang, "allStations")}
        </button>
        {stations.map((s) => (
          <button
            key={s.id}
            onClick={() => setStationId(s.id)}
            className={`px-3 py-1 rounded-full text-[12px] ${
              stationId === s.id ? "bg-text-primary text-white" : "border border-border text-text-secondary"
            }`}
          >
            {s.name}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => {
            setMessages([]);
            setConversationId(null);
            setPendingFlag(null);
          }}
          disabled={loading || (messages.length === 0 && !conversationId)}
          className="px-3 py-1 rounded-full text-[12px] border border-border text-text-secondary disabled:opacity-50"
        >
          + {t(lang, "newChat")}
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto px-5 py-6 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-text-tertiary text-[13px] py-10">
            {t(lang, "askPlaceholder")}
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-[14px] leading-relaxed whitespace-pre-wrap ${
                m.role === "user" ? "bg-primary text-white" : "bg-surface border border-border"
              }`}
            >
              <div>{m.content}</div>
              {m.role === "assistant" && m.source_sop_id && (
                <Link
                  href={`/procedures/${m.source_sop_id}${m.source_step ? `#${m.source_step.toLowerCase().replace(" ", "-")}` : ""}`}
                  className="inline-block mt-2 text-[12px] text-primary font-medium"
                >
                  {t(lang, "source")}: {m.sourceTitle ?? m.source_sop_id}
                  {m.source_step ? ` · ${m.source_step}` : ""}
                </Link>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-surface border border-border px-4 py-3 rounded-2xl">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-text-tertiary rounded-full animate-bounce" />
                <span className="w-1.5 h-1.5 bg-text-tertiary rounded-full animate-bounce [animation-delay:0.15s]" />
                <span className="w-1.5 h-1.5 bg-text-tertiary rounded-full animate-bounce [animation-delay:0.3s]" />
              </div>
            </div>
          </div>
        )}
        {pendingFlag && !loading && (
          <div className="flex justify-start gap-2">
            <button
              onClick={() => reportGap(pendingFlag)}
              className="text-[12px] px-3 py-1.5 rounded-full bg-warning-bg text-warning font-medium"
            >
              {t(lang, "reportGap")}
            </button>
            <button
              onClick={() => setPendingFlag(null)}
              className="text-[12px] px-3 py-1.5 rounded-full border border-border text-text-secondary"
            >
              {t(lang, "dismiss")}
            </button>
          </div>
        )}
      </div>

      {messages.length === 0 && (
        <div className="px-5 pb-2 flex gap-2 overflow-x-auto quick-scroll">
          {QUICK[lang].map((q) => (
            <button
              key={q}
              onClick={() => send(q)}
              className="whitespace-nowrap px-3 py-[7px] rounded-full border border-border text-[12px] text-text-secondary"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <div className="p-4 border-t border-border bg-surface">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send(input);
            }}
            placeholder={t(lang, "askPlaceholder")}
            className="flex-1 px-4 py-3 rounded-full border border-border bg-surface text-[14px] outline-none min-h-[44px]"
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || loading}
            className="px-5 rounded-full bg-primary text-white font-medium text-[14px] disabled:opacity-50 min-h-[44px]"
          >
            {t(lang, "send")}
          </button>
        </div>
      </div>
    </div>
  );
}
