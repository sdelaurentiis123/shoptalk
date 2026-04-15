import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth";
import SopDetail from "@/components/sop-detail";
import { presignGet } from "@/lib/r2";
import type { SopWithSteps } from "@/lib/types";

export default async function SopPage({ params }: { params: { id: string } }) {
  const { role, facilityId, language } = await getAuthContext();
  if (!role || !facilityId) redirect("/login");

  const supabase = createClient();
  const [{ data: sop }, { data: stations }] = await Promise.all([
    supabase
      .from("sops")
      .select("*, steps(*, substeps(*))")
      .eq("id", params.id)
      .eq("facility_id", facilityId)
      .maybeSingle(),
    supabase.from("stations").select("*").eq("facility_id", facilityId).order("sort_order"),
  ]);
  if (!sop) notFound();

  let signed = sop.file_url as string | null;
  if (sop.file_path) {
    try {
      signed = await presignGet(sop.file_path, 60 * 60);
    } catch (e) {
      console.error("[sop-detail] presignGet failed:", e);
    }
  }

  const full = { ...sop, file_url: signed } as SopWithSteps;
  return <SopDetail sop={full} role={role} stations={stations ?? []} lang={language} />;
}
