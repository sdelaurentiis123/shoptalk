import { tmpdir } from "os";
import { join } from "path";
import { mkdir, readFile, rm } from "fs/promises";
import { downloadToFile, putObject } from "./storage.js";
import { getVideoDuration, splitVideo, CHUNK_DURATION_SEC } from "./split.js";
import { processWithGemini, SOP_PROMPT } from "./gemini.js";
import {
  insertChunks,
  updateChunkDone,
  updateChunkFailed,
  finalizeSop,
  markTranslationPending,
} from "./db.js";
import type { GeminiOut } from "./types.js";

const BATCH_SIZE = 5;

function log(stage: string, extra?: unknown) {
  console.log(`[process-sop] ${stage}`, extra ?? "");
}

export async function processSop(params: {
  storageKey: string;
  fileType: string;
  fileName: string;
  facilityId: string;
  sopId: string;
}): Promise<void> {
  const { storageKey, fileType, fileName, facilityId, sopId } = params;
  const workDir = join(tmpdir(), `sop-${sopId}`);
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

    if (duration <= CHUNK_DURATION_SEC) {
      log("single-chunk");
      const chunkRows = await insertChunks("sop", sopId, [
        { index: 0, startSec: 0, durationSec: duration || 1, r2Path: storageKey },
      ]);

      const buf = await readFile(localVideo);
      const result = await processWithGemini(buf, mimeType, `chunk_0`, {
        prompt: SOP_PROMPT,
        thinkingLevel: "high",
        timeoutMs: 240_000,
        maxDurationSec: duration,
      });
      await updateChunkDone(chunkRows[0].id, result);

      await finalizeSop(sopId, result, duration);
      await markTranslationPending(sopId);
      log("done", { sopId });
      return;
    }

    const outputDir = join(workDir, "chunks");
    await mkdir(outputDir, { recursive: true });
    const chunks = await splitVideo(localVideo, outputDir);
    log("split", { count: chunks.length });

    const chunkR2Paths = chunks.map(
      (c) => `${facilityId}/chunks/${sopId}_${c.index}.mp4`,
    );
    for (let i = 0; i < chunks.length; i++) {
      const buf = await readFile(chunks[i].path);
      await putObject(chunkR2Paths[i], buf, fileType);
      log("uploaded-chunk", { index: i, sizeMB: +(buf.length / 1024 / 1024).toFixed(2) });
    }

    const chunkRows = await insertChunks(
      "sop",
      sopId,
      chunks.map((c, i) => ({
        index: c.index,
        startSec: c.startSec,
        durationSec: c.durationSec,
        r2Path: chunkR2Paths[i],
      })),
    );
    log("chunks-inserted", { count: chunkRows.length });

    for (let i = 0; i < chunkRows.length; i += BATCH_SIZE) {
      const batch = chunkRows.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (row) => {
          const chunk = chunks[row.chunkIndex];
          try {
            const buf = await readFile(chunk.path);
            const result = await processWithGemini(
              buf,
              mimeType,
              `chunk_${row.chunkIndex}`,
              {
                prompt: SOP_PROMPT,
                thinkingLevel: "high",
                timeoutMs: 240_000,
                maxDurationSec: chunk.durationSec,
              },
            );
            await updateChunkDone(row.id, result);
            log("chunk-done", { index: row.chunkIndex });
          } catch (e: any) {
            log("chunk-failed", { index: row.chunkIndex, error: e?.message });
            await updateChunkFailed(row.id, e?.message ?? String(e));
            throw e;
          }
        }),
      );
      log("batch-done", { from: i, to: Math.min(i + BATCH_SIZE, chunkRows.length) });
    }

    const allResults = await Promise.all(
      chunkRows.map(async (row) => {
        const { data } = await (await import("./db.js"))
          .admin()
          .from("processing_chunks")
          .select("chunk_index, start_sec, transcript")
          .eq("id", row.id)
          .single();
        return data;
      }),
    );

    const firstChunk = allResults[0]!.transcript as GeminiOut;
    const allSteps = allResults
      .sort((a: any, b: any) => a.chunk_index - b.chunk_index)
      .flatMap((c: any) => {
        const gemini = c.transcript as GeminiOut;
        return (gemini?.steps ?? []).map((s: any) => ({
          ...s,
          startSeconds:
            (s.startSeconds ?? 0) + (c.chunk_index > 0 ? c.start_sec : 0),
          endSeconds:
            (s.endSeconds ?? 0) + (c.chunk_index > 0 ? c.start_sec : 0),
          substeps: (s.substeps ?? []).map((ss: any) => ({
            ...ss,
            timeSeconds:
              (ss.timeSeconds ?? 0) + (c.chunk_index > 0 ? c.start_sec : 0),
          })),
        }));
      });

    const totalSeconds = chunks.reduce(
      (s, c) => Math.max(s, c.startSec + c.durationSec),
      0,
    );
    const allTranscripts = allResults
      .sort((a: any, b: any) => a.chunk_index - b.chunk_index)
      .map((c: any) => (c.transcript as GeminiOut)?.transcript ?? "")
      .filter(Boolean);
    const allTranscriptsEs = allResults
      .sort((a: any, b: any) => a.chunk_index - b.chunk_index)
      .map((c: any) => (c.transcript as GeminiOut)?.transcript_es ?? "")
      .filter(Boolean);

    const stitched: GeminiOut = {
      ...firstChunk,
      totalSeconds,
      steps: allSteps,
      transcript: allTranscripts.join("\n"),
      transcript_es: allTranscriptsEs.join("\n"),
    };

    await finalizeSop(sopId, stitched, totalSeconds);
    await markTranslationPending(sopId);
    log("done", { sopId, steps: allSteps.length });
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
