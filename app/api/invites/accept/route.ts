import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthContext, ACTIVE_FACILITY_COOKIE } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const token = String(body?.token ?? "").trim();
  if (!token) return NextResponse.json({ error: "missing token" }, { status: 400 });

  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("facility_invites")
    .select("id, facility_id, email, role, expires_at, accepted_at")
    .eq("token", token)
    .maybeSingle();
  if (!invite) return NextResponse.json({ error: "invalid invite" }, { status: 404 });
  if (invite.accepted_at) return NextResponse.json({ error: "already accepted" }, { status: 409 });
  if (new Date(invite.expires_at).getTime() < Date.now())
    return NextResponse.json({ error: "invite expired" }, { status: 410 });

  const userEmail = (ctx.user.email ?? "").toLowerCase();
  if (userEmail !== String(invite.email).toLowerCase()) {
    return NextResponse.json(
      { error: `invite is for ${invite.email}; you are signed in as ${userEmail}` },
      { status: 403 },
    );
  }

  const { error: mErr } = await admin
    .from("facility_members")
    .upsert(
      {
        facility_id: invite.facility_id,
        user_id: ctx.user.id,
        role: invite.role,
        invited_by: null,
      },
      { onConflict: "facility_id,user_id" },
    );
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

  await admin.from("facility_invites").update({ accepted_at: new Date().toISOString() }).eq("id", invite.id);

  // Ensure the user has admin role metadata so the existing route guards pass.
  if (ctx.role !== "admin") {
    await admin.auth.admin.updateUserById(ctx.user.id, {
      user_metadata: { role: "admin" },
    });
  }

  cookies().set({
    name: ACTIVE_FACILITY_COOKIE,
    value: invite.facility_id,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });

  return NextResponse.json({ ok: true, facility_id: invite.facility_id });
}
