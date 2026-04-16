import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processWithGemini, SOP_PROMPT } from "@/lib/gemini";
import { sessionTranscriptPrompt, buildChunkContext, SESSION_NOTES_PROMPT } from "@/lib/session-prompts";
import { getObjectBuffer } from "@/lib/r2";
import { markTranslationPending } from "@/lib/translate";
import Anthropic from "@anthropic-ai/sdk";
import type { GeminiOut } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const STALE_CLAIM_MS = 5 * 60 * 1000;

function log(stage: string, extra?: unknown) {
  console.log(`[cron/process-videos] ${stage}`, extra ?? "");
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.get("authorization") ?? "";
    if (header !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const admin = createAdminClient();

  // Find a pending chunk to process (oldest first, skip stale claims).
  const { data: chunk } = await admin
    .from("processing_chunks")
    .select("*")
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!chunk) {
    // Check for sessions/SOPs that are in "processing"/"summarizing" but have all chunks done.
    await finalizeDoneParents(admin);
    return NextResponse.json({ ok: true, action: "idle" });
  }

  // Skip if another function is already processing this chunk (stale claim guard).
  if (
    chunk.status === "processing" &&
    chunk.created_at &&
    Date.now() - new Date(chunk.created_at).getTime() < STALE_CLAIM_MS
  ) {
    return NextResponse.json({ ok: true, action: "skipped_active_claim" });
  }

  log("processing", { parentType: chunk.parent_type, parentId: chunk.parent_id, chunkIndex: chunk.chunk_index });

  // Claim the chunk.
  await admin
    .from("processing_chunks")
    .update({ status: "processing", created_at: new Date().toISOString() })
    .eq("id", chunk.id);

  try {
    // Download the chunk from R2.
    const filePath = chunk.file_path as string;
    const buf = await getObjectBuffer(filePath);

    // Get total chunk count for this parent.
    const { data: allChunks } = await admin
      .from("processing_chunks")
      .select("chunk_index, start_sec, duration_sec, transcript, status")
      .eq("parent_id", chunk.parent_id)
      .order("chunk_index");
    const totalChunks = allChunks?.length ?? 1;

    // Build T-1 context if not the first chunk.
    let prevContext: string | undefined;
    if (chunk.chunk_index > 0) {
      const prevChunk = allChunks?.find((c) => c.chunk_index === chunk.chunk_index - 1);
      if (prevChunk?.transcript && prevChunk.status === "done") {
        const prevBeats = Array.isArray(prevChunk.transcript) ? prevChunk.transcript : [];
        if (prevBeats.length > 0) {
          prevContext = buildChunkContext(
            prevBeats as { timeSeconds: number; text: string }[],
            (prevChunk.start_sec as number) + (prevChunk.duration_sec as number),
          );
        }
      }
    }

    // Build prompt based on parent type.
    const parentType = chunk.parent_type as "sop" | "session";
    const startSec = chunk.start_sec as number;
    const durationSec = chunk.duration_sec as number;

    const prompt = parentType === "sop"
      ? SOP_PROMPT
      : sessionTranscriptPrompt(chunk.chunk_index as number, totalChunks, startSec, durationSec);

    const mimeType = filePath.endsWith(".mov") ? "video/quicktime" : "video/mp4";
    const result = await processWithGemini(buf, mimeType, `chunk_${chunk.chunk_index}`, {
      prompt,
      thinkingLevel: "high",
      prevContext,
      timeoutMs: 240_000,
    });

    // Save transcript to the chunk row.
    await admin
      .from("processing_chunks")
      .update({ transcript: result, status: "done" })
      .eq("id", chunk.id);

    log("chunk_done", { chunkIndex: chunk.chunk_index, parentId: chunk.parent_id });

    // Check if all chunks for this parent are done.
    await finalizeDoneParents(admin);

    return NextResponse.json({ ok: true, action: "processed_chunk", chunkIndex: chunk.chunk_index });
  } catch (e: any) {
    log("chunk_failed", { chunkIndex: chunk.chunk_index, error: e?.message });
    await admin
      .from("processing_chunks")
      .update({ status: "failed", error: e?.message ?? String(e) })
      .eq("id", chunk.id);
    return NextResponse.json({ ok: true, action: "chunk_failed" });
  }
}

async function finalizeDoneParents(admin: ReturnType<typeof createAdminClient>) {
  // Find parents where all chunks are done but parent isn't ready yet.
  const { data: parents } = await admin
    .from("processing_chunks")
    .select("parent_id, parent_type")
    .eq("status", "done");

  if (!parents || parents.length === 0) return;

  const parentIds = [...new Set(parents.map((p) => p.parent_id as string))];

  for (const parentId of parentIds) {
    const { data: chunks } = await admin
      .from("processing_chunks")
      .select("chunk_index, start_sec, duration_sec, transcript, status, parent_type")
      .eq("parent_id", parentId)
      .order("chunk_index");

    if (!chunks || chunks.length === 0) continue;
    if (chunks.some((c) => c.status !== "done")) continue;

    const parentType = chunks[0].parent_type as "sop" | "session";

    if (parentType === "session") {
      await finalizeSession(admin, parentId, chunks);
    } else {
      await finalizeSop(admin, parentId, chunks);
    }
  }
}

