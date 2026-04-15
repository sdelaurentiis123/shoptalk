import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/auth";
import { deleteObject } from "@/lib/r2";
import { markTranslationPending, translateSop } from "@/lib/translate";

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
  let titleChanged = false;
  if ("title" in (body ?? {})) {
    const title = String(body.title ?? "").trim();
    if (!title) return NextResponse.json({ error: "title empty" }, { status: 400 });
    if (title.length > 200) return NextResponse.json({ error: "title too long" }, { status: 400 });
    patch.title = title;
    titleChanged = true;
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

  // English title changed → Spanish needs to catch up.
  if (titleChanged) {
    await markTranslationPending(admin, params.id);
    void translateSop(admin, params.id).catch((e) =>
      console.error("[sops/put] translate failed:", e?.message ?? e),
    );
  }

  return NextResponse.json({ ok: true, sop: data });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { role, facilityId } = await getAuthContext();
  if (role !== "admin" || !facilityId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("sops")
    .select("facility_id, file_path")
    .eq("id", params.id)
    .maybeSingle();
  if (!existing || existing.facility_id !== facilityId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Best-effort R2 cleanup — don't block DB delete if it fails.
  if (existing.file_path) {
    try {
      await deleteObject(existing.file_path);
    } catch (e) {
      console.warn("[sops/delete] R2 delete failed:", e);
    }
  }

  const { error } = await admin.from("sops").delete().eq("id", params.id).eq("facility_id", facilityId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
