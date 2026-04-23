import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 30;

const STUCK_THRESHOLD_MS = 10 * 60 * 1000;

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

  const processorUrl = process.env.PROCESSOR_URL;
  if (!processorUrl) {
    return NextResponse.json({ ok: true, action: "no_processor_url" });
  }

  const admin = createAdminClient();
  const staleTs = new Date(Date.now() - STUCK_THRESHOLD_MS).toISOString();

  // Find SOPs stuck in draft with no chunks and no steps (Fly trigger may have been lost)
  const { data: stuckSops } = await admin
    .from("sops")
    .select("id, facility_id, file_path, type")
    .eq("status", "draft")
    .eq("type", "video")
    .lt("created_at", staleTs);

  let retriggered = 0;

  for (const sop of stuckSops ?? []) {
    const { data: steps } = await admin.from("steps").select("id").eq("sop_id", sop.id).limit(1);
    if (steps && steps.length > 0) continue;

    const { data: chunks } = await admin.from("processing_chunks").select("id").eq("parent_id", sop.id).limit(1);
    if (chunks && chunks.length > 0) continue;

    log("retrigger-sop", { sopId: sop.id });
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30_000);
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
      log("retrigger-sop-failed", { sopId: sop.id, error: err?.message });
    }
    retriggered++;
  }

  // Find sessions stuck in processing with no chunks
  const { data: stuckSessions } = await admin
    .from("work_sessions")
    .select("id, facility_id, file_path")
    .in("processing_status", ["processing", "summarizing"])
    .lt("created_at", staleTs);

  for (const session of stuckSessions ?? []) {
    const { data: chunks } = await admin.from("processing_chunks").select("id").eq("parent_id", session.id).limit(1);
    if (chunks && chunks.length > 0) continue;

    log("retrigger-session", { sessionId: session.id });
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30_000);
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
      log("retrigger-session-failed", { sessionId: session.id, error: err?.message });
    }
    retriggered++;
  }

  log("done", { retriggered });
  return NextResponse.json({ ok: true, action: "fallback_check", retriggered });
}
