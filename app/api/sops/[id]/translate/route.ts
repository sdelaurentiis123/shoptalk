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

  try {
    await translateSop(admin, params.id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[sops/translate]", e);
    return NextResponse.json({ error: e?.message ?? "translate failed" }, { status: 500 });
  }
}
