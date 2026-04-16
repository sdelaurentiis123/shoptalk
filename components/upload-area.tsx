"use client";

import { useRef } from "react";
import type { LangCode } from "@/lib/types";
import { t } from "@/lib/i18n";
import { useUpload } from "./providers/upload-provider";

export default function UploadArea({
  facilityId,
  stationId,
  lang,
  mode = "sop",
}: {
  facilityId: string;
  stationId?: string | null;
  lang: LangCode;
  mode?: "sop" | "session";
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { upload, startUpload, cancelUpload } = useUpload();

  const active = upload?.active && upload.mode === mode;
  const failed = upload && !upload.active && upload.error && upload.mode === mode;

  function handleFile(maybeFile: File | undefined) {
    if (!maybeFile) return;
    const file = maybeFile;
    const isVideo = file.type.startsWith("video/");
    const isPdf = file.type === "application/pdf";
    const isImg = file.type.startsWith("image/");
    if (mode === "session" && !isVideo) return;
    if (!isVideo && !isPdf && !isImg) return;
    startUpload(file, { mode, facilityId, stationId });
  }

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
      className={`bg-surface rounded-xl shadow-card border border-border mb-8 transition-all ${
        active ? "py-5 px-9" : "py-7 px-9"
      }`}
    >
      <input
        ref={fileRef}
        type="file"
        accept={mode === "session" ? "video/*" : "video/*,.pdf,image/*"}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {active && upload ? (
        <div className="flex items-center gap-4">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <div className="flex-1">
            <div className="text-[14px] font-medium">{upload.status}</div>
            <div className="text-[12px] text-text-tertiary mt-0.5 tabular-nums">
              {upload.progress}%{upload.speed ? ` · ${upload.speed}` : ""} · {t(lang, "uploadTakesTime")}
            </div>
            <div className="h-1 bg-background rounded-full mt-2 overflow-hidden">
              <div className="h-full bg-primary transition-all duration-500" style={{ width: `${Math.max(upload.progress, 4)}%` }} />
            </div>
          </div>
          <button onClick={cancelUpload} className="text-[12px] text-text-tertiary hover:text-danger">
            {t(lang, "cancel")}
          </button>
        </div>
      ) : (
        <div className="flex justify-between items-center">
          <div>
            <div className="text-[15px] font-semibold">{t(lang, mode === "session" ? "uploadSessions" : "upload")}</div>
            <div className="text-[13px] text-text-secondary mt-[3px]">{t(lang, mode === "session" ? "uploadSessionsHint" : "uploadHint")}</div>
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={!!upload?.active}
            className="bg-primary text-white rounded-full px-[22px] py-[9px] font-medium text-[13px] disabled:opacity-50"
          >
            {t(lang, "chooseFiles")}
          </button>
        </div>
      )}
      {failed && upload?.error && (
        <div className="mt-3 px-[14px] py-[10px] bg-danger-bg rounded-lg text-[13px] text-danger">{upload.error}</div>
      )}
    </div>
  );
}
