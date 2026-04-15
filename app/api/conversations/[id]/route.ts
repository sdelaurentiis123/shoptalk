import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: convo } = await supabase
    .from("conversations")
    .select("id, station_id, title")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!convo) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: messages } = await supabase
    .from("messages")
    .select("id, role, content, source_sop_id, source_step, created_at")
    .eq("conversation_id", params.id)
    .order("created_at", { ascending: true });

  return NextResponse.json({
    conversation: convo,
    messages: messages ?? [],
  });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("conversations")
    .delete()
    .eq("id", params.id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
