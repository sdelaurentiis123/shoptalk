import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { user, role, facilityId, isPlatformAdmin } = await getAuthContext();
  if (!user || (role !== "admin" && !isPlatformAdmin) || !facilityId)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const keyPoints = body?.keyPoints;
  if (!Array.isArray(keyPoints)) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const admin = createAdminClient();

  const { data: session } = await admin
    .from("work_sessions")
    .select("facility_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!session || session.facility_id !== facilityId)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  await admin.from("session_key_points").delete().eq("session_id", params.id);

  if (keyPoints.length > 0) {
    const rows = keyPoints.map((kp: any, i: number) => ({
      session_id: params.id,
      sort_order: i,
      text: String(kp.text ?? ""),
      type: ["technique", "safety", "quality", "tool", "other"].includes(kp.type) ? kp.type : "other",
      time_sec: typeof kp.time_sec === "number" ? kp.time_sec : null,
    }));
    const { error } = await admin.from("session_key_points").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
