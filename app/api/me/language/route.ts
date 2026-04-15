import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/auth";

const ALLOWED = new Set(["en", "es"]);

export async function POST(req: Request) {
  const { user, role, facilityId } = await getAuthContext();
  if (!user || !role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const language = String(body?.language ?? "");
  if (!ALLOWED.has(language)) return NextResponse.json({ error: "invalid language" }, { status: 400 });

  const admin = createAdminClient();

  if (role === "operator") {
    const { error } = await admin
      .from("operator_profiles")
      .update({ language })
      .eq("user_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (role === "admin") {
    if (!facilityId) return NextResponse.json({ error: "no facility" }, { status: 400 });
    const { error } = await admin
      .from("facilities")
      .update({ default_language: language })
      .eq("id", facilityId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Also mirror into user_metadata so middleware and client quick-reads can pick it up.
  const ssr = createClient();
  await ssr.auth.updateUser({ data: { language } }).catch(() => {});

  return NextResponse.json({ ok: true, language });
}
