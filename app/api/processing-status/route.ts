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
  if (failed > 0) status = "failed";
  else if (done === total && total > 0) {
    // Check if parent is finalized
    const table = type === "session" ? "work_sessions" : "sops";
    if (type === "session") {
      const { data } = await admin.from(table).select("processing_status").eq("id", id).maybeSingle();
      status = data?.processing_status === "ready" ? "ready" : "processing";
    } else {
      const { data: steps } = await admin.from("steps").select("id").eq("sop_id", id).limit(1);
      status = steps && steps.length > 0 ? "ready" : "processing";
    }
  }

  return NextResponse.json({ chunksTotal: total, chunksDone: done, status });
}
