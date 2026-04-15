"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SopWithSteps, StepWithSubsteps, Role } from "@/lib/types";
import { fmtTime } from "@/lib/utils";
import EditStepModal from "./edit-step-modal";

export default function SopDetail({ sop, role }: { sop: SopWithSteps; role: Role }) {
  const [steps, setSteps] = useState<StepWithSubsteps[]>(
    [...sop.steps].sort((a, b) => a.sort_order - b.sort_order).map((s) => ({
      ...s,
      substeps: [...s.substeps].sort((a, b) => a.sort_order - b.sort_order),
    })),
  );
  const [editMode, setEditMode] = useState(false);
  const [editing, setEditing] = useState<{ step: StepWithSubsteps; index: number } | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(sop.status);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const router = useRouter();

  const isVideo = sop.type === "video";
  const totalSeconds = sop.total_seconds;

  // Auto-scroll active step when video time changes.
  useEffect(() => {
    if (!isVideo) return;
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      setCurrentTime(v.currentTime);
      const idx = steps.findIndex((s) => v.currentTime >= (s.start_sec ?? 0) && v.currentTime <= (s.end_sec ?? 0));
      if (idx !== -1 && idx !== activeStep) setActiveStep(idx);
    };
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [steps, activeStep, isVideo]);

  function jumpTo(sec: number) {
    if (!videoRef.current) return;
    videoRef.current.currentTime = sec;
    videoRef.current.play().catch(() => {});
  }

  async function save() {
    setSaving(true);
    const payload = {
      steps: steps.map((s, i) => ({
        title: s.title,
        description: s.description,
        start_sec: s.start_sec,
        end_sec: s.end_sec,
        sort_order: i,
        substeps: s.substeps.map((ss, j) => ({
          text: ss.text,
          time_sec: ss.time_sec,
          sort_order: j,
        })),
      })),
    };
    const res = await fetch(`/api/sops/${sop.id}/steps`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (res.ok) {
      setEditMode(false);
      router.refresh();
    }
  }

  async function setSopStatus(next: "draft" | "active" | "archived") {
    const res = await fetch(`/api/sops/${sop.id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (res.ok) {
      setStatus(next);
      router.refresh();
    }
  }

  function moveStep(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    setSteps(next);
  }

  return (
    <div className="max-w-[1100px] mx-auto px-7 py-6">
      <div className="flex items-center justify-between mb-4">
        <Link href="/procedures" className="text-[13px] text-text-secondary">
          ← Back
        </Link>
        {role === "admin" && (
          <div className="flex gap-2">
            {status === "draft" && (
              <button onClick={() => setSopStatus("active")} className="px-4 py-[7px] rounded-full bg-success text-white text-[13px] font-medium">
                Set Active
              </button>
            )}
            {status === "active" && (
              <button onClick={() => setSopStatus("archived")} className="px-4 py-[7px] rounded-full border border-border text-[13px]">
                Archive
              </button>
            )}
            <button
              onClick={() => setEditMode((v) => !v)}
              className={`px-4 py-[7px] rounded-full text-[13px] font-medium ${
                editMode ? "bg-text-primary text-white" : "border border-border"
              }`}
            >
              {editMode ? "Exit edit" : "Edit"}
            </button>
            {editMode && (
              <button onClick={save} disabled={saving} className="px-4 py-[7px] rounded-full bg-primary text-white text-[13px] font-medium">
                {saving ? "Saving…" : "Save"}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-2 mb-1">
        <h1 className="text-[22px] font-bold tracking-tight2">{sop.title}</h1>
        {status === "draft" && <span className="text-[11px] font-medium text-warning">Draft</span>}
        {status === "archived" && <span className="text-[11px] font-medium text-text-tertiary">Archived</span>}
      </div>
      <p className="text-[13px] text-text-secondary mb-6">{sop.description}</p>

      <div className="grid md:grid-cols-[1fr_340px] gap-6">
        <div>
          {isVideo && sop.file_url ? (
            <video ref={videoRef} controls src={sop.file_url} className="w-full rounded-xl bg-black aspect-video" />
          ) : sop.type === "pdf" && sop.file_url ? (
            <iframe src={sop.file_url} className="w-full h-[75vh] rounded-xl bg-surface border border-border" />
          ) : sop.type === "image" && sop.file_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sop.file_url} alt={sop.title} className="w-full rounded-xl" />
          ) : (
            <div className="bg-surface border border-border rounded-xl p-10 text-center text-text-tertiary">
              No file attached.
            </div>
          )}
        </div>

        <div className="bg-surface border border-border rounded-xl p-4 max-h-[75vh] overflow-auto">
          <div className="text-[13px] font-semibold mb-3 text-text-secondary uppercase tracking-wide">Steps</div>
          {steps.map((st, i) => (
            <div
              id={`step-${i + 1}`}
              key={st.id}
              className={`rounded-lg p-3 mb-2 cursor-pointer transition ${
                activeStep === i ? "bg-primary-bg" : "hover:bg-background"
              }`}
              onClick={() => {
                if (isVideo && st.start_sec != null) jumpTo(st.start_sec);
                setActiveStep(i);
              }}
            >
              <div className="flex justify-between items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold leading-snug">
                    {i + 1}. {st.title}
                  </div>
                  <div className="text-[12px] text-text-secondary mt-0.5 leading-snug">{st.description}</div>
                  {isVideo && st.start_sec != null && (
                    <div className="text-[11px] text-text-tertiary tabular-nums mt-1">
                      {fmtTime(st.start_sec)} – {fmtTime(st.end_sec)}
                    </div>
                  )}
                  {st.substeps.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {st.substeps.map((ss, j) => (
                        <li
                          key={ss.id}
                          className="text-[12px] text-text-secondary pl-3 relative"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isVideo && ss.time_sec != null) jumpTo(ss.time_sec);
                          }}
                        >
                          <span className="absolute left-0 text-primary font-semibold">{String.fromCharCode(97 + j)}.</span>
                          {ss.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {editMode && role === "admin" && (
                  <div className="flex flex-col gap-1">
                    <button onClick={(e) => { e.stopPropagation(); moveStep(i, -1); }} className="text-text-tertiary text-xs px-1">▲</button>
                    <button onClick={(e) => { e.stopPropagation(); moveStep(i, 1); }} className="text-text-tertiary text-xs px-1">▼</button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditing({ step: st, index: i }); }}
                      className="text-primary text-[11px] font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setSteps(steps.filter((_, k) => k !== i)); }}
                      className="text-danger text-xs"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {editMode && role === "admin" && (
            <button
              onClick={() =>
                setSteps([
                  ...steps,
                  {
                    id: `tmp-${Math.random()}`,
                    sop_id: sop.id,
                    sort_order: steps.length,
                    title: "New step",
                    description: "",
                    start_sec: isVideo ? Math.round(currentTime) : null,
                    end_sec: isVideo ? Math.min(Math.round(currentTime) + 15, totalSeconds) : null,
                    substeps: [],
                  },
                ])
              }
              className="w-full mt-2 py-2 rounded-lg border border-dashed border-border text-[13px] text-primary font-medium"
            >
              + Add step
            </button>
          )}
        </div>
      </div>

      {editing && (
        <EditStepModal
          step={editing.step}
          stepIndex={editing.index}
          totalSeconds={totalSeconds}
          isVideo={isVideo}
          currentVideoSec={currentTime}
          onSave={(updated) => {
            const next = [...steps];
            next[editing.index] = updated;
            setSteps(next);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
