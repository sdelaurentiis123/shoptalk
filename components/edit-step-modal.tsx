"use client";

import { useState } from "react";
import Filmstrip from "./filmstrip";
import { fmtTime } from "@/lib/utils";
import type { StepWithSubsteps } from "@/lib/types";

export default function EditStepModal({
  step,
  stepIndex,
  totalSeconds,
  isVideo,
  currentVideoSec,
  onSave,
  onClose,
}: {
  step: StepWithSubsteps;
  stepIndex: number;
  totalSeconds: number;
  isVideo: boolean;
  currentVideoSec: number;
  onSave: (s: StepWithSubsteps) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(step.title);
  const [desc, setDesc] = useState(step.description);
  const [startSec, setStartSec] = useState(step.start_sec ?? 0);
  const [endSec, setEndSec] = useState(step.end_sec ?? Math.min(15, totalSeconds || 15));
  const [substeps, setSubsteps] = useState(
    step.substeps.map((s) => ({ ...s })),
  );
  const clipDur = endSec - startSec;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div onClick={onClose} className="absolute inset-0 bg-black/25 backdrop-blur-sm" />
      <div className="relative bg-surface rounded-2xl w-[520px] max-h-[85vh] overflow-auto shadow-cardlg p-7 px-8">
        <div className="flex justify-between items-center mb-6">
          <span className="text-[17px] font-semibold">Edit Step {stepIndex + 1}</span>
          <button
            onClick={onClose}
            className="bg-background w-7 h-7 rounded-full text-[15px] text-text-secondary flex items-center justify-center"
          >
            ×
          </button>
        </div>

        <label className="block text-[13px] font-medium text-text-secondary mb-1.5">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3 py-2.5 border border-border rounded-lg text-[14px] outline-none bg-surface mb-5"
        />

        <label className="block text-[13px] font-medium text-text-secondary mb-1.5">Description</label>
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={2}
          className="w-full px-3 py-2.5 border border-border rounded-lg text-[14px] outline-none bg-surface resize-y mb-5"
        />

        {isVideo && totalSeconds > 0 && (
          <div className="mb-6">
            <label className="block text-[13px] font-medium text-text-secondary mb-3">Video Clip Range</label>
            <div className="bg-background rounded-xl px-5 py-4">
              <div className="flex justify-between items-center mb-3">
                <span className="text-[13px] font-medium">Clip Range</span>
                <span className="text-[12px] text-text-tertiary">{fmtTime(clipDur)} clip</span>
              </div>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-[14px] font-semibold text-primary tabular-nums">{fmtTime(startSec)}</span>
                <div className="flex-1 h-px bg-border" />
                <span className="text-[12px] text-text-tertiary">to</span>
                <div className="flex-1 h-px bg-border" />
                <span className="text-[14px] font-semibold text-primary tabular-nums">{fmtTime(endSec)}</span>
              </div>
              <Filmstrip
                totalSeconds={totalSeconds}
                startSec={startSec}
                endSec={endSec}
                onRangeChange={(s, e) => {
                  setStartSec(s);
                  setEndSec(e);
                }}
              />
              <div className="flex items-center gap-2 mt-3">
                <span className="text-[12px] text-text-tertiary">Quick</span>
                {[15, 30, 45, 60].map((d) => (
                  <button
                    key={d}
                    onClick={() => setEndSec(Math.min(startSec + d, totalSeconds))}
                    className={`px-3 py-1 rounded-md text-[12px] font-medium border border-border ${
                      clipDur === d ? "bg-primary text-white" : "bg-surface text-text-secondary"
                    }`}
                  >
                    {d}s
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="mb-6">
          <div className="flex justify-between items-center mb-3">
            <label className="text-[13px] font-medium text-text-secondary">Sub-steps</label>
            <button
              onClick={() => setSubsteps([...substeps, { id: `tmp-${Math.random()}`, step_id: step.id, sort_order: substeps.length, text: "", time_sec: isVideo ? startSec : null }])}
              className="text-[13px] text-primary font-medium"
            >
              + Add
            </button>
          </div>
          {substeps.map((sub, i) => (
            <div key={sub.id} className="flex gap-2 items-start mb-2.5">
              <span className="text-[13px] font-semibold text-primary pt-2.5 min-w-4">
                {String.fromCharCode(97 + i)}.
              </span>
              <div className="flex-1">
                <textarea
                  value={sub.text}
                  onChange={(e) => {
                    const n = [...substeps];
                    n[i] = { ...n[i], text: e.target.value };
                    setSubsteps(n);
                  }}
                  rows={2}
                  className="w-full px-2.5 py-2 border border-border rounded-lg text-[13px] outline-none bg-surface resize-none"
                />
                {isVideo && totalSeconds > 0 && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <input
                      value={sub.time_sec ?? ""}
                      onChange={(e) => {
                        const n = [...substeps];
                        n[i] = { ...n[i], time_sec: parseInt(e.target.value) || 0 };
                        setSubsteps(n);
                      }}
                      className="w-12 px-1.5 py-1 border border-border rounded text-[12px] text-center"
                    />
                    <span className="text-[11px] text-text-tertiary">seconds</span>
                    <button
                      onClick={() => {
                        const n = [...substeps];
                        n[i] = { ...n[i], time_sec: Math.round(currentVideoSec) };
                        setSubsteps(n);
                      }}
                      className="px-2.5 py-[3px] bg-primary text-white rounded text-[11px] font-medium"
                    >
                      Set from video
                    </button>
                    {sub.time_sec != null && (
                      <span className="text-[11px] text-text-tertiary">({fmtTime(sub.time_sec)})</span>
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={() => setSubsteps(substeps.filter((_, j) => j !== i))}
                className="px-1 py-2 text-text-tertiary text-sm"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2.5">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg border border-border bg-surface text-[14px] font-medium"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onSave({
                ...step,
                title,
                description: desc,
                start_sec: isVideo ? startSec : null,
                end_sec: isVideo ? endSec : null,
                substeps: substeps.map((s, i) => ({ ...s, sort_order: i })),
              })
            }
            className="px-5 py-2 rounded-lg bg-primary text-white text-[14px] font-medium"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
