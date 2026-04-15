import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, role, language } = await getAuthContext();
  if (!user || !role) redirect("/login");

  let initial = user.email?.[0]?.toUpperCase() ?? "U";
  if (role === "operator") {
    const supabase = createClient();
    const { data } = await supabase
      .from("operator_profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data?.display_name) initial = data.display_name[0];
  }
  return (
    <>
      <Nav role={role} lang={language} initial={initial} />
      {children}
    </>
  );
}
