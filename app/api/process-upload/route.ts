import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/auth";
import { getObjectBuffer, presignGet, putObject } from "@/lib/r2";
import { splitVideo } from "@/lib/ffmpeg";
import { markTranslationPending } from "@/lib/translate";

export const runtime = "nodejs";
export const maxDuration = 120;

function log(stage: string, extra?: unknown) {
  console.log(`[process-upload] ${stage}`, extra ?? "");
}
function fail(stage: string, msg: string, status = 500) {
  console.error(`[process-upload] FAIL ${stage}:`, msg);
  return NextResponse.json({ error: `${stage}: ${msg}` }, { status });
}

export async function POST(req: Request) {
  try {
    const { role, facilityId, user, isPlatformAdmin } = await getAuthContext();
    if (!user || (role !== "admin" && !isPlatformAdmin) || !facilityId) return fail("auth", "unauthorized", 401);

    const body = await req.json().catch(() => null);
    const storage_path = String(body?.storage_path ?? "").trim();
    const file_type = String(body?.file_type ?? "").trim();
    const file_name = String(body?.file_name ?? "file").trim();
    const station_id = (body?.station_id as string | null) || null;

    if (!storage_path || !file_type) return fail("input", "missing storage_path or file_type", 400);
    if (!storage_path.startsWith(`${facilityId}/`)) return fail("input", "path outside facility", 403);

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
      console.warn("[process-upload] presignGet failed:", e);
    }

    const sopType = file_type.startsWith("video/")
      ? "video"
      : file_type === "application/pdf"
        ? "pdf"
        : "image";

    // Create the SOP row early (will be filled in by the cron when processing finishes).
    const { data: sop, error: sopErr } = await admin
      .from("sops")
      .insert({
        facility_id: facilityId,
        station_id,
        title: file_name.replace(/\.[^.]+$/, ""),
        type: sopType,
        status: "draft",
        file_path: storage_path,
        file_url: signed_url,
      })
      .select()
      .single();
    if (sopErr || !sop) return fail("sop-insert", sopErr?.message ?? "no row returned");
    log("sop-inserted", sop.id);

    // Split video into chunks and store them.
    if (sopType === "video") {
      const chunks = await splitVideo(buf, file_type);
      log("split", { chunks: chunks.length });

      for (const chunk of chunks) {
        const chunkPath = `${facilityId}/chunks/${sop.id}_${chunk.index}.mp4`;
        await putObject(chunkPath, chunk.buf, file_type);

        await admin.from("processing_chunks").insert({
          parent_type: "sop",
          parent_id: sop.id,
          chunk_index: chunk.index,
          start_sec: chunk.startSec,
          duration_sec: chunk.durationSec,
          file_path: chunkPath,
          status: "pending",
        });
      }
      log("chunks-stored", chunks.length);
    } else {
      // Non-video (PDF/image): process inline since it's fast.
      const { processWithGemini } = await import("@/lib/gemini");
      const gemini = await processWithGemini(buf, file_type, file_name);
      await admin.from("sops").update({
        title: gemini.title || file_name.replace(/\.[^.]+$/, ""),
        title_es: gemini.title_es ?? "",
        description: gemini.description || "",
        description_es: gemini.description_es ?? "",
        transcript: gemini.transcript ?? "",
        transcript_es: gemini.transcript_es ?? "",
      }).eq("id", sop.id);

      for (let i = 0; i < (gemini.steps || []).length; i++) {
        const s = gemini.steps[i];
        const { data: step } = await admin.from("steps").insert({
          sop_id: sop.id, sort_order: i, title: s.title, title_es: s.title_es ?? "",
          description: s.description || "", description_es: s.description_es ?? "",
        }).select().single();
        if (!step) continue;
        const subs = (s.substeps || []).map((ss, j) => ({
          step_id: step.id, sort_order: j, text: ss.text, text_es: ss.text_es ?? "",
          time_sec: null,
        }));
        if (subs.length) await admin.from("substeps").insert(subs);
      }
      await markTranslationPending(admin, sop.id);
    }

    return NextResponse.json({ ok: true, sop });
  } catch (e: any) {
    console.error("[process-upload] UNCAUGHT:", e);
    return NextResponse.json({ error: `unhandled: ${e?.message ?? String(e)}` }, { status: 500 });
  }
}
