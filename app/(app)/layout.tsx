import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/nav";
import type { LangCode } from "@/lib/types";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, role, facilityId } = await getAuthContext();
  if (!user || !role) redirect("/login");
  if (!facilityId) {
    // Admin with no facility row (shouldn't happen post-signup) — let them through to dashboard which'll show an error.
  }
  let lang: LangCode = "en";
  let initial = user.email?.[0]?.toUpperCase() ?? "U";
  if (role === "operator") {
    const supabase = createClient();
    const { data } = await supabase.from("operator_profiles").select("language, display_name").eq("user_id", user.id).maybeSingle();
    if (data?.language) lang = data.language as LangCode;
    if (data?.display_name) initial = data.display_name[0];
  }
  return (
    <>
      <Nav role={role} lang={lang} initial={initial} />
      {children}
    </>
  );
}
