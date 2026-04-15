import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const STALE_AFTER_MS = 15 * 60 * 1000;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await getAuthContext();
  if (!ctx.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const force = !!body?.force;

  const admin = createAdminClient();
  const { data: sop } = await admin
    .from("sops")
    .select("id, facility_id, edit_lock_by, edit_lock_at")
    .eq("id", params.id)
    .maybeSingle();
  if (!sop) return NextResponse.json({ error: "not found" }, { status: 404 });

  const isFacilityAdmin =
    ctx.isPlatformAdmin || ctx.facilityIds.includes(sop.facility_id as string);
  if (!isFacilityAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const now = Date.now();
  const heldByOther =
    sop.edit_lock_by &&
    sop.edit_lock_by !== ctx.user.id &&
    sop.edit_lock_at &&
    now - new Date(sop.edit_lock_at as string).getTime() < STALE_AFTER_MS;

  if (heldByOther && !force) {
    const { data: holder } = await admin.auth.admin.getUserById(sop.edit_lock_by as string);
    return NextResponse.json(
      {
        locked: true,
        locked_by_email: holder?.user?.email ?? null,
        locked_at: sop.edit_lock_at,
      },
      { status: 409 },
    );
  }

  // Claim or take over.
  const { error } = await admin
    .from("sops")
    .update({ edit_lock_by: ctx.user.id, edit_lock_at: new Date().toISOString() })
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await getAuthContext();
  if (!ctx.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: sop } = await admin
    .from("sops")
    .select("id, facility_id, edit_lock_by")
    .eq("id", params.id)
    .maybeSingle();
  if (!sop) return NextResponse.json({ ok: true });

  const isFacilityAdmin =
    ctx.isPlatformAdmin || ctx.facilityIds.includes(sop.facility_id as string);
  if (!isFacilityAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Only the holder (or platform admin / owner) can clear.
  if (sop.edit_lock_by && sop.edit_lock_by !== ctx.user.id && !ctx.isPlatformAdmin) {
    // Allow owners to force-release too.
    const { data: me } = await admin
      .from("facility_members")
      .select("role")
      .eq("facility_id", sop.facility_id)
      .eq("user_id", ctx.user.id)
      .maybeSingle();
    if (me?.role !== "owner") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await admin
    .from("sops")
    .update({ edit_lock_by: null, edit_lock_at: null })
    .eq("id", params.id);
  return NextResponse.json({ ok: true });
}
