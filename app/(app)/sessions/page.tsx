import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import SessionsClient from "./sessions-client";

export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  const { user, role, facilityId, isPlatformAdmin, language } = await getAuthContext();
  if (!user || (role !== "admin" && !isPlatformAdmin) || !facilityId) redirect("/login");

  const admin = createAdminClient();
  const [{ data: sessions }, { data: stations }] = await Promise.all([
    admin
      .from("work_sessions")
      .select("id, title, summary, total_seconds, processing_status, created_at, station_id")
      .eq("facility_id", facilityId)
      .order("created_at", { ascending: false }),
    admin
      .from("stations")
      .select("*")
      .eq("facility_id", facilityId)
      .order("sort_order"),
  ]);

  return (
    <SessionsClient
      sessions={(sessions ?? []) as any[]}
      stations={(stations ?? []) as any[]}
      facilityId={facilityId}
      lang={language}
    />
  );
}
