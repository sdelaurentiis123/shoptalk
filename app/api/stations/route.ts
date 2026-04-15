import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/auth";

export async function POST(req: Request) {
  const { role, facilityId } = await getAuthContext();
  if (role !== "admin" || !facilityId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (name.length > 60) return NextResponse.json({ error: "name too long" }, { status: 400 });

  const admin = createAdminClient();

  // Case-insensitive uniqueness within facility.
  const { data: existing } = await admin
    .from("stations")
    .select("id, name")
    .eq("facility_id", facilityId);
  if ((existing ?? []).some((s) => s.name.toLowerCase() === name.toLowerCase())) {
    return NextResponse.json({ error: "station already exists" }, { status: 409 });
  }

  const { data: ordered } = await admin
    .from("stations")
    .select("sort_order")
    .eq("facility_id", facilityId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextOrder = (ordered?.[0]?.sort_order ?? -1) + 1;

  const { data, error } = await admin
    .from("stations")
    .insert({ facility_id: facilityId, name, sort_order: nextOrder })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, station: data });
}
