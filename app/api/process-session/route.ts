import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/auth";
import { getObjectBuffer, presignGet, putObject } from "@/lib/r2";
import { splitVideo } from "@/lib/ffmpeg";

export const runtime = "nodejs";
export const maxDuration = 120;

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

    // Split and store chunks.
    const chunks = await splitVideo(buf, file_type);
    log("split", { chunks: chunks.length });

    let stored = 0;
    for (const chunk of chunks) {
      const chunkPath = `${facilityId}/chunks/${session.id}_${chunk.index}.mp4`;
      await putObject(chunkPath, chunk.buf, file_type);
      log("r2-stored", { index: chunk.index, sizeMB: +(chunk.buf.length / 1024 / 1024).toFixed(2) });

      const { error: insertErr } = await admin.from("processing_chunks").insert({
        parent_type: "session",
        parent_id: session.id,
        chunk_index: chunk.index,
        start_sec: chunk.startSec,
        duration_sec: chunk.durationSec,
        file_path: chunkPath,
        status: "pending",
      });
      if (insertErr) {
        console.error("[process-session] chunk insert failed:", { index: chunk.index, error: insertErr.message });
        return fail("chunk-insert", `chunk ${chunk.index}: ${insertErr.message}`);
      }
      stored++;
    }
    log("chunks-stored", { stored, total: chunks.length });

    return NextResponse.json({ ok: true, session, chunksTotal: chunks.length });
  } catch (e: any) {
    console.error("[process-session] UNCAUGHT:", e);
    return NextResponse.json({ error: `unhandled: ${e?.message ?? String(e)}` }, { status: 500 });
  }
}
