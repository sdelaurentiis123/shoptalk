import { createClient } from "./supabase/server";
import type { LangCode, Role } from "./types";

export async function getAuthContext() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { user: null, role: null as Role | null, facilityId: null as string | null, language: "en" as LangCode };
  }
  const role = ((user.user_metadata as any)?.role as Role | undefined) ?? null;

  let facilityId: string | null = null;
  let language: LangCode = "en";

  if (role === "admin") {
    const { data } = await supabase
      .from("facilities")
      .select("id, default_language")
      .eq("admin_user_id", user.id)
      .maybeSingle();
    facilityId = data?.id ?? null;
    language = ((data?.default_language as LangCode | undefined) ?? "en");
  } else if (role === "operator") {
    const metaFid = (user.user_metadata as any)?.facility_id as string | undefined;
    facilityId = metaFid ?? null;
    const { data } = await supabase
      .from("operator_profiles")
      .select("facility_id, language")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!facilityId) facilityId = data?.facility_id ?? null;
    language = ((data?.language as LangCode | undefined) ?? "en");
  }
  return { user, role, facilityId, language };
}
