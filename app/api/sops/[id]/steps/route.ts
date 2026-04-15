import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/auth";
import { markTranslationPending } from "@/lib/translate";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { role, facilityId, isPlatformAdmin } = await getAuthContext();
  if ((role !== "admin" && !isPlatformAdmin) || !facilityId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: sop } = await admin.from("sops").select("id, facility_id").eq("id", params.id).maybeSingle();
  if (!sop || sop.facility_id !== facilityId) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body?.steps) return NextResponse.json({ error: "missing steps" }, { status: 400 });

  // Delete existing steps (cascades to substeps).
  await admin.from("steps").delete().eq("sop_id", params.id);

  const steps = body.steps as {
    title: string; description?: string; start_sec: number | null; end_sec: number | null;
    sort_order: number;
    substeps?: { text: string; time_sec: number | null; sort_order: number }[];
  }[];

  for (const s of steps) {
    const { data: step, error } = await admin
      .from("steps")
      .insert({
        sop_id: params.id,
        sort_order: s.sort_order,
        title: s.title,
        title_es: "",
        description: s.description ?? "",
        description_es: "",
        start_sec: s.start_sec,
        end_sec: s.end_sec,
      })
      .select()
      .single();
    if (error || !step) continue;
    const subs = (s.substeps ?? []).map((ss) => ({
      step_id: step.id,
      sort_order: ss.sort_order,
      text: ss.text,
      text_es: "",
      time_sec: ss.time_sec,
    }));
    if (subs.length) await admin.from("substeps").insert(subs);
  }

  await admin.from("sops").update({ updated_at: new Date().toISOString() }).eq("id", params.id);

  // English changed: mark Spanish pending. Cron worker + mount-time healer
  // will pick it up.
  await markTranslationPending(admin, params.id);

  return NextResponse.json({ ok: true });
}
