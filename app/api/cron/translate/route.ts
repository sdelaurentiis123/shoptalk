import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { translateAllPending } from "@/lib/translate";

export const runtime = "nodejs";
export const maxDuration = 60;

// Scheduled by vercel.json to run every minute. Scans every facility for
// pending translations with no live claim and processes them serially.
// Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` on every
// invocation; we verify it so random internet traffic can't trigger this.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.get("authorization") ?? "";
    if (header !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const admin = createAdminClient();
  try {
    const { processed } = await translateAllPending(admin);
    console.log(`[cron/translate] processed=${processed.length}`);
    return NextResponse.json({ ok: true, processed: processed.length });
  } catch (e: any) {
    console.error("[cron/translate]", e);
    return NextResponse.json({ error: e?.message ?? "cron failed" }, { status: 500 });
  }
}
