import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth";
import ChatInterface from "@/components/chat-interface";

export default async function ChatPage() {
  const { user, role, facilityId, language } = await getAuthContext();
  if (!user || !role || !facilityId) redirect("/login");
  const supabase = createClient();
  const [{ data: stations }, { data: sops }] = await Promise.all([
    supabase.from("stations").select("*").eq("facility_id", facilityId).order("sort_order"),
    supabase.from("sops").select("id, title").eq("facility_id", facilityId).eq("status", "active"),
  ]);
  const sopTitles: Record<string, string> = {};
  for (const s of sops ?? []) sopTitles[s.id] = s.title;
  return <ChatInterface lang={language} stations={stations ?? []} sopTitles={sopTitles} />;
}
