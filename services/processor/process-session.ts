import { tmpdir } from "os";
import { join } from "path";
import { mkdir, readFile, rm } from "fs/promises";
import { downloadToFile, putObject } from "./storage.js";
import { getVideoDuration, splitVideo, CHUNK_DURATION_SEC } from "./split.js";
import { processWithGemini } from "./gemini.js";
import { sessionTranscriptPrompt, SESSION_NOTES_PROMPT } from "./prompts.js";
import {
  insertChunks,
  updateChunkDone,
  updateChunkFailed,
  finalizeSession,
  setSessionStatus,
} from "./db.js";
import type { TranscriptBeat } from "./types.js";
import Anthropic from "@anthropic-ai/sdk";

const BATCH_SIZE = 5;

function log(stage: string, extra?: unknown) {
  console.log(`[process-session] ${stage}`, extra ?? "");
}

export async function processSession(params: {
  storageKey: string;
  fileType: string;
  fileName: string;
  facilityId: string;
  sessionId: string;
}): Promise<void> {
  const { storageKey, fileType, fileName, facilityId, sessionId } = params;
  const workDir = join(tmpdir(), `session-${sessionId}`);
  await mkdir(workDir, { recursive: true });

  try {
    const ext = fileType.includes("quicktime") ? "mov" : "mp4";
    const localVideo = join(workDir, `input.${ext}`);

    log("download", { storageKey });
    await downloadToFile(storageKey, localVideo);

    const duration = await getVideoDuration(localVideo);
    log("duration", { seconds: duration });

    const mimeType = fileType.includes("quicktime")
      ? "video/quicktime"
      : "video/mp4";

    let chunks: { index: number; startSec: number; durationSec: number; path: string }[];
    let chunkR2Paths: string[];

    if (duration <= CHUNK_DURATION_SEC) {
      chunks = [
        { index: 0, startSec: 0, durationSec: duration || 1, path: localVideo },
      ];
      chunkR2Paths = [storageKey];

      await insertChunks("session", sessionId, [
        { index: 0, startSec: 0, durationSec: duration || 1, r2Path: storageKey },
      ]);
    } else {
      const outputDir = join(workDir, "chunks");
      await mkdir(outputDir, { recursive: true });
      chunks = await splitVideo(localVideo, outputDir);
      log("split", { count: chunks.length });

      chunkR2Paths = chunks.map(
        (c) => `${facilityId}/chunks/${sessionId}_${c.index}.mp4`,
      );
      for (let i = 0; i < chunks.length; i++) {
        const buf = await readFile(chunks[i].path);
        await putObject(chunkR2Paths[i], buf, fileType);
        log("uploaded-chunk", { index: i, sizeMB: +(buf.length / 1024 / 1024).toFixed(2) });
      }

      await insertChunks(
        "session",
        sessionId,
        chunks.map((c, i) => ({
          index: c.index,
          startSec: c.startSec,
          durationSec: c.durationSec,
          r2Path: chunkR2Paths[i],
        })),
      );
    }
    log("chunks-inserted", { count: chunks.length });

    const { data: chunkRows } = await (await import("./db.js"))
      .admin()
      .from("processing_chunks")
      .select("id, chunk_index, start_sec, duration_sec")
      .eq("parent_id", sessionId)
      .order("chunk_index");

    if (!chunkRows || chunkRows.length === 0) {
      throw new Error("No chunk rows found after insert");
    }

    const totalChunks = chunkRows.length;

    for (let i = 0; i < chunkRows.length; i += BATCH_SIZE) {
      const batch = chunkRows.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (row: any) => {
          const chunk = chunks[row.chunk_index];
          const prompt = sessionTranscriptPrompt(
            row.chunk_index,
            totalChunks,
            row.start_sec,
            row.duration_sec,
          );
          try {
            const buf = await readFile(chunk.path);
            const result = await processWithGemini(
              buf,
              mimeType,
              `chunk_${row.chunk_index}`,
              {
                prompt,
                thinkingLevel: "high",
                timeoutMs: 240_000,
                maxDurationSec: row.duration_sec,
              },
            );
            await updateChunkDone(row.id, result);
            log("chunk-done", { index: row.chunk_index });
          } catch (e: any) {
            log("chunk-failed", { index: row.chunk_index, error: e?.message });
            await updateChunkFailed(row.id, e?.message ?? String(e));
            throw e;
          }
        }),
      );
      log("batch-done", { from: i, to: Math.min(i + BATCH_SIZE, chunkRows.length) });
    }

    const { data: doneChunks } = await (await import("./db.js"))
      .admin()
      .from("processing_chunks")
      .select("chunk_index, start_sec, duration_sec, transcript")
      .eq("parent_id", sessionId)
      .order("chunk_index");

    const beats: TranscriptBeat[] = [];
    for (const c of doneChunks ?? []) {
      const arr = Array.isArray(c.transcript) ? c.transcript : [];
      for (const b of arr) {
        if (typeof b.timeSeconds === "number" && typeof b.text === "string") {
          beats.push(b);
        }
      }
    }
    beats.sort((a, b) => a.timeSeconds - b.timeSeconds);

    const totalSeconds = chunks.reduce(
      (s, c) => Math.max(s, c.startSec + c.durationSec),
      0,
    );
    log("beats-stitched", { count: beats.length, totalSeconds });

    await setSessionStatus(sessionId, "summarizing");

    const transcriptText = beats
      .map((b) => `[${b.timeSeconds}s] ${b.text}`)
      .join("\n");
    const totalMinutes = Math.round(totalSeconds / 60);

    log("claude:start");
    const anthropic = new Anthropic();
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [
        {
          role: "user",
          content: `Transcript of a ${totalMinutes}-minute work session:\n\n${transcriptText}\n\n${SESSION_NOTES_PROMPT}`,
        },
      ],
    });
    const text =
      msg.content.find((c) => c.type === "text")?.text ?? "";
    const notes = JSON.parse(
      text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim(),
    );
    log("claude:done", {
      title: notes.title,
      topics: notes.topics?.length,
      keyPoints: notes.keyPoints?.length,
    });

    await finalizeSession(sessionId, beats, notes, totalSeconds);
    log("done", { sessionId });
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
