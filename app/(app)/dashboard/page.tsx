import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth";
import { t } from "@/lib/i18n";
import FlagsList from "./flags-list";

export default async function Dashboard() {
  const { role, facilityId, language, isPlatformAdmin } = await getAuthContext();
  if ((role !== "admin" && !isPlatformAdmin) || !facilityId) redirect("/login");
  const supabase = createClient();
  const [{ data: facility }, { data: sops }, { data: ops }, { data: flags }] = await Promise.all([
    supabase.from("facilities").select("*").eq("id", facilityId).maybeSingle(),
    supabase.from("sops").select("id, status").eq("facility_id", facilityId),
    supabase.from("operator_profiles").select("id").eq("facility_id", facilityId),
    supabase.from("flags").select("*, sops(title)").eq("facility_id", facilityId).order("created_at", { ascending: false }),
  ]);

  const activeSops = (sops ?? []).filter((s) => s.status === "active").length;
  const draftSops = (sops ?? []).filter((s) => s.status === "draft").length;

  return (
    <div className="max-w-[960px] mx-auto px-7 py-8">
      <h1 className="text-2xl font-bold tracking-tight2 mb-6">{t(language, "dashboardTitle")}</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Stat label={t(language, "joinCode")} value={facility?.join_code ?? "—"} mono />
        <Stat label={t(language, "activeSops")} value={String(activeSops)} />
        <Stat label={t(language, "drafts")} value={String(draftSops)} />
        <Stat label={t(language, "operators")} value={String((ops ?? []).length)} />
      </div>

      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-[17px] font-semibold">{t(language, "docGaps")}</h2>
      </div>
      <FlagsList flags={(flags ?? []) as any} lang={language} />
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-surface rounded-xl border border-border p-4">
      <div className="text-[12px] text-text-tertiary mb-1">{label}</div>
      <div className={`text-[18px] font-semibold ${mono ? "tabular-nums" : ""}`}>{value}</div>
    </div>
  );
}
