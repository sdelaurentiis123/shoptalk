import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/auth";
import { markTranslationPending, translateSop } from "@/lib/translate";

export const runtime = "nodejs";
export const maxDuration = 60;

// Heals any SOP in the caller's facility that's been stuck at
// translation_status='pending' for more than STALE_SECONDS. Re-invokes
// translateSop in the background (fire-and-forget).
const STALE_SECONDS = 60;

export async function POST() {
  const { role, facilityId } = await getAuthContext();
  if (role !== "admin" || !facilityId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - STALE_SECONDS * 1000).toISOString();

  const { data: stale, error } = await admin
    .from("sops")
    .select("id")
    .eq("facility_id", facilityId)
    .eq("translation_status", "pending")
    .lt("updated_at", cutoff);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (stale ?? []).map((r) => r.id as string);
  for (const id of ids) {
    // Bumps updated_at so the next healer leaves it alone for STALE_SECONDS.
    await markTranslationPending(admin, id);
    void translateSop(admin, id).catch((e) =>
      console.error("[translate-stale] sop", id, "failed:", e?.message ?? e),
    );
  }
  return NextResponse.json({ ok: true, healed: ids.length });
}
