import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import MembersClient from "./members-client";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const { user, role, facilityId, isPlatformAdmin } = await getAuthContext();
  if (!user || (role !== "admin" && !isPlatformAdmin) || !facilityId) redirect("/login");

  const admin = createAdminClient();

  const { data: members } = await admin
    .from("facility_members")
    .select("user_id, role, created_at")
    .eq("facility_id", facilityId)
    .order("created_at");

  const userIds = (members ?? []).map((m) => m.user_id);
  const emails: Record<string, string> = {};
  for (const id of userIds) {
    const { data } = await admin.auth.admin.getUserById(id);
    if (data?.user?.email) emails[id] = data.user.email;
  }

  const { data: invites } = await admin
    .from("facility_invites")
    .select("id, email, role, created_at, expires_at, accepted_at, token")
    .eq("facility_id", facilityId)
    .is("accepted_at", null)
    .order("created_at", { ascending: false });

  const myMembership = (members ?? []).find((m) => m.user_id === user.id);
  const canInvite = isPlatformAdmin || myMembership?.role === "owner";

  return (
    <MembersClient
      me={user.id}
      facilityId={facilityId}
      canInvite={canInvite}
      members={(members ?? []).map((m) => ({
        user_id: m.user_id as string,
        role: m.role as "owner" | "admin",
        email: emails[m.user_id as string] ?? "(unknown)",
        created_at: m.created_at as string,
      }))}
      invites={(invites ?? []).map((i) => ({
        id: i.id as string,
        email: i.email as string,
        role: i.role as "owner" | "admin",
        expires_at: i.expires_at as string,
        token: i.token as string,
      }))}
    />
  );
}
