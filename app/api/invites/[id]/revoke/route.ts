import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await getAuthContext();
  if (!ctx.user || !ctx.facilityId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("facility_invites")
    .select("facility_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!invite) return NextResponse.json({ error: "not found" }, { status: 404 });

  const canRevoke =
    ctx.isPlatformAdmin ||
    (await admin
      .from("facility_members")
      .select("role")
      .eq("facility_id", invite.facility_id)
      .eq("user_id", ctx.user.id)
      .maybeSingle()
      .then(({ data }) => data?.role === "owner"));
  if (!canRevoke) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { error } = await admin.from("facility_invites").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
