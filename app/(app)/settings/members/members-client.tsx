"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Member {
  user_id: string;
  role: "owner" | "admin";
  email: string;
  created_at: string;
}
interface Invite {
  id: string;
  email: string;
  role: "owner" | "admin";
  expires_at: string;
  token: string;
}

export default function MembersClient({
  me,
  facilityId,
  canInvite,
  members,
  invites: initialInvites,
}: {
  me: string;
  facilityId: string;
  canInvite: boolean;
  members: Member[];
  invites: Invite[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [invites, setInvites] = useState(initialInvites);
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role: "admin" }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) return setError(data.error || "invite failed");
    setInvites([data.invite, ...invites]);
    setLastLink(data.url);
    setEmail("");
  }

  async function revoke(id: string) {
    const res = await fetch(`/api/invites/${id}/revoke`, { method: "POST" });
    if (res.ok) setInvites(invites.filter((i) => i.id !== id));
  }

  function linkFor(token: string) {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/accept-invite?token=${token}`;
  }

  return (
    <main className="max-w-[720px] mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/settings" className="text-[13px] text-text-secondary">&larr; Settings</Link>
      </div>
      <h1 className="text-[22px] font-bold tracking-tight2 mb-6">Workspace members</h1>

      <section className="bg-surface rounded-2xl shadow-card border border-border p-6 mb-6">
        <h2 className="text-[15px] font-semibold mb-3">Members</h2>
        <div className="divide-y divide-border">
          {members.map((m) => (
            <div key={m.user_id} className="flex items-center justify-between py-3 text-[14px]">
              <div>
                <div className="font-medium">{m.email}{m.user_id === me ? " (you)" : ""}</div>
                <div className="text-[12px] text-text-secondary">Joined {new Date(m.created_at).toLocaleDateString()}</div>
              </div>
              <span className="text-[11px] uppercase tracking-wide text-text-secondary">{m.role}</span>
            </div>
          ))}
        </div>
      </section>

      {canInvite && (
        <section className="bg-surface rounded-2xl shadow-card border border-border p-6 mb-6">
          <h2 className="text-[15px] font-semibold mb-3">Invite admin</h2>
          <form onSubmit={sendInvite} className="flex gap-2 mb-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="person@example.com"
              className="flex-1 px-3 py-2 border border-border rounded-lg text-[14px] outline-none"
            />
            <button
              disabled={loading}
              className="px-4 py-2 bg-primary text-white rounded-lg text-[13px] font-medium disabled:opacity-60"
            >
              {loading ? "Sending\u2026" : "Create invite"}
            </button>
          </form>
          {error && <div className="text-[13px] text-danger mb-2">{error}</div>}
          {lastLink && (
            <div className="text-[13px] bg-primary-bg text-primary rounded-lg p-3 break-all">
              Share this invite link: <br />
              <code className="text-[12px]">{lastLink}</code>
            </div>
          )}
          <p className="text-[12px] text-text-secondary mt-3">
            The link expires in 7 days and can only be used by <em>the invited email address</em>.
          </p>
        </section>
      )}

      {invites.length > 0 && (
        <section className="bg-surface rounded-2xl shadow-card border border-border p-6">
          <h2 className="text-[15px] font-semibold mb-3">Pending invites</h2>
          <div className="divide-y divide-border">
            {invites.map((i) => (
              <div key={i.id} className="flex items-center justify-between py-3 text-[14px]">
                <div>
                  <div className="font-medium">{i.email}</div>
                  <div className="text-[12px] text-text-secondary">Expires {new Date(i.expires_at).toLocaleDateString()}</div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => navigator.clipboard.writeText(linkFor(i.token))}
                    className="text-[12px] text-primary"
                  >
                    Copy link
                  </button>
                  {canInvite && (
                    <button onClick={() => revoke(i.id)} className="text-[12px] text-danger">
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
