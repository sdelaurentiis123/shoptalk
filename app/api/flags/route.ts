import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/auth";

export async function POST(req: Request) {
  const { user, facilityId } = await getAuthContext();
  if (!user || !facilityId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const text = String(body?.text ?? "").slice(0, 1000).trim();
  if (!text) return NextResponse.json({ error: "missing text" }, { status: 400 });
  const sop_id = (body?.sop_id as string | undefined) ?? null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("flags")
    .insert({ facility_id: facilityId, sop_id, user_id: user.id, text, status: "open" })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, flag: data });
}

export async function PUT(req: Request) {
  const { role, facilityId } = await getAuthContext();
  if (role !== "admin" || !facilityId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const id = body?.id as string | undefined;
  const status = body?.status as "resolved" | "dismissed" | "open" | undefined;
  if (!id || !status) return NextResponse.json({ error: "bad input" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("flags")
    .update({ status, resolved_at: status === "resolved" ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("facility_id", facilityId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
