import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth";
import SopDetail from "@/components/sop-detail";
import { presignGet } from "@/lib/r2";
import type { SopWithSteps } from "@/lib/types";

export default async function SopPage({ params }: { params: { id: string } }) {
  const { role, facilityId } = await getAuthContext();
  if (!role || !facilityId) redirect("/login");

  const supabase = createClient();
  const { data: sop } = await supabase
    .from("sops")
    .select("*, steps(*, substeps(*))")
    .eq("id", params.id)
    .eq("facility_id", facilityId)
    .maybeSingle();
  if (!sop) notFound();

  // Mint a fresh R2 signed GET URL for playback on every view.
  let signed = sop.file_url as string | null;
  if (sop.file_path) {
    try {
      signed = await presignGet(sop.file_path, 60 * 60);
    } catch (e) {
      console.error("[sop-detail] presignGet failed:", e);
    }
  }

  const full = { ...sop, file_url: signed } as SopWithSteps;
  return <SopDetail sop={full} role={role} />;
}
