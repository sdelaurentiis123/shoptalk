import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth";
import ChatInterface from "@/components/chat-interface";

export default async function ChatPage() {
  const { user, role, facilityId, language } = await getAuthContext();
  if (!user || !role || !facilityId) redirect("/login");
  const supabase = createClient();

  const [{ data: stations }, { data: sops }, { data: latest }] = await Promise.all([
    supabase.from("stations").select("*").eq("facility_id", facilityId).order("sort_order"),
    supabase.from("sops").select("id, title").eq("facility_id", facilityId).eq("status", "active"),
    supabase
      .from("conversations")
      .select("id, station_id")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  let initialMessages: {
    id: string;
    role: "user" | "assistant";
    content: string;
    source_sop_id: string | null;
    source_step: string | null;
  }[] = [];
  let initialConversationId: string | null = null;
  let initialStationId: string | null = null;

  if (latest?.id) {
    initialConversationId = latest.id;
    initialStationId = latest.station_id ?? null;
    const { data: msgs } = await supabase
      .from("messages")
      .select("id, role, content, source_sop_id, source_step")
      .eq("conversation_id", latest.id)
      .order("created_at", { ascending: true });
    initialMessages = (msgs ?? []) as any;
  }

  const sopTitles: Record<string, string> = {};
  for (const s of sops ?? []) sopTitles[s.id] = s.title;

  return (
    <ChatInterface
      lang={language}
      stations={stations ?? []}
      sopTitles={sopTitles}
      initialMessages={initialMessages}
      initialConversationId={initialConversationId}
      initialStationId={initialStationId}
    />
  );
}
