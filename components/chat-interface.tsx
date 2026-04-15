"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { LangCode, Station } from "@/lib/types";
import { t } from "@/lib/i18n";
import { relativeTime } from "@/lib/utils";

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  source_sop_id?: string | null;
  source_step?: string | null;
  sourceTitle?: string | null;
};

type Conversation = {
  id: string;
  title: string | null;
  station_id: string | null;
  updated_at: string;
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
  conversations: initialConversations = [],
  initialMessages = [],
  initialConversationId = null,
  initialStationId = null,
}: {
  lang: LangCode;
  stations: Station[];
  sopTitles: Record<string, string>;
  conversations?: Conversation[];
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
  const hydrate = (msgs: typeof initialMessages): Msg[] =>
    msgs.map((m) => ({
      ...m,
      sourceTitle: m.source_sop_id ? sopTitles[m.source_sop_id] ?? null : null,
    }));

  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [messages, setMessages] = useState<Msg[]>(hydrate(initialMessages));
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const [stationId, setStationId] = useState<string | null>(initialStationId);
  const [pendingFlag, setPendingFlag] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const shortLang: "en" | "es" = lang === "es" ? "es" : "en";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    const userMsg: Msg = { id: `u-${Date.now()}`, role: "user", content: text };
    const isFirstMessage = messages.length === 0;
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
      const newConvoId: string = data.conversation_id;
      setConversationId(newConvoId);
      const m = data.message as Msg;
      m.sourceTitle = m.source_sop_id ? sopTitles[m.source_sop_id] ?? null : null;
      setMessages((prev) => [...prev, m]);
      if (!m.source_sop_id) setPendingFlag(text);

      // Reflect the conversation in the rail.
      setConversations((list) => {
        const existing = list.find((c) => c.id === newConvoId);
        const title = existing?.title ?? (isFirstMessage ? text.slice(0, 60) : null);
        const updated: Conversation = {
          id: newConvoId,
          title,
          station_id: stationId,
          updated_at: new Date().toISOString(),
        };
        const without = list.filter((c) => c.id !== newConvoId);
        return [updated, ...without];
      });
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

  function startNewChat() {
    setMessages([]);
    setConversationId(null);
    setPendingFlag(null);
  }

  async function openConversation(id: string) {
    if (id === conversationId || switchingTo) return;
    setSwitchingTo(id);
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      setMessages(hydrate(data.messages ?? []));
      setConversationId(id);
      setStationId(data.conversation?.station_id ?? null);
      setPendingFlag(null);
    } finally {
      setSwitchingTo(null);
    }
  }

  async function deleteConversation(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!confirm(t(lang, "deleteChatConfirm"))) return;
    const prev = conversations;
    setConversations((list) => list.filter((c) => c.id !== id));
    const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setConversations(prev);
      return;
    }
    if (id === conversationId) {
      setMessages([]);
      setConversationId(null);
      setPendingFlag(null);
    }
  }

  return (
    <div className="h-[calc(100vh-52px)] flex">
      {/* Left rail */}
      <aside className="hidden md:flex w-[260px] flex-col border-r border-border bg-background/40">
        <div className="p-3 border-b border-border">
          <button
            onClick={startNewChat}
            className="w-full px-3 py-2 rounded-lg bg-primary text-white text-[13px] font-medium"
          >
            + {t(lang, "newChat")}
          </button>
        </div>
        <div className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wider text-text-tertiary font-semibold">
          {t(lang, "chats")}
        </div>
        <div className="flex-1 overflow-auto px-2 pb-3 space-y-0.5">
          {conversations.length === 0 && (
            <div className="px-3 py-6 text-[12px] text-text-tertiary text-center">{t(lang, "noChatsYet")}</div>
          )}
          {conversations.map((c) => {
            const isActive = c.id === conversationId;
            const title = c.title?.trim() || t(lang, "untitledChat");
            return (
              <div
                key={c.id}
                onClick={() => openConversation(c.id)}
                className={`group relative px-3 py-2 rounded-lg cursor-pointer transition ${
                  isActive ? "bg-surface border border-border" : "hover:bg-surface/60"
                }`}
              >
                <div className="flex items-baseline gap-2 pr-6">
                  <div className="flex-1 min-w-0 text-[13px] font-medium text-text-primary truncate">{title}</div>
                  <div className="text-[10px] text-text-tertiary tabular-nums flex-shrink-0">
                    {relativeTime(c.updated_at, shortLang)}
                  </div>
                </div>
                <button
                  onClick={(e) => deleteConversation(e, c.id)}
                  className="absolute top-1/2 -translate-y-1/2 right-2 opacity-0 group-hover:opacity-100 focus:opacity-100 w-5 h-5 flex items-center justify-center rounded text-text-tertiary hover:text-danger hover:bg-danger-bg"
                  title={t(lang, "delete")}
                >
                  <span className="text-[13px] leading-none">×</span>
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      {/* Main pane */}
      <div className="flex-1 flex flex-col max-w-[780px] mx-auto w-full">
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
            onClick={startNewChat}
            disabled={loading || (messages.length === 0 && !conversationId)}
            className="md:hidden px-3 py-1 rounded-full text-[12px] border border-border text-text-secondary disabled:opacity-50"
          >
            + {t(lang, "newChat")}
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-auto px-5 py-6 space-y-4">
          {messages.length === 0 && !switchingTo && (
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

        {messages.length === 0 && !switchingTo && (
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
    </div>
  );
}
