import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/auth";
import { translateSop } from "@/lib/translate";

export const runtime = "nodejs";
export const maxDuration = 60;

const STALE_SECONDS = 60;

export async function POST() {
  const { role, facilityId } = await getAuthContext();
  if (role !== "admin" || !facilityId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const cutoffIso = new Date(Date.now() - STALE_SECONDS * 1000).toISOString();

  // Find every pending SOP in this facility whose translation claim has
  // gone stale (or was never set). translateSop's own tryClaim handles
  // race-safe ownership; the healer just surfaces orphans.
  const { data: stale, error } = await admin
    .from("sops")
    .select("id")
    .eq("facility_id", facilityId)
    .eq("translation_status", "pending")
    .or(`translation_claimed_at.is.null,translation_claimed_at.lt.${cutoffIso}`);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (stale ?? []).map((r) => r.id as string);
  let healed = 0;
  for (const id of ids) {
    try {
      await translateSop(admin, id);
      healed++;
    } catch (e) {
      console.error("[translate-stale] sop", id, "failed:", e);
    }
  }
  return NextResponse.json({ ok: true, healed });
}
