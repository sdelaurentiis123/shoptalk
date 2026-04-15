import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getAuthContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx.user || !ctx.facilityId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const role = (body?.role as string) === "owner" ? "owner" : "admin";
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "invalid email" }, { status: 400 });

  const admin = createAdminClient();

  // Only owners (or platform admins) can invite.
  const canInvite =
    ctx.isPlatformAdmin ||
    (await admin
      .from("facility_members")
      .select("role")
      .eq("facility_id", ctx.facilityId)
      .eq("user_id", ctx.user.id)
      .maybeSingle()
      .then(({ data }) => data?.role === "owner"));
  if (!canInvite) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const token = randomBytes(32).toString("base64url");
  const { data: invite, error } = await admin
    .from("facility_invites")
    .insert({
      facility_id: ctx.facilityId,
      email,
      role,
      token,
      invited_by: ctx.user.id,
    })
    .select()
    .single();
  if (error || !invite) {
    console.error("[invites] insert:", error);
    return NextResponse.json({ error: error?.message ?? "insert failed" }, { status: 500 });
  }

  const origin = req.headers.get("origin") || new URL(req.url).origin;
  const url = `${origin}/accept-invite?token=${token}`;
  return NextResponse.json({ ok: true, invite, url });
}

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx.user || !ctx.facilityId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data: invites } = await admin
    .from("facility_invites")
    .select("id, email, role, created_at, expires_at, accepted_at, token")
    .eq("facility_id", ctx.facilityId)
    .order("created_at", { ascending: false });
  return NextResponse.json({ invites: invites ?? [] });
}
