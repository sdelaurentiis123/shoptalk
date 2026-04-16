"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtTime } from "@/lib/utils";
import { t } from "@/lib/i18n";
import type { LangCode, TranscriptBeat, SessionTopic, SessionKeyPoint } from "@/lib/types";
import SessionOverview from "./session-overview";
import SessionTranscript from "./session-transcript";
import SessionTopicsBar from "./session-topics-bar";

interface Props {
  session: {
    id: string;
    title: string;
    summary: string;
    file_url: string | null;
    total_seconds: number;
    processing_status: string;
    raw_transcript: TranscriptBeat[];
    notes: any;
  };
  topics: SessionTopic[];
  keyPoints: SessionKeyPoint[];
  lang: LangCode;
}

export default function SessionViewer({ session, topics, keyPoints, lang }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const router = useRouter();
  const [currentTime, setCurrentTime] = useState(0);
  const [tab, setTab] = useState<"overview" | "transcript">("overview");
  const [editModeRaw, setEditModeRaw] = useState(false);
  const editMode = editModeRaw;
  const [lockedBy, setLockedBy] = useState<{ email: string | null; at: string } | null>(null);

  async function toggleEditMode(next: boolean, force = false) {
    if (!next) {
      setEditModeRaw(false);
      setLockedBy(null);
      try { await fetch(`/api/sessions/${session.id}/lock`, { method: "DELETE" }); } catch {}
      return;
    }
    const res = await fetch(`/api/sessions/${session.id}/lock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force }),
    });
    if (res.status === 409) {
      const data = await res.json().catch(() => ({}));
      setLockedBy({ email: data.locked_by_email ?? null, at: data.locked_at });
      return;
    }
    if (!res.ok) return;
    setLockedBy(null);
    setEditModeRaw(true);
  }

  useEffect(() => {
    if (!editModeRaw) return;
    const i = setInterval(() => {
      fetch(`/api/sessions/${session.id}/lock/renew`, { method: "POST" }).catch(() => {});
    }, 2 * 60 * 1000);
    const onBeforeUnload = () => {
      navigator.sendBeacon?.(`/api/sessions/${session.id}/lock`,
        new Blob([JSON.stringify({})], { type: "application/json" }));
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      clearInterval(i);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [editModeRaw, session.id]);
  const [title, setTitle] = useState(session.title);
  const [savingTitle, setSavingTitle] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const transcript: TranscriptBeat[] = Array.isArray(session.raw_transcript) ? session.raw_transcript : [];
  const totalSeconds = session.total_seconds || 0;

  useEffect(() => {
    if (session.processing_status !== "ready") {
      fetch("/api/process-stale", { method: "POST" }).catch(() => {});
    }
  }, [session.processing_status]);

  useEffect(() => {
    if (!session.file_url) return;
    const v = videoRef.current;
    if (v && v.src !== session.file_url) v.src = session.file_url;
  }, [session.id, session.file_url]);

  function jumpTo(sec: number) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = sec;
    const onSeeked = () => { v.play().catch(() => {}); v.removeEventListener("seeked", onSeeked); };
    v.addEventListener("seeked", onSeeked);
  }

  async function saveTitle() {
    if (title === session.title) return;
    setSavingTitle(true);
    await fetch(`/api/sessions/${session.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setSavingTitle(false);
  }

  async function deleteSession() {
    if (!confirm(t(lang, "deleteSessionConfirm"))) return;
    setDeleting(true);
    const res = await fetch(`/api/sessions/${session.id}`, { method: "DELETE" });
    if (res.ok) { router.push("/sessions"); router.refresh(); }
    setDeleting(false);
  }

  if (session.processing_status !== "ready") {
    return (
      <main className="max-w-[960px] mx-auto px-7 py-8 text-center">
        <h1 className="text-[22px] font-bold mb-2">{session.title || "Processing..."}</h1>
        <p className="text-text-secondary text-[14px]">
          {session.processing_status === "failed"
            ? "Processing failed. Try re-uploading."
            : `Status: ${session.processing_status}. This page will update when ready.`}
        </p>
      </main>
    );
  }

  return (
    <main className="max-w-[1400px] mx-auto px-7 py-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <Link href="/sessions" className="text-[13px] text-text-secondary">&larr; {t(lang, "sessions")}</Link>
        <div className="flex items-center gap-2">
          <button
            onClick={() => toggleEditMode(!editMode)}
            className={`px-4 py-[7px] rounded-full text-[13px] font-medium ${
              editMode ? "bg-text-primary text-white" : "border border-border"
            }`}
          >
            {editMode ? t(lang, "exitEdit") : t(lang, "edit")}
          </button>
          {editMode && (
            <button
              onClick={deleteSession}
              disabled={deleting}
              className="px-4 py-[7px] rounded-full border border-danger text-danger text-[13px] font-medium hover:bg-danger hover:text-white transition disabled:opacity-60"
            >
              {deleting ? "..." : t(lang, "deleteSession")}
            </button>
          )}
        </div>
      </div>

      {lockedBy && (
        <div className="mb-4 bg-warning-bg border border-warning rounded-xl p-4 text-[13px] flex items-center justify-between gap-3">
          <div>
            <strong>{lockedBy.email ?? "Another admin"}</strong> is editing this session
            {lockedBy.at && <> (since {new Date(lockedBy.at).toLocaleTimeString()})</>}. Read-only.
          </div>
          <button
            onClick={() => toggleEditMode(true, true)}
            className="px-3 py-1.5 rounded-full bg-text-primary text-white text-[12px] font-medium"
          >
            Take over
          </button>
        </div>
      )}

      {/* Grid: video left, panel right */}
      <div className="grid md:grid-cols-[1fr_380px] gap-6">
        {/* Left: video + title + topics */}
        <div>
          {session.file_url ? (
            <video
              ref={videoRef}
              controls
              className="w-full rounded-xl bg-black aspect-video"
              onTimeUpdate={(e) => setCurrentTime(Math.floor((e.target as HTMLVideoElement).currentTime))}
            />
          ) : (
            <div className="w-full rounded-xl bg-background aspect-video flex items-center justify-center text-text-tertiary">
              No video
            </div>
          )}

          {/* Title */}
          <div className="mt-5 mb-2 flex items-baseline gap-2">
            {editMode ? (
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setTitle(session.title);
                }}
                disabled={savingTitle}
                className="flex-1 text-[22px] font-bold tracking-tight2 bg-transparent border-b border-border focus:border-primary outline-none py-0.5 disabled:opacity-60"
              />
            ) : (
              <h1 className="text-[22px] font-bold tracking-tight2">{title}</h1>
            )}
          </div>

          {session.summary && !editMode && (
            <p className="text-[13px] text-text-secondary leading-relaxed mb-3">{session.summary}</p>
          )}

          {/* Topic bar */}
          <SessionTopicsBar topics={topics} currentTime={currentTime} onJump={jumpTo} />
        </div>

        {/* Right: Overview | Transcript panel */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden flex flex-col max-h-[85vh]">
          {/* Tab pills */}
          <div className="flex gap-[2px] bg-background p-[3px] m-3 rounded-full">
            <button
              onClick={() => setTab("overview")}
              className={`flex-1 py-[6px] rounded-full text-[13px] font-medium transition ${
                tab === "overview" ? "bg-text-primary text-white" : "text-text-secondary"
              }`}
            >
              {t(lang, "overview")}
            </button>
            <button
              onClick={() => setTab("transcript")}
              className={`flex-1 py-[6px] rounded-full text-[13px] font-medium transition ${
                tab === "transcript" ? "bg-text-primary text-white" : "text-text-secondary"
              }`}
            >
              {t(lang, "transcript")}
            </button>
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-auto">
            {tab === "overview" ? (
              <SessionOverview
                sessionId={session.id}
                summary={session.summary}
                keyPoints={keyPoints}
                actionItems={session.notes?.actionItems ?? []}
                onJump={jumpTo}
                editMode={editMode}
                totalSeconds={totalSeconds}
                lang={lang}
              />
            ) : (
              <SessionTranscript
                sessionId={session.id}
                beats={transcript}
                currentTime={currentTime}
                onJump={jumpTo}
                lang={lang}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
