import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/auth";
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
  console.log(`[process-stale] ${stage}`, extra ?? "");
}

export async function POST(req: Request) {
  const { role, isPlatformAdmin } = await getAuthContext();
  if (role !== "admin" && !isPlatformAdmin)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parentId = (body as any)?.parentId as string | undefined;

  const admin = createAdminClient();
  let processed = 0;
  const deadline = Date.now() + 250_000;

  while (Date.now() < deadline) {
    const staleTs = new Date(Date.now() - STALE_CLAIM_MS).toISOString();

    let q = admin
      .from("processing_chunks")
      .select("*")
      .or(`status.eq.pending,and(status.eq.processing,created_at.lt.${staleTs})`)
      .order("created_at", { ascending: true })
      .limit(10);
    if (parentId) q = q.eq("parent_id", parentId);

    const { data: candidates } = await q;

    log("loop_iter", {
      candidateCount: candidates?.length ?? 0,
      candidates: candidates?.map((c) => ({ index: c.chunk_index, status: c.status, id: (c.id as string).slice(0, 8) })),
    });

    if (!candidates || candidates.length === 0) break;

    // Find one where all prior chunks are done.
    let chunk: any = null;
    for (const c of candidates) {
      if ((c.chunk_index as number) === 0) {
        chunk = c;
        break;
      }
      // Check all prior chunks for this parent are done.
      const { data: priors } = await admin
        .from("processing_chunks")
        .select("status")
        .eq("parent_id", c.parent_id)
        .lt("chunk_index", c.chunk_index);
      const allDone = priors?.every((p) => p.status === "done") ?? false;
      if (allDone) {
        chunk = c;
        break;
      }
    }

    if (!chunk) {
      log("no_eligible_chunk", { candidates: candidates.map((c) => ({ index: c.chunk_index, status: c.status })) });
      break;
    }

    // Claim: atomic update from pending → processing.
    const { data: claimed } = await admin
      .from("processing_chunks")
      .update({ status: "processing", created_at: new Date().toISOString() })
      .eq("id", chunk.id)
      .in("status", ["pending", "processing"])
      .select("id")
      .maybeSingle();

    if (!claimed) {
      log("claim_failed", { index: chunk.chunk_index });
      continue;
    } // Someone else claimed it.

    log("chunk", { parentType: chunk.parent_type, parentId: chunk.parent_id, index: chunk.chunk_index });

    try {
      const buf = await getObjectBuffer(chunk.file_path as string);

      // Get all chunks for this parent (for T-1 context + finalization check).
      const { data: allChunks } = await admin
        .from("processing_chunks")
        .select("chunk_index, start_sec, duration_sec, transcript, status, parent_type")
        .eq("parent_id", chunk.parent_id)
        .order("chunk_index");
      const totalChunks = allChunks?.length ?? 1;

      // Build T-1 context.
      let prevContext: string | undefined;
      if ((chunk.chunk_index as number) > 0) {
        const prev = allChunks?.find((c) => c.chunk_index === (chunk.chunk_index as number) - 1);
        if (prev?.transcript && prev.status === "done") {
          const beats = Array.isArray(prev.transcript) ? prev.transcript : [];
          if (beats.length > 0) {
            prevContext = buildChunkContext(
              beats as { timeSeconds: number; text: string }[],
              (prev.start_sec as number) + (prev.duration_sec as number),
            );
          }
        }
      }

      const parentType = chunk.parent_type as "sop" | "session";
      const prompt = parentType === "sop"
        ? SOP_PROMPT
        : sessionTranscriptPrompt(chunk.chunk_index as number, totalChunks, chunk.start_sec as number, chunk.duration_sec as number);

      const mimeType = (chunk.file_path as string).endsWith(".mov") ? "video/quicktime" : "video/mp4";
      const result = await processWithGemini(buf, mimeType, `chunk_${chunk.chunk_index}`, {
        prompt, thinkingLevel: "high", prevContext, timeoutMs: 240_000,
      });

      await admin.from("processing_chunks")
        .update({ transcript: result, status: "done" })
        .eq("id", chunk.id);
      processed++;
      log("chunk_done", { index: chunk.chunk_index, parentId: chunk.parent_id });
    } catch (e: any) {
      log("chunk_failed", { error: e?.message });
      await admin.from("processing_chunks")
        .update({ status: "failed", error: e?.message })
        .eq("id", chunk.id);
    }
  }

  // After processing all available chunks, check if any parent is fully done and needs finalization.
  if (parentId) {
    const { data: allChunks } = await admin
      .from("processing_chunks")
      .select("chunk_index, start_sec, duration_sec, transcript, status, parent_type")
      .eq("parent_id", parentId)
      .order("chunk_index");

    if (allChunks && allChunks.length > 0) {
      const allDone = allChunks.every((c) => c.status === "done");
      log("finalize_check", { parentId, total: allChunks.length, done: allChunks.filter((c) => c.status === "done").length, allDone });
      if (allDone) {
        const parentType = allChunks[0].parent_type as "sop" | "session";
        if (parentType === "session") {
          await finalizeSession(admin, parentId, allChunks);
        } else {
          await finalizeSop(admin, parentId, allChunks);
        }
      }
    }
  }

  return NextResponse.json({ ok: true, processed });
}

