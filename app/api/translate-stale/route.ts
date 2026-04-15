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

  // Atomic claim: mark any stale-pending row "fresh pending" and return its id.
  // Race-safe — concurrent healers both run this; only one gets rows back per
  // stale SOP because updated_at gets bumped on the first call.
  const { data: claimed, error } = await admin
    .from("sops")
    .update({ updated_at: new Date().toISOString() })
    .eq("facility_id", facilityId)
    .eq("translation_status", "pending")
    .lt("updated_at", cutoffIso)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (claimed ?? []).map((r) => r.id as string);

  // Await the translation synchronously so the serverless function stays alive
  // for the full duration of the Claude call. Client fires this POST
  // fire-and-forget, so it doesn't care how long this response takes.
  for (const id of ids) {
    try {
      await translateSop(admin, id);
    } catch (e) {
      console.error("[translate-stale] sop", id, "failed:", e);
    }
  }
  return NextResponse.json({ ok: true, healed: ids.length });
}
