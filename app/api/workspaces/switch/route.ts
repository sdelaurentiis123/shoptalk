import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthContext, ACTIVE_FACILITY_COOKIE } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const facilityId = String(body?.facility_id ?? "").trim();
  if (!facilityId) return NextResponse.json({ error: "missing facility_id" }, { status: 400 });

  const allowed =
    ctx.facilityIds.includes(facilityId) ||
    (ctx.isPlatformAdmin && (await facilityExists(facilityId)));
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  cookies().set({
    name: ACTIVE_FACILITY_COOKIE,
    value: facilityId,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });
  return NextResponse.json({ ok: true });
}

async function facilityExists(id: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin.from("facilities").select("id").eq("id", id).maybeSingle();
  return !!data;
}
