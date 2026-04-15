import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/auth";
import { translateSop, markTranslationPending } from "@/lib/translate";

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

  // Force re-translation even if content hasn't changed.
  await admin.from("sops").update({ english_hash: "" }).eq("id", params.id);
  await markTranslationPending(admin, params.id);
  void translateSop(admin, params.id).catch((e) =>
    console.error("[sops/translate]", e?.message ?? e),
  );
  return NextResponse.json({ ok: true, status: "pending" });
}
