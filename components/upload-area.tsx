"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LangCode } from "@/lib/types";
import { t } from "@/lib/i18n";

const MAX_PARALLEL = 3;
const MAX_PART_RETRIES = 3;

type StartResp = {
  key: string;
  upload_id: string;
  part_size: number;
  parts: { partNumber: number; url: string }[];
};

function putPart(url: string, blob: Blob, onBytes: (delta: number) => void, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    let last = 0;
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const delta = e.loaded - last;
      last = e.loaded;
      onBytes(delta);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader("ETag") || xhr.getResponseHeader("etag");
        if (!etag) return reject(new Error("no ETag returned"));
        resolve(etag.replace(/"/g, ""));
      } else reject(new Error(`part PUT ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("network error"));
    xhr.onabort = () => reject(new Error("aborted"));
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(blob);
  });
}

async function putPartWithRetry(
  url: string,
  blob: Blob,
  onBytes: (delta: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  let lastErr: unknown;
  for (let i = 0; i < MAX_PART_RETRIES; i++) {
    try {
      return await putPart(url, blob, onBytes, signal);
    } catch (e) {
      lastErr = e;
      if (signal?.aborted) throw e;
      await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export default function UploadArea({
  facilityId,
  stationId,
  lang,
}: {
  facilityId: string;
  stationId?: string | null;
  lang: LangCode;
}) {
  void facilityId;
  const fileRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const abortRef = useRef<AbortController | null>(null);

  async function handleFile(maybeFile: File | undefined) {
    if (!maybeFile) return;
    const file: File = maybeFile;
    const isVideo = file.type.startsWith("video/");
    const isPdf = file.type === "application/pdf";
    const isImg = file.type.startsWith("image/");
    if (!isVideo && !isPdf && !isImg) {
      setError(t(lang, "invalidFileType"));
      return;
    }
    setProcessing(true);
    setError("");
    setProgress(0);
    setSpeed("");
    setStatus(t(lang, "preparingUpload", { mb: (file.size / 1024 / 1024).toFixed(1) }));
    abortRef.current = new AbortController();

    try {
      // 1. Start multipart.
      const startRes = await fetch("/api/uploads/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_name: file.name, file_type: file.type, file_size: file.size }),
      });
      const start: StartResp | { error: string } = await startRes.json();
      if (!startRes.ok) throw new Error(("error" in start ? start.error : "start failed") as string);
      const { key, upload_id, part_size, parts } = start as StartResp;

      // 2. Upload parts in parallel, max MAX_PARALLEL at a time.
      setStatus(t(lang, "uploadingParts", { done: 0, total: parts.length }));
      const totalBytes = file.size;
      let uploadedBytes = 0;
      const startTs = Date.now();

      function onBytes(delta: number) {
        uploadedBytes += delta;
        // Upload is "stage 1 of 2". Cap at 70 here; Gemini takes the rest.
        const pct = Math.min(70, Math.floor((uploadedBytes / totalBytes) * 70));
        setProgress(pct);
        const elapsed = (Date.now() - startTs) / 1000;
        if (elapsed > 1) {
          const mbps = uploadedBytes / 1024 / 1024 / elapsed;
          setSpeed(`${mbps.toFixed(1)} MB/s`);
        }
      }

      const etags: { partNumber: number; etag: string }[] = new Array(parts.length);
      let done = 0;
      let cursor = 0;

      async function worker() {
        while (true) {
          const i = cursor++;
          if (i >= parts.length) return;
          const p = parts[i];
          const offset = (p.partNumber - 1) * part_size;
          const slice = file.slice(offset, Math.min(offset + part_size, file.size));
          const etag = await putPartWithRetry(p.url, slice, onBytes, abortRef.current?.signal);
          etags[i] = { partNumber: p.partNumber, etag };
          done++;
          setStatus(t(lang, "uploadingParts", { done, total: parts.length }));
        }
      }

      try {
        await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL, parts.length) }, worker));
      } catch (e) {
        // Best-effort abort of the multipart upload.
        fetch("/api/uploads/abort", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, upload_id }),
        }).catch(() => {});
        throw e;
      }

      // 3. Complete.
      setStatus(t(lang, "finalizingUpload"));
      setProgress(75);
      const compRes = await fetch("/api/uploads/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, upload_id, parts: etags }),
      });
      const comp = await compRes.json();
      if (!compRes.ok) throw new Error(comp.error || "complete failed");

      // 4. Kick off Gemini processing.
      setProgress(85);
      setSpeed("");
      setStatus(isVideo ? t(lang, "analyzingVideo") : t(lang, "analyzingDoc"));
      const procRes = await fetch("/api/process-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storage_path: key,
          file_type: file.type,
          file_name: file.name,
          station_id: stationId ?? null,
        }),
      });
      const proc = await procRes.json();
      if (!procRes.ok) throw new Error(proc.error || "processing failed");

      setProgress(100);
      setStatus("");
      setProcessing(false);
      router.push(`/procedures/${proc.sop.id}`);
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setProcessing(false);
      setStatus("");
      setSpeed("");
    }
  }

  function cancel() {
    abortRef.current?.abort();
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
            <div className="text-[15px] font-semibold">{t(lang, "upload")}</div>
            <div className="text-[13px] text-text-secondary mt-[3px]">{t(lang, "uploadHint")}</div>
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            className="bg-primary text-white rounded-full px-[22px] py-[9px] font-medium text-[13px]"
          >
            {t(lang, "chooseFiles")}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <div className="flex-1">
            <div className="text-[14px] font-medium">{status}</div>
            <div className="text-[12px] text-text-tertiary mt-0.5 tabular-nums">
              {progress}%{speed ? ` · ${speed}` : ""} · {t(lang, "uploadTakesTime")}
            </div>
            <div className="h-1 bg-background rounded-full mt-2 overflow-hidden">
              <div className="h-full bg-primary transition-all duration-500" style={{ width: `${Math.max(progress, 4)}%` }} />
            </div>
          </div>
          <button onClick={cancel} className="text-[12px] text-text-tertiary hover:text-danger">
            {t(lang, "cancel")}
          </button>
        </div>
      )}
      {error && (
        <div className="mt-3 px-[14px] py-[10px] bg-danger-bg rounded-lg text-[13px] text-danger">{error}</div>
      )}
    </div>
  );
}
