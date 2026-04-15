import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth";
import ChatInterface from "@/components/chat-interface";
import type { LangCode } from "@/lib/types";

export default async function ChatPage() {
  const { user, role, facilityId } = await getAuthContext();
  if (!user || !role || !facilityId) redirect("/login");
  const supabase = createClient();
  const [{ data: stations }, { data: sops }] = await Promise.all([
    supabase.from("stations").select("*").eq("facility_id", facilityId).order("sort_order"),
    supabase.from("sops").select("id, title").eq("facility_id", facilityId).eq("status", "active"),
  ]);
  let lang: LangCode = "en";
  if (role === "operator") {
    const { data: profile } = await supabase.from("operator_profiles").select("language").eq("user_id", user.id).maybeSingle();
    if (profile?.language) lang = profile.language as LangCode;
  }
  const sopTitles: Record<string, string> = {};
  for (const s of sops ?? []) sopTitles[s.id] = s.title;
  return <ChatInterface lang={lang} stations={stations ?? []} sopTitles={sopTitles} />;
}
