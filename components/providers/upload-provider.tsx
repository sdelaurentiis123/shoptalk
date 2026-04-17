"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./toast-provider";

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

async function putPartWithRetry(url: string, blob: Blob, onBytes: (delta: number) => void, signal?: AbortSignal): Promise<string> {
  let lastErr: unknown;
  for (let i = 0; i < MAX_PART_RETRIES; i++) {
    try { return await putPart(url, blob, onBytes, signal); } catch (e) {
      lastErr = e;
      if (signal?.aborted) throw e;
      await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export interface UploadState {
  active: boolean;
  mode: "sop" | "session";
  progress: number;
  status: string;
  speed: string;
  error: string | null;
}

interface UploadCtx {
  upload: UploadState | null;
  startUpload: (file: File, opts: { mode: "sop" | "session"; facilityId: string; stationId?: string | null }) => void;
  cancelUpload: () => void;
}

const Ctx = createContext<UploadCtx>({ upload: null, startUpload: () => {}, cancelUpload: () => {} });

export function useUpload() { return useContext(Ctx); }

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [upload, setUpload] = useState<UploadState | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const router = useRouter();
  const { addToast } = useToast();

  useEffect(() => {
    if (!upload?.active) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [upload?.active]);

  const cancelUpload = useCallback(() => {
    abortRef.current?.abort();
    setUpload(null);
  }, []);

  const startUpload = useCallback((file: File, opts: { mode: "sop" | "session"; facilityId: string; stationId?: string | null }) => {
    if (upload?.active) return;

    const { mode, facilityId, stationId } = opts;
    const ac = new AbortController();
    abortRef.current = ac;

    setUpload({ active: true, mode, progress: 0, status: "Preparing upload...", speed: "", error: null });

    (async () => {
      try {
        const startRes = await fetch("/api/uploads/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file_name: file.name, file_type: file.type, file_size: file.size }),
        });
        const start: StartResp | { error: string } = await startRes.json();
        if (!startRes.ok) throw new Error(("error" in start ? start.error : "start failed") as string);
        const { key, upload_id, part_size, parts } = start as StartResp;

        const totalBytes = file.size;
        let uploadedBytes = 0;
        const startTs = Date.now();

        function onBytes(delta: number) {
          uploadedBytes += delta;
          const pct = Math.min(70, Math.floor((uploadedBytes / totalBytes) * 70));
          const elapsed = (Date.now() - startTs) / 1000;
          const spd = elapsed > 1 ? `${(uploadedBytes / 1024 / 1024 / elapsed).toFixed(1)} MB/s` : "";
          setUpload((u) => u ? { ...u, progress: pct, speed: spd } : u);
        }

        let done = 0;
        setUpload((u) => u ? { ...u, status: `Uploading 0 / ${parts.length} parts...` } : u);

        const etags: { partNumber: number; etag: string }[] = new Array(parts.length);
        let cursor = 0;

        async function worker() {
          while (true) {
            const i = cursor++;
            if (i >= parts.length) return;
            const p = parts[i];
            const offset = (p.partNumber - 1) * part_size;
            const slice = file.slice(offset, Math.min(offset + part_size, file.size));
            const etag = await putPartWithRetry(p.url, slice, onBytes, ac.signal);
            etags[i] = { partNumber: p.partNumber, etag };
            done++;
            setUpload((u) => u ? { ...u, status: `Uploading ${done} / ${parts.length} parts...` } : u);
          }
        }

        try {
          await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL, parts.length) }, worker));
        } catch (e) {
          fetch("/api/uploads/abort", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key, upload_id }),
          }).catch(() => {});
          throw e;
        }

        setUpload((u) => u ? { ...u, progress: 75, status: "Finalizing upload...", speed: "" } : u);
        const compRes = await fetch("/api/uploads/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, upload_id, parts: etags }),
        });
        if (!compRes.ok) throw new Error((await compRes.json()).error || "complete failed");

        setUpload((u) => u ? { ...u, progress: 80, status: "Splitting video for processing..." } : u);

        const endpoint = mode === "session" ? "/api/process-session" : "/api/process-upload";
        const procRes = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storage_path: key, file_type: file.type, file_name: file.name, station_id: stationId ?? null }),
        });
        const proc = await procRes.json();
        if (!procRes.ok) throw new Error(proc.error || "processing failed");

        const parentId = mode === "session" ? proc.session?.id : proc.sop?.id;
        const chunksTotal = proc.chunksTotal ?? 0;
        const href = mode === "session" ? `/sessions/${parentId}` : `/procedures/${parentId}`;
        const isVideo = file.type.startsWith("video/");

        if (chunksTotal === 0 && !isVideo) {
          // Non-video (PDF/image) — already processed inline.
          setUpload(null);
          addToast(mode === "session" ? "Session ready!" : "SOP ready!", { type: "success", action: { label: "View", href } });
          router.push(href);
          router.refresh();
          return;
        }

        // Video: Fly is processing. Poll until done.
        setUpload((u) => u ? { ...u, progress: 82, status: "Processing video..." } : u);

        // Poll for progress.
        const poll = async (): Promise<void> => {
          while (true) {
            await new Promise((r) => setTimeout(r, 3000));
            try {
              const res = await fetch(`/api/processing-status?id=${parentId}&type=${mode === "session" ? "session" : "sop"}`);
              const data = await res.json();
              const total = data.chunksTotal ?? chunksTotal;
              const done = data.chunksDone ?? 0;
              const pct = total > 0
                ? 82 + Math.floor((done / Math.max(total, 1)) * 16)
                : 82;
              setUpload((u) => u ? {
                ...u,
                progress: Math.min(pct, 98),
                status: data.status === "ready"
                  ? "Done!"
                  : total > 0
                    ? `Processing chunk ${done}/${total}...`
                    : "Processing video...",
              } : u);
              if (data.status === "ready") return;
              if (data.status === "failed") throw new Error("Processing failed");
            } catch (e: any) {
              if (e?.message === "Processing failed") throw e;
            }
          }
        };

        await poll();
        setUpload(null);
        addToast(mode === "session" ? "Session ready!" : "SOP ready!", { type: "success", action: { label: "View", href } });
        router.push(href);
        router.refresh();
      } catch (e: any) {
        if (ac.signal.aborted) {
          setUpload(null);
          return;
        }
        setUpload((u) => u ? { ...u, active: false, error: e?.message ?? String(e) } : u);
        addToast(`Processing failed: ${e?.message ?? "unknown error"}`, { type: "error" });
      }
    })();
  }, [upload?.active, router, addToast]);

  return <Ctx.Provider value={{ upload, startUpload, cancelUpload }}>{children}</Ctx.Provider>;
}
