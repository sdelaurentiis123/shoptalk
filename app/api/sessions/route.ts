import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const { user, role, facilityId, isPlatformAdmin } = await getAuthContext();
  if (!user || (role !== "admin" && !isPlatformAdmin) || !facilityId)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("work_sessions")
    .select("id, title, summary, total_seconds, processing_status, created_at, station_id")
    .eq("facility_id", facilityId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sessions: data ?? [] });
}
