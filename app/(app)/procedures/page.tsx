import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth";
import LibraryView from "@/components/library-view";

export default async function ProceduresPage() {
  const { role, facilityId, language } = await getAuthContext();
  if (!role || !facilityId) redirect("/login");

  const supabase = createClient();
  const [{ data: sops }, { data: stations }] = await Promise.all([
    supabase.from("sops").select("*, steps(id)").eq("facility_id", facilityId).order("created_at", { ascending: false }),
    supabase.from("stations").select("*").eq("facility_id", facilityId).order("sort_order"),
  ]);

  const sopList = (sops ?? []).map((s: any) => ({ ...s, stepCount: s.steps?.length ?? 0 }));
  return <LibraryView sops={sopList} stations={stations ?? []} role={role} facilityId={facilityId} lang={language} />;
}
