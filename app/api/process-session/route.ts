import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/auth";
import { processVideo, type TranscriptBeat } from "@/lib/video-processing";
import { getObjectBuffer, presignGet } from "@/lib/r2";
import { SESSION_NOTES_PROMPT } from "@/lib/session-prompts";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 300;

function log(stage: string, extra?: unknown) {
  console.log(`[process-session] ${stage}`, extra ?? "");
}
function fail(stage: string, msg: string, status = 500) {
  console.error(`[process-session] FAIL ${stage}:`, msg);
  return NextResponse.json({ error: `${stage}: ${msg}` }, { status });
}

export async function POST(req: Request) {
  try {
    const { role, facilityId, user, isPlatformAdmin } = await getAuthContext();
    if (!user || (role !== "admin" && !isPlatformAdmin) || !facilityId)
      return fail("auth", "unauthorized", 401);

    const body = await req.json().catch(() => null);
    const storage_path = String(body?.storage_path ?? "").trim();
    const file_type = String(body?.file_type ?? "").trim();
    const file_name = String(body?.file_name ?? "file").trim();
    const station_id = (body?.station_id as string | null) || null;

    if (!storage_path || !file_type) return fail("input", "missing fields", 400);
    if (!storage_path.startsWith(`${facilityId}/`)) return fail("input", "path outside facility", 403);
    if (!file_type.startsWith("video/")) return fail("input", "sessions only support video", 400);

    log("received", { storage_path, file_type });
    const admin = createAdminClient();

    let buf: Buffer;
    try {
      buf = await getObjectBuffer(storage_path);
    } catch (e: any) {
      return fail("download", e?.message ?? "download failed");
    }
    log("downloaded", { sizeMB: +(buf.length / 1024 / 1024).toFixed(2) });

    let signed_url: string | null = null;
    try {
      signed_url = await presignGet(storage_path, 60 * 60 * 24 * 7);
    } catch (e) {
      console.warn("[process-session] presignGet failed:", e);
    }

    // Create the session row early so we can track progress.
    const { data: session, error: sErr } = await admin
      .from("work_sessions")
      .insert({
        facility_id: facilityId,
        station_id,
        title: file_name.replace(/\.[^.]+$/, ""),
        file_path: storage_path,
        file_url: signed_url,
        processing_status: "processing",
      })
      .select()
      .single();
    if (sErr || !session) return fail("session-insert", sErr?.message ?? "no row");
    log("session-created", session.id);

    // Pass 1: Gemini — raw transcript.
    let transcript: TranscriptBeat[];
    let totalSeconds: number;
    try {
      log("gemini:start");
      const processed = await processVideo(buf, file_type, file_name, "session", {
        onChunkDone: async (index, total, chunkTranscript) => {
          await admin.from("processing_chunks").upsert({
            parent_type: "session",
            parent_id: session.id,
            chunk_index: index,
            start_sec: index * 900,
            duration_sec: 900,
            transcript: chunkTranscript,
            status: "done",
          }, { onConflict: "parent_id,chunk_index" });
          await admin
            .from("work_sessions")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", session.id);
          log(`gemini:chunk:${index + 1}/${total}:saved`);
        },
      });
      transcript = processed.result as TranscriptBeat[];
      totalSeconds = processed.totalSeconds;
      log("gemini:done", { beats: transcript.length, totalSeconds });
    } catch (e: any) {
      await admin.from("work_sessions").update({ processing_status: "failed", processing_error: e?.message }).eq("id", session.id);
      return fail("gemini", e?.message ?? String(e));
    }

    // Pass 2: Claude — structured notes.
    await admin.from("work_sessions").update({ processing_status: "summarizing", raw_transcript: transcript, total_seconds: totalSeconds }).eq("id", session.id);

    let notes: any;
    try {
      log("claude:start");
      const totalMinutes = Math.round(totalSeconds / 60);
      const transcriptText = transcript.map((b) => `[${b.timeSeconds}s] ${b.text}`).join("\n");
      const anthropic = new Anthropic();
      const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        messages: [{
          role: "user",
          content: `Transcript of a ${totalMinutes}-minute work session:\n\n${transcriptText}\n\n${SESSION_NOTES_PROMPT}`,
        }],
      });
      const text = msg.content.find((c) => c.type === "text")?.text ?? "";
      notes = JSON.parse(text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
      log("claude:done", { title: notes.title, topics: notes.topics?.length, keyPoints: notes.keyPoints?.length });
    } catch (e: any) {
      await admin.from("work_sessions").update({ processing_status: "failed", processing_error: `claude: ${e?.message}` }).eq("id", session.id);
      return fail("claude", e?.message ?? String(e));
    }

    // Write final results.
    await admin.from("work_sessions").update({
      title: notes.title || file_name.replace(/\.[^.]+$/, ""),
      summary: notes.summary || "",
      total_seconds: totalSeconds,
      raw_transcript: transcript,
      notes,
      processing_status: "ready",
      processing_error: null,
    }).eq("id", session.id);

    // Insert topics.
    if (notes.topics?.length) {
      const rows = notes.topics.map((t: any, i: number) => ({
        session_id: session.id,
        sort_order: i,
        title: t.title,
        description: t.description || "",
        start_sec: t.startSeconds ?? null,
        end_sec: t.endSeconds ?? null,
      }));
      await admin.from("session_topics").insert(rows);
    }

    // Insert key points.
    if (notes.keyPoints?.length) {
      const rows = notes.keyPoints.map((k: any, i: number) => ({
        session_id: session.id,
        sort_order: i,
        text: k.text,
        type: ["technique", "safety", "quality", "tool", "other"].includes(k.type) ? k.type : "other",
        time_sec: k.timeSeconds ?? null,
      }));
      await admin.from("session_key_points").insert(rows);
    }

    log("done", session.id);
    return NextResponse.json({ ok: true, session });
  } catch (e: any) {
    console.error("[process-session] UNCAUGHT:", e);
    return NextResponse.json({ error: `unhandled: ${e?.message ?? String(e)}` }, { status: 500 });
  }
}
