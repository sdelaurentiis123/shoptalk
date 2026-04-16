import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user, role, facilityId, isPlatformAdmin } = await getAuthContext();
  if (!user || (role !== "admin" && !isPlatformAdmin) || !facilityId)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const message = String(body?.message ?? "").trim();
  if (!message) return NextResponse.json({ error: "missing message" }, { status: 400 });

  const admin = createAdminClient();
  const { data: session } = await admin
    .from("work_sessions")
    .select("raw_transcript, title, summary, notes, total_seconds")
    .eq("id", params.id)
    .eq("facility_id", facilityId)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: "not found" }, { status: 404 });

  const transcript = (session.raw_transcript as any[]) ?? [];
  const transcriptText = transcript
    .map((b: any) => `[${b.timeSeconds}s] ${b.text}`)
    .join("\n");

  const anthropic = new Anthropic();
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: `You are an assistant helping review a ${Math.round((session.total_seconds ?? 0) / 60)}-minute work session video titled "${session.title}". You have access to the full timestamped transcript below. Answer questions concisely and reference specific timestamps when relevant.\n\nTranscript:\n${transcriptText}`,
    messages: [{ role: "user", content: message }],
  });

  const reply = msg.content.find((c) => c.type === "text")?.text ?? "";
  return NextResponse.json({ reply });
}
