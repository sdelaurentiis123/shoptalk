import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { GeminiOut } from "./types.js";

let _admin: SupabaseClient | null = null;

export function admin(): SupabaseClient {
  if (_admin) return _admin;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key)
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
  _admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _admin;
}

export interface ChunkRow {
  id: string;
  parentType: "sop" | "session";
  parentId: string;
  chunkIndex: number;
  startSec: number;
  durationSec: number;
  filePath: string;
}

export async function insertChunks(
  parentType: "sop" | "session",
  parentId: string,
  chunks: { index: number; startSec: number; durationSec: number; r2Path: string }[],
): Promise<ChunkRow[]> {
  const rows = chunks.map((c) => ({
    parent_type: parentType,
    parent_id: parentId,
    chunk_index: c.index,
    start_sec: c.startSec,
    duration_sec: c.durationSec,
    file_path: c.r2Path,
    status: "pending",
  }));

  const { data, error } = await admin()
    .from("processing_chunks")
    .insert(rows)
    .select("id, parent_type, parent_id, chunk_index, start_sec, duration_sec, file_path");

  if (error) throw new Error(`insertChunks: ${error.message}`);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    parentType: r.parent_type,
    parentId: r.parent_id,
    chunkIndex: r.chunk_index,
    startSec: r.start_sec,
    durationSec: r.duration_sec,
    filePath: r.file_path,
  }));
}

export async function updateChunkDone(
  chunkId: string,
  transcript: any,
): Promise<void> {
  const { error } = await admin()
    .from("processing_chunks")
    .update({ transcript, status: "done" })
    .eq("id", chunkId);
  if (error) throw new Error(`updateChunkDone: ${error.message}`);
}

export async function updateChunkFailed(
  chunkId: string,
  errorMsg: string,
): Promise<void> {
  const { error } = await admin()
    .from("processing_chunks")
    .update({ status: "failed", error: errorMsg })
    .eq("id", chunkId);
  if (error) console.error(`updateChunkFailed DB error: ${error.message}`);
}

export async function finalizeSop(
  sopId: string,
  gemini: GeminiOut,
  totalSeconds: number,
): Promise<void> {
  const db = admin();

  const { data: sop } = await db
    .from("sops")
    .select("id, type, file_path")
    .eq("id", sopId)
    .maybeSingle();
  if (!sop) throw new Error(`finalizeSop: sop ${sopId} not found`);

  const { data: existingSteps } = await db
    .from("steps")
    .select("id")
    .eq("sop_id", sopId)
    .limit(1);
  if (existingSteps && existingSteps.length > 0) return;

  await db
    .from("sops")
    .update({
      title:
        gemini.title ||
        sop.file_path?.replace(/.*\//, "").replace(/\.[^.]+$/, "") ||
        "SOP",
      title_es: gemini.title_es ?? "",
      description: gemini.description || "",
      description_es: gemini.description_es ?? "",
      total_seconds: sop.type === "video" ? totalSeconds : 0,
      transcript: gemini.transcript ?? "",
      transcript_es: gemini.transcript_es ?? "",
    })
    .eq("id", sopId);

  for (let i = 0; i < (gemini.steps ?? []).length; i++) {
    const s = gemini.steps[i];
    const { data: step } = await db
      .from("steps")
      .insert({
        sop_id: sopId,
        sort_order: i,
        title: s.title,
        title_es: s.title_es ?? "",
        description: s.description || "",
        description_es: s.description_es ?? "",
        start_sec: sop.type === "video" ? (s.startSeconds ?? null) : null,
        end_sec: sop.type === "video" ? (s.endSeconds ?? null) : null,
      })
      .select()
      .single();
    if (!step) continue;
    const subs = (s.substeps ?? []).map((ss, j) => ({
      step_id: step.id,
      sort_order: j,
      text: ss.text,
      text_es: ss.text_es ?? "",
      time_sec: sop.type === "video" ? (ss.timeSeconds ?? null) : null,
    }));
    if (subs.length) await db.from("substeps").insert(subs);
  }
}

export async function markTranslationPending(sopId: string): Promise<void> {
  const db = admin();
  const { data: sop } = await db
    .from("sops")
    .select("id, title, description, transcript")
    .eq("id", sopId)
    .maybeSingle();
  if (!sop) return;

  const { createHash } = await import("crypto");
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        title: sop.title,
        description: sop.description,
        transcript: sop.transcript,
      }),
    )
    .digest("hex");

  await db
    .from("sops")
    .update({
      translation_status: "pending",
      english_hash: hash,
    })
    .eq("id", sopId);
}

export async function finalizeSession(
  sessionId: string,
  beats: { timeSeconds: number; text: string }[],
  notes: any,
  totalSeconds: number,
): Promise<void> {
  const db = admin();

  await db
    .from("work_sessions")
    .update({
      title: notes.title || "Work Session",
      summary: notes.summary || "",
      total_seconds: totalSeconds,
      raw_transcript: beats,
      notes,
      processing_status: "ready",
      processing_error: null,
    })
    .eq("id", sessionId);

  if (notes.topics?.length) {
    await db.from("session_topics").insert(
      notes.topics.map((t: any, i: number) => ({
        session_id: sessionId,
        sort_order: i,
        title: t.title,
        description: t.description || "",
        start_sec: t.startSeconds ?? null,
        end_sec: t.endSeconds ?? null,
      })),
    );
  }

  if (notes.keyPoints?.length) {
    await db.from("session_key_points").insert(
      notes.keyPoints.map((k: any, i: number) => ({
        session_id: sessionId,
        sort_order: i,
        text: k.text,
        type: ["technique", "safety", "quality", "tool", "other"].includes(
          k.type,
        )
          ? k.type
          : "other",
        time_sec: k.timeSeconds ?? null,
      })),
    );
  }
}

export async function setSessionStatus(
  sessionId: string,
  status: string,
  error?: string,
): Promise<void> {
  const update: any = { processing_status: status };
  if (error) update.processing_error = error;
  await admin().from("work_sessions").update(update).eq("id", sessionId);
}

export async function setSopError(
  sopId: string,
  error: string,
): Promise<void> {
  console.error(`[db] SOP ${sopId} failed: ${error}`);
}
