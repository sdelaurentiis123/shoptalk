import { splitVideo, type VideoChunk } from "./ffmpeg";
import { processWithGemini, SOP_PROMPT, type GeminiOpts } from "./gemini";
import { sessionTranscriptPrompt, buildChunkContext } from "./session-prompts";
import type { GeminiOut } from "./types";

export interface TranscriptBeat {
  timeSeconds: number;
  text: string;
}

export interface ProcessedVideo {
  mode: "sop" | "session";
  totalSeconds: number;
  chunks: ChunkResult[];
  result: GeminiOut | TranscriptBeat[];
}

export interface ChunkResult {
  index: number;
  startSec: number;
  durationSec: number;
  raw: any;
}

function log(stage: string, extra?: unknown) {
  console.log(`[video-processing] ${stage}`, extra ?? "");
}

export async function processVideo(
  buf: Buffer,
  mimeType: string,
  fileName: string,
  mode: "sop" | "session",
  callbacks?: {
    onChunkDone?: (index: number, total: number, transcript: any) => Promise<void>;
    getChunkContext?: (parentId: string, chunkIndex: number) => Promise<string | null>;
  },
): Promise<ProcessedVideo> {
  log("start", { mode, sizeMB: +(buf.length / 1024 / 1024).toFixed(2) });

  const isVideo = mimeType.startsWith("video/");
  if (!isVideo) {
    log("non-video, processing directly");
    const result = await processWithGemini(buf, mimeType, fileName);
    return { mode, totalSeconds: 0, chunks: [], result };
  }

  const chunks = await splitVideo(buf, mimeType);
  const totalSeconds = chunks.reduce((s, c) => Math.max(s, c.startSec + c.durationSec), 0);
  log("chunks", { count: chunks.length, totalSeconds });

  const chunkResults: ChunkResult[] = [];
  let prevTranscript: TranscriptBeat[] = [];

  for (const chunk of chunks) {
    log(`chunk:${chunk.index}:start`, { startSec: chunk.startSec });

    const opts: GeminiOpts = {};

    if (mode === "sop") {
      opts.prompt = SOP_PROMPT;
      opts.thinkingLevel = "high";
      opts.timeoutMs = 600_000;
    } else {
      opts.prompt = sessionTranscriptPrompt(
        chunk.index,
        chunks.length,
        chunk.startSec,
        chunk.durationSec,
      );
      opts.thinkingLevel = "high";
      opts.timeoutMs = 600_000;
    }

    if (chunk.index > 0) {
      if (callbacks?.getChunkContext) {
        const ctx = await callbacks.getChunkContext("", chunk.index);
        if (ctx) opts.prevContext = ctx;
      } else if (prevTranscript.length > 0) {
        opts.prevContext = buildChunkContext(
          prevTranscript,
          chunk.startSec,
        );
      }
    }

    const raw = await processWithGemini(chunk.buf, mimeType, fileName, opts);
    log(`chunk:${chunk.index}:done`);

    chunkResults.push({
      index: chunk.index,
      startSec: chunk.startSec,
      durationSec: chunk.durationSec,
      raw,
    });

    if (mode === "session") {
      prevTranscript = Array.isArray(raw) ? raw : [];
    }

    if (callbacks?.onChunkDone) {
      await callbacks.onChunkDone(chunk.index, chunks.length, raw);
    }
  }

  const result = mode === "sop"
    ? stitchSopChunks(chunkResults, totalSeconds)
    : sanitizeSessionBeats(stitchSessionChunks(chunkResults), totalSeconds);

  log("done", { mode, totalSeconds });
  return { mode, totalSeconds, chunks: chunkResults, result };
}

function stitchSopChunks(chunks: ChunkResult[], totalSeconds: number): GeminiOut {
  if (chunks.length === 1) return chunks[0].raw as GeminiOut;

  const first = chunks[0].raw as GeminiOut;
  const allSteps = chunks.flatMap((c) => {
    const gemini = c.raw as GeminiOut;
    return (gemini.steps ?? []).map((s) => ({
      ...s,
      startSeconds: (s.startSeconds ?? 0) + (chunks.length > 1 && c.index > 0 ? c.startSec : 0),
      endSeconds: (s.endSeconds ?? 0) + (chunks.length > 1 && c.index > 0 ? c.startSec : 0),
      substeps: (s.substeps ?? []).map((ss) => ({
        ...ss,
        timeSeconds: (ss.timeSeconds ?? 0) + (chunks.length > 1 && c.index > 0 ? c.startSec : 0),
      })),
    }));
  });

  const allTranscripts = chunks.map((c) => (c.raw as GeminiOut).transcript ?? "").filter(Boolean);

  return {
    ...first,
    totalSeconds,
    steps: allSteps,
    transcript: allTranscripts.join("\n"),
    transcript_es: chunks.map((c) => (c.raw as GeminiOut).transcript_es ?? "").filter(Boolean).join("\n"),
  };
}

function sanitizeSessionBeats(beats: TranscriptBeat[], totalSeconds: number): TranscriptBeat[] {
  const max = totalSeconds > 0 ? totalSeconds : 24 * 60 * 60;
  return beats
    .filter((b) => typeof b.timeSeconds === "number" && Number.isFinite(b.timeSeconds))
    .map((b) => ({
      ...b,
      timeSeconds: Math.max(0, Math.min(max, Math.round(b.timeSeconds))),
    }))
    .sort((a, b) => a.timeSeconds - b.timeSeconds);
}

function stitchSessionChunks(chunks: ChunkResult[]): TranscriptBeat[] {
  const beats: TranscriptBeat[] = [];
  for (const c of chunks) {
    const arr = Array.isArray(c.raw) ? c.raw : [];
    for (const beat of arr) {
      beats.push({
        timeSeconds: typeof beat.timeSeconds === "number" ? beat.timeSeconds : 0,
        text: typeof beat.text === "string" ? beat.text : String(beat.text ?? ""),
      });
    }
  }
  beats.sort((a, b) => a.timeSeconds - b.timeSeconds);
  return beats;
}