async function finalizeSession(
  admin: ReturnType<typeof createAdminClient>,
  sessionId: string,
  chunks: any[],
) {
  // Check if already finalized.
  const { data: session } = await admin
    .from("work_sessions")
    .select("processing_status")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || session.processing_status === "ready") return;

  log("finalize_session", sessionId);
  await admin.from("work_sessions").update({ processing_status: "summarizing" }).eq("id", sessionId);

  // Stitch transcript beats.
  const beats: { timeSeconds: number; text: string }[] = [];
  for (const c of chunks) {
    const arr = Array.isArray(c.transcript) ? c.transcript : [];
    for (const b of arr) {
      if (typeof b.timeSeconds === "number" && typeof b.text === "string") {
        beats.push(b);
      }
    }
  }
  beats.sort((a, b) => a.timeSeconds - b.timeSeconds);

  const totalSeconds = chunks.reduce((s: number, c: any) => Math.max(s, (c.start_sec ?? 0) + (c.duration_sec ?? 0)), 0);

  // Claude pass 2.
  const transcriptText = beats.map((b) => `[${b.timeSeconds}s] ${b.text}`).join("\n");
  const totalMinutes = Math.round(totalSeconds / 60);
  const anthropic = new Anthropic();
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    messages: [{ role: "user", content: `Transcript of a ${totalMinutes}-minute work session:\n\n${transcriptText}\n\n${SESSION_NOTES_PROMPT}` }],
  });
  const text = msg.content.find((c) => c.type === "text")?.text ?? "";
  const notes = JSON.parse(text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());

  await admin.from("work_sessions").update({
    title: notes.title || "Work Session",
    summary: notes.summary || "",
    total_seconds: totalSeconds,
    raw_transcript: beats,
    notes,
    processing_status: "ready",
    processing_error: null,
  }).eq("id", sessionId);

  if (notes.topics?.length) {
    await admin.from("session_topics").insert(
      notes.topics.map((t: any, i: number) => ({
        session_id: sessionId, sort_order: i, title: t.title,
        description: t.description || "", start_sec: t.startSeconds ?? null, end_sec: t.endSeconds ?? null,
      })),
    );
  }
  if (notes.keyPoints?.length) {
    await admin.from("session_key_points").insert(
      notes.keyPoints.map((k: any, i: number) => ({
        session_id: sessionId, sort_order: i, text: k.text,
        type: ["technique", "safety", "quality", "tool", "other"].includes(k.type) ? k.type : "other",
        time_sec: k.timeSeconds ?? null,
      })),
    );
  }

  log("session_ready", sessionId);
}

async function finalizeSop(
  admin: ReturnType<typeof createAdminClient>,
  sopId: string,
  chunks: any[],
) {
  const { data: sop } = await admin
    .from("sops")
    .select("id, facility_id, type, file_path")
    .eq("id", sopId)
    .maybeSingle();
  if (!sop) return;

  // Check if already has steps (already finalized).
  const { data: existingSteps } = await admin.from("steps").select("id").eq("sop_id", sopId).limit(1);
  if (existingSteps && existingSteps.length > 0) return;

  log("finalize_sop", sopId);

  // Stitch GeminiOut from chunks.
  const firstChunk = chunks[0].transcript as GeminiOut;
  const allSteps = chunks.flatMap((c: any) => {
    const gemini = c.transcript as GeminiOut;
    return (gemini?.steps ?? []).map((s: any) => ({
      ...s,
      startSeconds: (s.startSeconds ?? 0) + (c.chunk_index > 0 ? c.start_sec : 0),
      endSeconds: (s.endSeconds ?? 0) + (c.chunk_index > 0 ? c.start_sec : 0),
      substeps: (s.substeps ?? []).map((ss: any) => ({
        ...ss,
        timeSeconds: (ss.timeSeconds ?? 0) + (c.chunk_index > 0 ? c.start_sec : 0),
      })),
    }));
  });

  const totalSeconds = chunks.reduce((s: number, c: any) => Math.max(s, (c.start_sec ?? 0) + (c.duration_sec ?? 0)), 0);
  const allTranscripts = chunks.map((c: any) => (c.transcript as GeminiOut)?.transcript ?? "").filter(Boolean);
  const allTranscriptsEs = chunks.map((c: any) => (c.transcript as GeminiOut)?.transcript_es ?? "").filter(Boolean);

  const gemini: GeminiOut = {
    ...firstChunk,
    totalSeconds,
    steps: allSteps,
    transcript: allTranscripts.join("\n"),
    transcript_es: allTranscriptsEs.join("\n"),
  };

  await admin.from("sops").update({
    title: gemini.title || sop.file_path?.replace(/.*\//, "").replace(/\.[^.]+$/, "") || "SOP",
    title_es: gemini.title_es ?? "",
    description: gemini.description || "",
    description_es: gemini.description_es ?? "",
    total_seconds: sop.type === "video" ? totalSeconds : 0,
    transcript: gemini.transcript ?? "",
    transcript_es: gemini.transcript_es ?? "",
  }).eq("id", sopId);

  for (let i = 0; i < allSteps.length; i++) {
    const s = allSteps[i];
    const { data: step } = await admin.from("steps").insert({
      sop_id: sopId, sort_order: i, title: s.title, title_es: s.title_es ?? "",
      description: s.description || "", description_es: s.description_es ?? "",
      start_sec: sop.type === "video" ? s.startSeconds ?? null : null,
      end_sec: sop.type === "video" ? s.endSeconds ?? null : null,
    }).select().single();
    if (!step) continue;
    const subs = (s.substeps ?? []).map((ss: any, j: number) => ({
      step_id: step.id, sort_order: j, text: ss.text, text_es: ss.text_es ?? "",
      time_sec: sop.type === "video" ? ss.timeSeconds ?? null : null,
    }));
    if (subs.length) await admin.from("substeps").insert(subs);
  }

  await markTranslationPending(admin, sopId);
  log("sop_ready", sopId);
}
