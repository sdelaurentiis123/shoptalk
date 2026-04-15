import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/auth";
import { answerChat } from "@/lib/claude";
import type { LangCode, SopWithSteps } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Simple in-memory rate limit: 20 msgs / minute per user.
const buckets = new Map<string, { count: number; resetAt: number }>();
function rateOk(userId: string) {
  const now = Date.now();
  const b = buckets.get(userId);
  if (!b || now > b.resetAt) {
    buckets.set(userId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (b.count >= 20) return false;
  b.count++;
  return true;
}

export async function POST(req: Request) {
  const { user, role, facilityId } = await getAuthContext();
  if (!user || !role || !facilityId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!rateOk(user.id)) return NextResponse.json({ error: "rate limit" }, { status: 429 });

  const body = await req.json().catch(() => null);
  if (!body?.message) return NextResponse.json({ error: "missing message" }, { status: 400 });
  const message = String(body.message).slice(0, 2000);
  const conversationId = (body.conversation_id as string | undefined) ?? null;
  const stationId = (body.station_id as string | undefined) ?? null;
  const language: LangCode = (body.language as LangCode) ?? "en";

  const ssr = createClient();
  const admin = createAdminClient();

  // Get or create conversation.
  let convoId = conversationId;
  if (!convoId) {
    const { data: c, error } = await ssr
      .from("conversations")
      .insert({ user_id: user.id, facility_id: facilityId, station_id: stationId, title: message.slice(0, 60) })
      .select("id")
      .single();
    if (error || !c) return NextResponse.json({ error: error?.message ?? "convo create failed" }, { status: 500 });
    convoId = c.id;
  }

  // Load SOPs (admin client for simplicity; facility-scoped).
  let sopsQuery = admin
    .from("sops")
    .select("*, steps(*, substeps(*))")
    .eq("facility_id", facilityId)
    .eq("status", "active");
  if (stationId) sopsQuery = sopsQuery.eq("station_id", stationId);
  const { data: sops, error: sErr } = await sopsQuery;
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

  const { data: facility } = await admin.from("facilities").select("name").eq("id", facilityId).maybeSingle();

  // History
  const { data: history } = await ssr
    .from("messages")
    .select("role, content")
    .eq("conversation_id", convoId)
    .order("created_at", { ascending: true })
    .limit(20);

  let reply;
  try {
    reply = await answerChat({
      facilityName: facility?.name ?? "your facility",
      language,
      sops: (sops ?? []) as unknown as SopWithSteps[],
      history: (history ?? []) as any,
      userMessage: message,
    });
  } catch (e: any) {
    return NextResponse.json({ error: `claude: ${e.message}` }, { status: 500 });
  }

  // Persist messages (as the user so RLS conv_self applies).
  await ssr.from("messages").insert({ conversation_id: convoId, role: "user", content: message });
  const { data: asst } = await ssr
    .from("messages")
    .insert({
      conversation_id: convoId,
      role: "assistant",
      content: reply.text,
      source_sop_id: reply.sourceSopId,
      source_step: reply.sourceStep,
    })
    .select()
    .single();

  return NextResponse.json({
    conversation_id: convoId,
    message: asst,
  });
}
