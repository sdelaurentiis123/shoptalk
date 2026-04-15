import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/auth";
import SopDetail from "@/components/sop-detail";
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

  // Re-sign file URL if missing or expired.
  let signed = sop.file_url as string | null;
  if (sop.file_path) {
    const admin = createAdminClient();
    const { data } = await admin.storage.from("sop-files").createSignedUrl(sop.file_path, 60 * 60 * 24);
    signed = data?.signedUrl ?? signed;
  }

  const full = { ...sop, file_url: signed } as SopWithSteps;
  return <SopDetail sop={full} role={role} />;
}
