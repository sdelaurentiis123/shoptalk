import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  const token = String(body?.token ?? "").trim();
  if (!email || !password || !token) return NextResponse.json({ error: "missing fields" }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "password must be at least 8 characters" }, { status: 400 });

  const admin = createAdminClient();

  const { data: invite } = await admin
    .from("facility_invites")
    .select("email, expires_at, accepted_at")
    .eq("token", token)
    .maybeSingle();
  if (!invite) return NextResponse.json({ error: "invalid invite" }, { status: 404 });
  if (invite.accepted_at) return NextResponse.json({ error: "already accepted" }, { status: 409 });
  if (new Date(invite.expires_at).getTime() < Date.now()) return NextResponse.json({ error: "invite expired" }, { status: 410 });
  if (email !== String(invite.email).toLowerCase())
    return NextResponse.json({ error: `invite is for ${invite.email}` }, { status: 403 });

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: "admin" },
  });
  if (error || !created?.user) {
    return NextResponse.json({ error: error?.message ?? "signup failed" }, { status: 400 });
  }

  const ssr = createClient();
  const { error: sErr } = await ssr.auth.signInWithPassword({ email, password });
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
