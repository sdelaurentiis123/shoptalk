import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth";
import { t } from "@/lib/i18n";

export default async function Profile() {
  const { user, role, facilityId, language } = await getAuthContext();
  if (!user || !role) redirect("/login");

  const supabase = createClient();
  let displayName: string | null = null;
  let facilityName = "";

  if (role === "operator") {
    const { data } = await supabase
      .from("operator_profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle();
    displayName = data?.display_name ?? null;
  }
  if (facilityId) {
    const { data } = await supabase.from("facilities").select("name").eq("id", facilityId).maybeSingle();
    facilityName = data?.name ?? "";
  }

  return (
    <div className="max-w-[560px] mx-auto px-7 py-8">
      <h1 className="text-2xl font-bold tracking-tight2 mb-6">{t(language, "profile")}</h1>
      <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
        <Row label={t(language, "facility")} value={facilityName || "—"} />
        <Row label={t(language, "role")} value={role === "admin" ? t(language, "adminRole") : t(language, "operatorRole")} />
        {role === "admin" && user.email && <Row label={t(language, "email")} value={user.email} />}
        {role === "operator" && displayName && <Row label={t(language, "displayName")} value={displayName} />}
        <Row label={t(language, "language")} value={language === "es" ? "Español" : "English"} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center gap-4">
      <div className="text-[13px] text-text-secondary">{label}</div>
      <div className="text-[14px] font-medium">{value}</div>
    </div>
  );
}
