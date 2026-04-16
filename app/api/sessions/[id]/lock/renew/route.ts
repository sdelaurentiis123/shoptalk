import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await getAuthContext();
  if (!ctx.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  await admin
    .from("work_sessions")
    .update({ edit_lock_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("edit_lock_by", ctx.user.id);
  return NextResponse.json({ ok: true });
}
