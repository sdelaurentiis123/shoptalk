import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import SessionViewer from "@/components/session-viewer";

export const dynamic = "force-dynamic";

export default async function SessionPage({ params }: { params: { id: string } }) {
  const { user, role, facilityId, isPlatformAdmin, language } = await getAuthContext();
  if (!user || (role !== "admin" && !isPlatformAdmin) || !facilityId) redirect("/login");

  const admin = createAdminClient();
  const { data: session } = await admin
    .from("work_sessions")
    .select("*")
    .eq("id", params.id)
    .eq("facility_id", facilityId)
    .maybeSingle();
  if (!session) redirect("/sessions");

  const [{ data: topics }, { data: keyPoints }] = await Promise.all([
    admin.from("session_topics").select("*").eq("session_id", params.id).order("sort_order"),
    admin.from("session_key_points").select("*").eq("session_id", params.id).order("sort_order"),
  ]);

  return (
    <SessionViewer
      session={session as any}
      topics={(topics ?? []) as any[]}
      keyPoints={(keyPoints ?? []) as any[]}
      lang={language}
    />
  );
}
