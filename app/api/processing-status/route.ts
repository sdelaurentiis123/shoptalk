import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const { user } = await getAuthContext();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const type = url.searchParams.get("type") as "sop" | "session" | null;
  if (!id || !type) return NextResponse.json({ error: "missing id or type" }, { status: 400 });

  const admin = createAdminClient();
  const { data: chunks } = await admin
    .from("processing_chunks")
    .select("status")
    .eq("parent_id", id);

  const total = chunks?.length ?? 0;
  const done = chunks?.filter((c) => c.status === "done").length ?? 0;
  const failed = chunks?.filter((c) => c.status === "failed").length ?? 0;

  let status: "processing" | "ready" | "failed" = "processing";
  if (failed > 0) {
    status = "failed";
  } else if (type === "session") {
    // Sessions own their state via work_sessions.processing_status. Read it
    // directly so pre-chunk and post-chunk (Claude) failures surface as
    // "failed" instead of polling forever.
    const { data } = await admin
      .from("work_sessions")
      .select("processing_status")
      .eq("id", id)
      .maybeSingle();
    const ps = data?.processing_status;
    if (ps === "failed") status = "failed";
    else if (ps === "ready") status = "ready";
    else status = "processing"; // pending, processing, summarizing
  } else if (done === total && total > 0) {
    // SOPs: ready iff finalizeSop wrote steps. Pre-chunk failures are
    // surfaced via the sentinel chunk in setSopError (failed > 0 above).
    const { data: steps } = await admin.from("steps").select("id").eq("sop_id", id).limit(1);
    status = steps && steps.length > 0 ? "ready" : "processing";
  }

  return NextResponse.json({ chunksTotal: total, chunksDone: done, status });
}
