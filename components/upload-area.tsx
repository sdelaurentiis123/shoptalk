"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function UploadArea({
  facilityId,
  stationId,
}: {
  facilityId: string;
  stationId?: string | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const isVideo = file.type.startsWith("video/");
    const isPdf = file.type === "application/pdf";
    const isImg = file.type.startsWith("image/");
    if (!isVideo && !isPdf && !isImg) {
      setError("Please upload a video, PDF, or image file.");
      return;
    }
    setProcessing(true);
    setError("");
    setProgress(0);
    setStatus(`Uploading ${(file.size / 1024 / 1024).toFixed(1)} MB…`);

    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "bin";
      const storagePath = `${facilityId}/${crypto.randomUUID()}.${ext}`;

      // Direct browser → Supabase Storage. Chunked internally; bypasses Next.js.
      const { error: upErr } = await supabase.storage
        .from("sop-files")
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (upErr) throw new Error(upErr.message);

      setStatus(isVideo ? "Analyzing video with Gemini…" : "Analyzing document with Gemini…");
      setProgress(60);

      const res = await fetch("/api/process-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storage_path: storagePath,
          file_type: file.type,
          file_name: file.name,
          station_id: stationId ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "processing failed");

      setProgress(100);
      setStatus("");
      setProcessing(false);
      router.push(`/procedures/${data.sop.id}`);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
      setProcessing(false);
      setStatus("");
    }
  }

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        handleFile(e.dataTransfer.files[0]);
      }}
      className={`bg-surface rounded-xl shadow-card border border-border mb-8 transition-all ${
        processing ? "py-5 px-9" : "py-7 px-9"
      }`}
    >
      <input
        ref={fileRef}
        type="file"
        accept="video/*,.pdf,image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {!processing ? (
        <div className="flex justify-between items-center">
          <div>
            <div className="text-[15px] font-semibold">Upload procedures</div>
            <div className="text-[13px] text-text-secondary mt-[3px]">
              Drop video, PDF, or image files — Gemini will extract steps automatically.
            </div>
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            className="bg-primary text-white rounded-full px-[22px] py-[9px] font-medium text-[13px]"
          >
            Choose files
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <div className="flex-1">
            <div className="text-[14px] font-medium">{status}</div>
            <div className="text-[12px] text-text-tertiary mt-0.5">
              This may take a moment for longer videos.
            </div>
            {progress > 0 && progress < 100 && (
              <div className="h-1 bg-background rounded-full mt-2 overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>
        </div>
      )}
      {error && (
        <div className="mt-3 px-[14px] py-[10px] bg-danger-bg rounded-lg text-[13px] text-danger">{error}</div>
      )}
    </div>
  );
}
