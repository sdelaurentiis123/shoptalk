import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateJoinCode } from "@/lib/utils";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim();
  const password = String(body?.password ?? "");
  const facility_name = String(body?.facility_name ?? "").trim();
  if (!email || !password || !facility_name) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "password must be at least 8 characters" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Create the admin user via the Admin API (bypasses email confirmation + disposable-domain checks).
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: "admin" },
  });
  if (error || !created?.user) {
    console.error("[signup] createUser error:", error);
    return NextResponse.json(
      { error: error?.message ?? "signup failed", code: (error as any)?.code },
      { status: 400 },
    );
  }

  // Generate a unique join code.
  let code = generateJoinCode(facility_name);
  for (let i = 0; i < 5; i++) {
    const { data: exists } = await admin.from("facilities").select("id").eq("join_code", code).maybeSingle();
    if (!exists) break;
    code = generateJoinCode(facility_name);
  }

  const { data: fac, error: fErr } = await admin
    .from("facilities")
    .insert({ name: facility_name, join_code: code })
    .select()
    .single();
  if (fErr) {
    console.error("[signup] facility insert:", fErr);
    return NextResponse.json({ error: fErr.message }, { status: 500 });
  }

  const { error: mErr } = await admin
    .from("facility_members")
    .insert({ facility_id: fac.id, user_id: created.user.id, role: "owner" });
  if (mErr) {
    console.error("[signup] facility_members insert:", mErr);
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }

  // Attach the session cookie in the same response so the client is signed in.
  const ssr = createClient();
  const { error: sErr } = await ssr.auth.signInWithPassword({ email, password });
  if (sErr) {
    console.error("[signup] auto-signin:", sErr);
    return NextResponse.json({ error: sErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, facility: fac });
}
