import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/auth";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { role, facilityId } = await getAuthContext();
  if (role !== "admin" || !facilityId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const patch: Record<string, unknown> = {};
  if (typeof body?.name === "string") {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "name empty" }, { status: 400 });
    if (name.length > 60) return NextResponse.json({ error: "name too long" }, { status: 400 });
    patch.name = name;
  }
  if (Number.isFinite(body?.sort_order)) {
    patch.sort_order = Number(body.sort_order);
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("stations")
    .select("facility_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!existing || existing.facility_id !== facilityId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (typeof patch.name === "string") {
    const { data: dup } = await admin
      .from("stations")
      .select("id, name")
      .eq("facility_id", facilityId)
      .neq("id", params.id);
    if ((dup ?? []).some((s) => s.name.toLowerCase() === (patch.name as string).toLowerCase())) {
      return NextResponse.json({ error: "station already exists" }, { status: 409 });
    }
  }

  const { data, error } = await admin.from("stations").update(patch).eq("id", params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, station: data });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { role, facilityId } = await getAuthContext();
  if (role !== "admin" || !facilityId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("stations")
    .select("facility_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!existing || existing.facility_id !== facilityId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { error } = await admin.from("stations").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
