import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth";
import FlagsList from "./flags-list";

export default async function Dashboard() {
  const { role, facilityId } = await getAuthContext();
  if (role !== "admin" || !facilityId) redirect("/login");
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
      <h1 className="text-2xl font-bold tracking-tight2 mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Stat label="Join code" value={facility?.join_code ?? "—"} mono />
        <Stat label="Active SOPs" value={String(activeSops)} />
        <Stat label="Drafts" value={String(draftSops)} />
        <Stat label="Operators" value={String((ops ?? []).length)} />
      </div>

      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-[17px] font-semibold">Documentation gaps</h2>
        <Link href="/settings" className="text-[13px] text-primary">
          Settings
        </Link>
      </div>
      <FlagsList flags={(flags ?? []) as any} />
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
