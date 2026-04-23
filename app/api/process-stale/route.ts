import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

function log(stage: string, extra?: unknown) {
  console.log(`[process-stale] ${stage}`, extra ?? "");
}

export async function POST(req: Request) {
  const { role, isPlatformAdmin } = await getAuthContext();
  if (role !== "admin" && !isPlatformAdmin)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parentId = (body as any)?.parentId as string | undefined;

  const processorUrl = process.env.PROCESSOR_URL;
  if (!processorUrl) {
    return NextResponse.json({ ok: true, action: "no_processor_url" });
  }

  if (!parentId) {
    return NextResponse.json({ ok: true, action: "no_parent_id" });
  }

  const admin = createAdminClient();

  // Check if this parent has any chunks at all — if not, re-trigger Fly
  const { data: chunks } = await admin
    .from("processing_chunks")
    .select("id, status")
    .eq("parent_id", parentId);

  if (!chunks || chunks.length === 0) {
    // No chunks exist — Fly trigger was probably lost, try to re-trigger
    // Check if it's a SOP or session
    const { data: sop } = await admin
      .from("sops")
      .select("id, facility_id, file_path, type")
      .eq("id", parentId)
      .maybeSingle();

    if (sop && sop.type === "video") {
      log("retrigger-sop", { sopId: parentId });
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 60_000);
        await fetch(`${processorUrl}/process/sop`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.PROCESSOR_SECRET || ""}`,
          },
          body: JSON.stringify({
            storageKey: sop.file_path,
            fileType: "video/mp4",
            fileName: "retrigger",
            facilityId: sop.facility_id,
            sopId: sop.id,
          }),
          signal: ctrl.signal,
        }).finally(() => clearTimeout(timer));
      } catch (err: any) {
        log("retrigger-failed", { error: err?.message });
      }
      return NextResponse.json({ ok: true, action: "retriggered_sop" });
    }

    const { data: session } = await admin
      .from("work_sessions")
      .select("id, facility_id, file_path")
      .eq("id", parentId)
      .maybeSingle();

    if (session) {
      log("retrigger-session", { sessionId: parentId });
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 60_000);
        await fetch(`${processorUrl}/process/session`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.PROCESSOR_SECRET || ""}`,
          },
          body: JSON.stringify({
            storageKey: session.file_path,
            fileType: "video/mp4",
            fileName: "retrigger",
            facilityId: session.facility_id,
            sessionId: session.id,
          }),
          signal: ctrl.signal,
        }).finally(() => clearTimeout(timer));
      } catch (err: any) {
        log("retrigger-failed", { error: err?.message });
      }
      return NextResponse.json({ ok: true, action: "retriggered_session" });
    }
  }

  // Chunks exist — processing is in progress on Fly, nothing to do
  const done = chunks?.filter(c => c.status === "done").length ?? 0;
  const total = chunks?.length ?? 0;
  log("status", { parentId, done, total });
  return NextResponse.json({ ok: true, action: "in_progress", done, total });
}
