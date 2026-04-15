import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/auth";
import { translateAllPending } from "@/lib/translate";

export const runtime = "nodejs";
export const maxDuration = 60;

// Client fires this on mount; runs synchronously on the server. Works on
// localhost (where cron doesn't fire) and as a fast-path on production
// (runs on every admin page load, catches anything cron hasn't gotten to
// yet). translateAllPending() is shared with the Vercel Cron worker.
export async function POST() {
  const { role, facilityId, isPlatformAdmin } = await getAuthContext();
  if ((role !== "admin" && !isPlatformAdmin) || !facilityId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  try {
    const { processed } = await translateAllPending(admin, facilityId);
    return NextResponse.json({ ok: true, healed: processed.length });
  } catch (e: any) {
    console.error("[translate-stale]", e);
    return NextResponse.json({ error: e?.message ?? "heal failed" }, { status: 500 });
  }
}
