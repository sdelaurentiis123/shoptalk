import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/auth";
import { processWithGemini } from "@/lib/gemini";
import { getObjectBuffer, presignGet } from "@/lib/r2";
import { markTranslationPending } from "@/lib/translate";

export const runtime = "nodejs";
export const maxDuration = 300;

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
    // Validate the path belongs to this admin's facility.
    if (!storage_path.startsWith(`${facilityId}/`)) return fail("input", "path outside facility", 403);

    log("received", { storage_path, file_type });
    const admin = createAdminClient();

    // Download from R2.
    let buf: Buffer;
    try {
      buf = await getObjectBuffer(storage_path);
    } catch (e: any) {
      return fail("download", e?.message ?? "download failed");
    }
    log("downloaded", { sizeMB: +(buf.length / 1024 / 1024).toFixed(2) });

    // R2 signed URL cached for a week; refreshed on SOP view anyway.
    let signed_url: string | null = null;
    try {
      signed_url = await presignGet(storage_path, 60 * 60 * 24 * 7);
    } catch (e) {
      console.warn("[process-upload] presignGet failed (will re-sign on demand):", e);
    }

    let gemini;
    try {
      log("gemini:start");
      gemini = await processWithGemini(buf, file_type, file_name);
      log("gemini:done", {
        title: gemini.title,
        steps: gemini.steps?.length,
        transcriptChars: gemini.transcript?.length ?? 0,
      });
    } catch (e: any) {
      return fail("gemini", e?.message ?? String(e));
    }

    const sopType = file_type.startsWith("video/")
      ? "video"
      : file_type === "application/pdf"
        ? "pdf"
        : "image";

    const { data: sop, error: sopErr } = await admin
      .from("sops")
      .insert({
        facility_id: facilityId,
        station_id,
        title: gemini.title || file_name.replace(/\.[^.]+$/, ""),
        title_es: gemini.title_es ?? "",
        description: gemini.description || "",
        description_es: gemini.description_es ?? "",
        type: sopType,
        status: "draft",
        file_path: storage_path,
        file_url: signed_url,
        total_seconds: sopType === "video" ? (gemini.totalSeconds || 0) : 0,
        transcript: gemini.transcript ?? "",
        transcript_es: gemini.transcript_es ?? "",
        recorded_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (sopErr || !sop) return fail("sop-insert", sopErr?.message ?? "no row returned");
    log("sop-inserted", sop.id);

    for (let i = 0; i < (gemini.steps || []).length; i++) {
      const s = gemini.steps[i];
      const { data: step, error: stErr } = await admin
        .from("steps")
        .insert({
          sop_id: sop.id,
          sort_order: i,
          title: s.title,
          title_es: s.title_es ?? "",
          description: s.description || "",
          description_es: s.description_es ?? "",
          start_sec: sopType === "video" ? s.startSeconds ?? null : null,
          end_sec: sopType === "video" ? s.endSeconds ?? null : null,
        })
        .select()
        .single();
      if (stErr || !step) {
        console.error("[process-upload] step insert error:", stErr);
        continue;
      }
      const subs = (s.substeps || []).map((ss, j) => ({
        step_id: step.id,
        sort_order: j,
        text: ss.text,
        text_es: ss.text_es ?? "",
        time_sec: sopType === "video" ? ss.timeSeconds ?? null : null,
      }));
      if (subs.length) {
        const { error: ssErr } = await admin.from("substeps").insert(subs);
        if (ssErr) console.error("[process-upload] substep insert error:", ssErr);
      }
    }

    // Mark Spanish translation as pending. The cron worker
    // (/api/cron/translate, runs every minute on Vercel) and the mount-time
    // healer (/api/translate-stale, runs on every admin page load on localhost
    // and Vercel) will pick it up and complete the translation synchronously
    // within their own request. No fire-and-forget — serverless kills that.
    await markTranslationPending(admin, sop.id);
    log("translate:queued");

    return NextResponse.json({ ok: true, sop });
  } catch (e: any) {
    console.error("[process-upload] UNCAUGHT:", e);
    return NextResponse.json({ error: `unhandled: ${e?.message ?? String(e)}` }, { status: 500 });
  }
}
