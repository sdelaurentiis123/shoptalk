import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/auth";

const STATUSES = new Set(["draft", "active", "archived"]);

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { role, facilityId } = await getAuthContext();
  if (role !== "admin" || !facilityId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const patch: Record<string, unknown> = {};

  if ("status" in (body ?? {})) {
    const s = String(body.status ?? "");
    if (!STATUSES.has(s)) return NextResponse.json({ error: "bad status" }, { status: 400 });
    patch.status = s;
  }
  if ("station_id" in (body ?? {})) {
    const sid = body.station_id;
    if (sid === null || sid === "" || sid === undefined) {
      patch.station_id = null;
    } else {
      patch.station_id = String(sid);
    }
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("sops")
    .select("facility_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!existing || existing.facility_id !== facilityId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // If assigning a station, validate it belongs to this facility.
  if (typeof patch.station_id === "string") {
    const { data: st } = await admin
      .from("stations")
      .select("facility_id")
      .eq("id", patch.station_id)
      .maybeSingle();
    if (!st || st.facility_id !== facilityId) {
      return NextResponse.json({ error: "invalid station" }, { status: 400 });
    }
  }

  patch.updated_at = new Date().toISOString();
  const { data, error } = await admin.from("sops").update(patch).eq("id", params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, sop: data });
}
