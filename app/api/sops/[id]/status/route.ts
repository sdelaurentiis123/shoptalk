import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/auth";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { role, facilityId, isPlatformAdmin } = await getAuthContext();
  if ((role !== "admin" && !isPlatformAdmin) || !facilityId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const status = body?.status as "draft" | "active" | "archived" | undefined;
  if (!status || !["draft", "active", "archived"].includes(status)) {
    return NextResponse.json({ error: "bad status" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: sop } = await admin.from("sops").select("facility_id").eq("id", params.id).maybeSingle();
  if (!sop || sop.facility_id !== facilityId) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { error } = await admin.from("sops").update({ status }).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
