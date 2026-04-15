import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/auth";
import AcceptInviteForm from "./accept-form";

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = (searchParams.token ?? "").trim();
  if (!token) redirect("/login");

  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("facility_invites")
    .select("id, facility_id, email, role, expires_at, accepted_at, facilities(name)")
    .eq("token", token)
    .maybeSingle();

  if (!invite) return <InviteError message="This invite link is invalid." />;
  if (invite.accepted_at) return <InviteError message="This invite has already been used." />;
  if (new Date(invite.expires_at).getTime() < Date.now())
    return <InviteError message="This invite has expired." />;

  const workspaceName = (invite as any).facilities?.name ?? "Workspace";
  const ctx = await getAuthContext();

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-[420px] bg-surface rounded-2xl shadow-card border border-border p-7">
        <h1 className="text-[22px] font-bold tracking-tight2 mb-2">Join {workspaceName}</h1>
        <p className="text-[13px] text-text-secondary mb-5">
          You&rsquo;ve been invited as <strong>{invite.role}</strong> to <strong>{workspaceName}</strong>.
          This invite is for <strong>{invite.email}</strong>.
        </p>
        <AcceptInviteForm
          token={token}
          inviteEmail={invite.email as string}
          currentEmail={ctx.user?.email ?? null}
        />
      </div>
    </main>
  );
}

function InviteError({ message }: { message: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-[420px] bg-surface rounded-2xl shadow-card border border-border p-7 text-center">
        <h1 className="text-[18px] font-semibold mb-2">Invite unavailable</h1>
        <p className="text-[13px] text-text-secondary">{message}</p>
      </div>
    </main>
  );
}
