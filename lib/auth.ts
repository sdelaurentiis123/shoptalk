import { createClient } from "./supabase/server";
import type { Role } from "./types";

export async function getAuthContext() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, role: null as Role | null, facilityId: null as string | null };
  const role = ((user.user_metadata as any)?.role as Role | undefined) ?? null;

  let facilityId: string | null = null;
  if (role === "admin") {
    const { data } = await supabase.from("facilities").select("id").eq("admin_user_id", user.id).maybeSingle();
    facilityId = data?.id ?? null;
  } else if (role === "operator") {
    const metaFid = (user.user_metadata as any)?.facility_id as string | undefined;
    if (metaFid) facilityId = metaFid;
    else {
      const { data } = await supabase.from("operator_profiles").select("facility_id").eq("user_id", user.id).maybeSingle();
      facilityId = data?.facility_id ?? null;
    }
  }
  return { user, role, facilityId };
}
