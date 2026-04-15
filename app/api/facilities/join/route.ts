import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { LangCode } from "@/lib/types";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "bad json" }, { status: 400 });
  const join_code = String(body.join_code ?? "").trim();
  const display_name = String(body.display_name ?? "").trim();
  const language = (body.language ?? "en") as LangCode;
  if (!join_code || !display_name) return NextResponse.json({ error: "missing fields" }, { status: 400 });

  const admin = createAdminClient();
  const { data: facility, error: fErr } = await admin
    .from("facilities")
    .select("id, name, join_code")
    .eq("join_code", join_code)
    .maybeSingle();
  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 });
  if (!facility) return NextResponse.json({ error: "invalid join code" }, { status: 404 });

  // Use the SSR client so the auth cookie is set on the response.
  const ssr = createClient();
  const { data: anon, error: anonErr } = await ssr.auth.signInAnonymously({
    options: { data: { role: "operator", facility_id: facility.id, display_name, language } },
  });
  if (anonErr || !anon.user) return NextResponse.json({ error: anonErr?.message ?? "auth failed" }, { status: 500 });

  // Insert operator profile via service role (anon user is authenticated but RLS via self-policy would also allow).
  const { error: pErr } = await admin.from("operator_profiles").upsert({
    user_id: anon.user.id,
    facility_id: facility.id,
    display_name,
    language,
  }, { onConflict: "user_id" });
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, facility: { id: facility.id, name: facility.name } });
}
