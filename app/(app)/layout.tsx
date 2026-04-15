import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Nav from "@/components/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, role, facilityId, facilityIds, isPlatformAdmin, language } = await getAuthContext();
  if (!user) redirect("/login");
  const effectiveRole = role ?? (isPlatformAdmin ? "admin" : null);
  if (!effectiveRole) redirect("/login");

  let initial = user.email?.[0]?.toUpperCase() ?? "U";
  if (effectiveRole === "operator") {
    const supabase = createClient();
    const { data } = await supabase
      .from("operator_profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data?.display_name) initial = data.display_name[0];
  }

  let workspaces: { id: string; name: string }[] = [];
  let allWorkspaces: { id: string; name: string }[] | undefined;
  let current: { id: string; name: string } | null = null;
  if (effectiveRole === "admin") {
    const admin = createAdminClient();
    if (facilityIds.length > 0) {
      const { data } = await admin
        .from("facilities")
        .select("id, name")
        .in("id", facilityIds);
      workspaces = data ?? [];
    }
    if (isPlatformAdmin) {
      const { data } = await admin.from("facilities").select("id, name").order("name");
      allWorkspaces = data ?? [];
    }
    const pool = [...workspaces, ...(allWorkspaces ?? [])];
    current = pool.find((w) => w.id === facilityId) ?? null;
  }

  return (
    <>
      <Nav
        role={effectiveRole}
        lang={language}
        initial={initial}
        isPlatformAdmin={isPlatformAdmin}
        workspace={current}
        workspaces={workspaces}
        allWorkspaces={allWorkspaces}
      />
      {children}
    </>
  );
}
