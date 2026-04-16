import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { user, role, facilityId, isPlatformAdmin } = await getAuthContext();
  if (!user || (role !== "admin" && !isPlatformAdmin) || !facilityId)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: session } = await admin
    .from("work_sessions")
    .select("*")
    .eq("id", params.id)
    .eq("facility_id", facilityId)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [{ data: topics }, { data: keyPoints }] = await Promise.all([
    admin.from("session_topics").select("*").eq("session_id", params.id).order("sort_order"),
    admin.from("session_key_points").select("*").eq("session_id", params.id).order("sort_order"),
  ]);

  return NextResponse.json({ session, topics: topics ?? [], keyPoints: keyPoints ?? [] });
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { user, role, facilityId, isPlatformAdmin } = await getAuthContext();
  if (!user || (role !== "admin" && !isPlatformAdmin) || !facilityId)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const body = await req.json().catch(() => null);
  const patch: Record<string, unknown> = {};
  if (typeof body?.title === "string") patch.title = body.title;
  if (typeof body?.summary === "string") patch.summary = body.summary;
  if (Array.isArray(body?.action_items)) {
    const existing = await admin.from("work_sessions").select("notes").eq("id", params.id).maybeSingle();
    const notes = (existing?.data?.notes as any) ?? {};
    notes.actionItems = body.action_items;
    patch.notes = notes;
  }

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  patch.updated_at = new Date().toISOString();
  const { error } = await admin.from("work_sessions").update(patch).eq("id", params.id).eq("facility_id", facilityId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { user, role, facilityId, isPlatformAdmin } = await getAuthContext();
  if (!user || (role !== "admin" && !isPlatformAdmin) || !facilityId)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { error } = await admin.from("work_sessions").delete().eq("id", params.id).eq("facility_id", facilityId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