async function finalizeSession(admin: any, sessionId: string, chunks: any[]) {
  const { data: session } = await admin.from("work_sessions").select("processing_status").eq("id", sessionId).maybeSingle();
  if (!session || session.processing_status === "ready") return;

  log("finalize_session", sessionId);
  await admin.from("work_sessions").update({ processing_status: "summarizing" }).eq("id", sessionId);

  const beats: { timeSeconds: number; text: string }[] = [];
  for (const c of chunks) {
    const arr = Array.isArray(c.transcript) ? c.transcript : [];
    for (const b of arr) if (typeof b.timeSeconds === "number") beats.push(b);
  }
  beats.sort((a, b) => a.timeSeconds - b.timeSeconds);
  const totalSeconds = chunks.reduce((s: number, c: any) => Math.max(s, (c.start_sec ?? 0) + (c.duration_sec ?? 0)), 0);

  const transcriptText = beats.map((b) => `[${b.timeSeconds}s] ${b.text}`).join("\n");
  const anthropic = new Anthropic();
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    messages: [{ role: "user", content: `Transcript of a ${Math.round(totalSeconds / 60)}-minute work session:\n\n${transcriptText}\n\n${SESSION_NOTES_PROMPT}` }],
  });
  const text = msg.content.find((c) => c.type === "text")?.text ?? "";
  const notes = JSON.parse(text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());

  await admin.from("work_sessions").update({
    title: notes.title || "Work Session", summary: notes.summary || "",
    total_seconds: totalSeconds, raw_transcript: beats, notes,
    processing_status: "ready", processing_error: null,
  }).eq("id", sessionId);

  if (notes.topics?.length) {
    await admin.from("session_topics").insert(notes.topics.map((t: any, i: number) => ({
      session_id: sessionId, sort_order: i, title: t.title, description: t.description || "",
      start_sec: t.startSeconds ?? null, end_sec: t.endSeconds ?? null,
    })));
  }
  if (notes.keyPoints?.length) {
    await admin.from("session_key_points").insert(notes.keyPoints.map((k: any, i: number) => ({
      session_id: sessionId, sort_order: i, text: k.text,
      type: ["technique", "safety", "quality", "tool", "other"].includes(k.type) ? k.type : "other",
      time_sec: k.timeSeconds ?? null,
    })));
  }
  log("session_ready", sessionId);
}

async function finalizeSop(admin: any, sopId: string, chunks: any[]) {
  const { data: existingSteps } = await admin.from("steps").select("id").eq("sop_id", sopId).limit(1);
  if (existingSteps && existingSteps.length > 0) return;

  log("finalize_sop", sopId);
  const { data: sop } = await admin.from("sops").select("id, facility_id, type, file_path").eq("id", sopId).maybeSingle();
  if (!sop) return;

  const firstChunk = chunks[0].transcript as GeminiOut;
  const allSteps = chunks.flatMap((c: any) => {
    const g = c.transcript as GeminiOut;
    return (g?.steps ?? []).map((s: any) => ({
      ...s,
      startSeconds: (s.startSeconds ?? 0) + (c.chunk_index > 0 ? c.start_sec : 0),
      endSeconds: (s.endSeconds ?? 0) + (c.chunk_index > 0 ? c.start_sec : 0),
      substeps: (s.substeps ?? []).map((ss: any) => ({
        ...ss, timeSeconds: (ss.timeSeconds ?? 0) + (c.chunk_index > 0 ? c.start_sec : 0),
      })),
    }));
  });

  const totalSeconds = chunks.reduce((s: number, c: any) => Math.max(s, (c.start_sec ?? 0) + (c.duration_sec ?? 0)), 0);

  await admin.from("sops").update({
    title: firstChunk?.title || sop.file_path?.replace(/.*\//, "").replace(/\.[^.]+$/, "") || "SOP",
    title_es: firstChunk?.title_es ?? "", description: firstChunk?.description || "",
    description_es: firstChunk?.description_es ?? "",
    total_seconds: sop.type === "video" ? totalSeconds : 0,
    transcript: chunks.map((c: any) => (c.transcript as GeminiOut)?.transcript ?? "").filter(Boolean).join("\n"),
    transcript_es: chunks.map((c: any) => (c.transcript as GeminiOut)?.transcript_es ?? "").filter(Boolean).join("\n"),
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
