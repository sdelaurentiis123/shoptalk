import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/auth";
import { presignGet } from "@/lib/r2";

export const runtime = "nodejs";
export const maxDuration = 60;

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

    let signed_url: string | null = null;
    try {
      signed_url = await presignGet(storage_path, 60 * 60 * 24 * 7);
    } catch (e) {
      console.warn("[process-session] presignGet failed:", e);
    }

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

    // Fire-and-forget to Fly processor
    const processorUrl = process.env.PROCESSOR_URL;
    if (!processorUrl) return fail("config", "PROCESSOR_URL not set");

    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 60_000);
      const res = await fetch(`${processorUrl}/process/session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.PROCESSOR_SECRET || ""}`,
        },
        body: JSON.stringify({
          storageKey: storage_path,
          fileType: file_type,
          fileName: file_name,
          facilityId,
          sessionId: session.id,
          stationId: station_id,
        }),
        signal: ctrl.signal,
      }).finally(() => clearTimeout(timer));
      if (!res.ok) {
        console.error(`[process-session] Fly returned ${res.status}`);
      }
    } catch (err) {
      console.error("[process-session] Fly trigger failed:", err);
    }

    log("fly-triggered", { sessionId: session.id });
    return NextResponse.json({ ok: true, session, chunksTotal: 0 });
  } catch (e: any) {
    console.error("[process-session] UNCAUGHT:", e);
    return NextResponse.json({ error: `unhandled: ${e?.message ?? String(e)}` }, { status: 500 });
  }
}
