import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/auth";
import { presignGet, putObject } from "@/lib/r2";
import { warmBinaries, getVideoDurationFromUrl, splitVideoFromUrl } from "@/lib/ffmpeg";
import { readFile, unlink } from "fs/promises";

export const runtime = "nodejs";
export const maxDuration = 300;

const CHUNK_DURATION_SEC = 90;

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

    // Start binary download in parallel with URL generation
    const binariesReady = warmBinaries();
    const url = await presignGet(storage_path, 3600);

    let signed_url: string | null = null;
    try {
      signed_url = await presignGet(storage_path, 60 * 60 * 24 * 7);
    } catch (e) {
      console.warn("[process-session] presignGet failed:", e);
    }

    // Create the session row.
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

    await binariesReady;

    const duration = await getVideoDurationFromUrl(url);
    log("duration", { seconds: duration });

    if (duration <= CHUNK_DURATION_SEC) {
      // Single chunk: use original file
      const { error: insertErr } = await admin.from("processing_chunks").insert({
        parent_type: "session",
        parent_id: session.id,
        chunk_index: 0,
        start_sec: 0,
        duration_sec: duration || 1,
        file_path: storage_path,
        status: "pending",
      });
      if (insertErr) return fail("chunk-insert", insertErr.message);
      log("single-chunk", { duration });
    } else {
      // Multi-chunk: stream from URL
      let stored = 0;
      await splitVideoFromUrl(url, file_type, duration, async (chunk) => {
        const chunkPath = `${facilityId}/chunks/${session.id}_${chunk.index}.mp4`;
        const chunkBuf = await readFile(chunk.tmpPath);
        await putObject(chunkPath, chunkBuf, file_type);
        await unlink(chunk.tmpPath);
        log("chunk-stored", { index: chunk.index, sizeMB: +(chunkBuf.length / 1024 / 1024).toFixed(2) });

        const { error: insertErr } = await admin.from("processing_chunks").insert({
          parent_type: "session",
          parent_id: session.id,
          chunk_index: chunk.index,
          start_sec: chunk.startSec,
          duration_sec: chunk.durationSec,
          file_path: chunkPath,
          status: "pending",
        });
        if (insertErr) throw new Error(`chunk ${chunk.index}: ${insertErr.message}`);
        stored++;
      });
      log("chunks-stored", { stored });
    }

    const { data: chunkRows } = await admin.from("processing_chunks").select("id").eq("parent_id", session.id);
    return NextResponse.json({ ok: true, session, chunksTotal: chunkRows?.length ?? 0 });
  } catch (e: any) {
    console.error("[process-session] UNCAUGHT:", e);
    return NextResponse.json({ error: `unhandled: ${e?.message ?? String(e)}` }, { status: 500 });
  }
}
