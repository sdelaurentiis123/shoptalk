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
  const { data: session } = await admin
    .from("work_sessions")
    .select("id, facility_id, edit_lock_by, edit_lock_at")
    .eq("id", params.id)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: "not found" }, { status: 404 });

  const isFacilityAdmin =
    ctx.isPlatformAdmin || ctx.facilityIds.includes(session.facility_id as string);
  if (!isFacilityAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const now = Date.now();
  const heldByOther =
    session.edit_lock_by &&
    session.edit_lock_by !== ctx.user.id &&
    session.edit_lock_at &&
    now - new Date(session.edit_lock_at as string).getTime() < STALE_AFTER_MS;

  if (heldByOther && !force) {
    const { data: holder } = await admin.auth.admin.getUserById(session.edit_lock_by as string);
    return NextResponse.json(
      { locked: true, locked_by_email: holder?.user?.email ?? null, locked_at: session.edit_lock_at },
      { status: 409 },
    );
  }

  await admin
    .from("work_sessions")
    .update({ edit_lock_by: ctx.user.id, edit_lock_at: new Date().toISOString() })
    .eq("id", params.id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await getAuthContext();
  if (!ctx.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  await admin
    .from("work_sessions")
    .update({ edit_lock_by: null, edit_lock_at: null })
    .eq("id", params.id);
  return NextResponse.json({ ok: true });
}
