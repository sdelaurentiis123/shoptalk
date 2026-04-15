import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await getAuthContext();
  if (!ctx.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: sop } = await admin
    .from("sops")
    .select("id, facility_id, edit_lock_by")
    .eq("id", params.id)
    .maybeSingle();
  if (!sop) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (sop.edit_lock_by !== ctx.user.id) {
    return NextResponse.json({ error: "not holder" }, { status: 409 });
  }

  const isFacilityAdmin =
    ctx.isPlatformAdmin || ctx.facilityIds.includes(sop.facility_id as string);
  if (!isFacilityAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await admin
    .from("sops")
    .update({ edit_lock_at: new Date().toISOString() })
    .eq("id", params.id);
  return NextResponse.json({ ok: true });
}
