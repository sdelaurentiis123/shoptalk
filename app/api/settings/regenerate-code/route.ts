import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/auth";
import { generateJoinCode } from "@/lib/utils";

export async function POST() {
  const { role, facilityId, isPlatformAdmin } = await getAuthContext();
  if ((role !== "admin" && !isPlatformAdmin) || !facilityId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data: fac } = await admin.from("facilities").select("name").eq("id", facilityId).maybeSingle();
  const code = generateJoinCode(fac?.name ?? "facility");
  const { error } = await admin.from("facilities").update({ join_code: code }).eq("id", facilityId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, join_code: code });
}
