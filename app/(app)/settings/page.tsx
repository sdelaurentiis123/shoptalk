import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth";
import SettingsForm from "./settings-form";

export default async function Settings() {
  const { role, facilityId } = await getAuthContext();
  if (role !== "admin" || !facilityId) redirect("/login");
  const supabase = createClient();
  const [{ data: facility }, { data: stations }] = await Promise.all([
    supabase.from("facilities").select("*").eq("id", facilityId).maybeSingle(),
    supabase.from("stations").select("*").eq("facility_id", facilityId).order("sort_order"),
  ]);
  return <SettingsForm facility={facility as any} stations={stations ?? []} />;
}
