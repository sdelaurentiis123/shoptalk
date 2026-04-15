import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import PlatformClient from "./platform-client";

export const dynamic = "force-dynamic";

export default async function PlatformPage() {
  const { user, isPlatformAdmin } = await getAuthContext();
  if (!user) redirect("/login");
  if (!isPlatformAdmin) redirect("/procedures");

  const admin = createAdminClient();
  const { data: facilities } = await admin
    .from("facilities")
    .select("id, name, join_code, created_at")
    .order("created_at", { ascending: false });

  const rows = facilities ?? [];
  const ids = rows.map((f) => f.id);
  const counts: Record<string, { members: number; sops: number }> = {};
  for (const id of ids) counts[id] = { members: 0, sops: 0 };
  if (ids.length > 0) {
    const [membersRes, sopsRes] = await Promise.all([
      admin.from("facility_members").select("facility_id").in("facility_id", ids),
      admin.from("sops").select("facility_id").in("facility_id", ids),
    ]);
    for (const m of membersRes.data ?? []) counts[m.facility_id as string].members++;
    for (const s of sopsRes.data ?? []) counts[s.facility_id as string].sops++;
  }

  return (
    <PlatformClient
      facilities={rows.map((f) => ({
        id: f.id as string,
        name: f.name as string,
        join_code: f.join_code as string,
        created_at: f.created_at as string,
        members: counts[f.id as string]?.members ?? 0,
        sops: counts[f.id as string]?.sops ?? 0,
      }))}
    />
  );
}
