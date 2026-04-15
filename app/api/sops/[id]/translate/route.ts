import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/auth";
import { translateSop } from "@/lib/translate";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { role, facilityId } = await getAuthContext();
  if (role !== "admin" || !facilityId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: sop } = await admin
    .from("sops")
    .select("facility_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!sop || sop.facility_id !== facilityId) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Force re-translation: clear english_hash so translateSop's skip-if-
  // unchanged check doesn't short-circuit. We deliberately do NOT touch
  // updated_at — the claim inside translateSop owns that bump.
  await admin
    .from("sops")
    .update({ english_hash: "", translation_status: "pending" })
    .eq("id", params.id);

  try {
    await translateSop(admin, params.id);
    return NextResponse.json({ ok: true, status: "ready" });
  } catch (e: any) {
    console.error("[sops/translate]", e);
    return NextResponse.json({ error: e?.message ?? "translate failed" }, { status: 500 });
  }
}
