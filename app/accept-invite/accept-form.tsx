"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function AcceptInviteForm({
  token,
  inviteEmail,
  currentEmail,
}: {
  token: string;
  inviteEmail: string;
  currentEmail: string | null;
}) {
  const router = useRouter();
  const signedInMatches = !!currentEmail && currentEmail.toLowerCase() === inviteEmail.toLowerCase();
  const signedInWrongEmail = !!currentEmail && !signedInMatches;

  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function acceptExisting() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/invites/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) return setError(data.error || "accept failed");
    router.push("/procedures");
    router.refresh();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    if (mode === "signup") {
      const res = await fetch("/api/auth/signup-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, password, token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "signup failed");
        setLoading(false);
        return;
      }
    } else {
      const supabase = createClient();
      const { error: lErr } = await supabase.auth.signInWithPassword({ email: inviteEmail, password });
      if (lErr) {
        setError(lErr.message);
        setLoading(false);
        return;
      }
    }
    const acc = await fetch("/api/invites/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const accData = await acc.json();
    setLoading(false);
    if (!acc.ok) return setError(accData.error || "accept failed");
    router.push("/procedures");
    router.refresh();
  }

  if (signedInWrongEmail) {
    return (
      <div className="text-[13px]">
        <div className="text-danger mb-3">
          You&rsquo;re signed in as <strong>{currentEmail}</strong>, but this invite is for{" "}
          <strong>{inviteEmail}</strong>.
        </div>
        <Link href="/login" className="text-primary">Sign in with a different account</Link>
      </div>
    );
  }

  if (signedInMatches) {
    return (
      <button
        onClick={acceptExisting}
        disabled={loading}
        className="w-full bg-primary text-white rounded-full py-2.5 text-[14px] font-medium"
      >
        {loading ? "Joining\u2026" : "Accept invite"}
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="flex gap-2 mb-4 text-[13px]">
        <button
          type="button"
          onClick={() => setMode("signup")}
          className={`px-3 py-1 rounded-full ${mode === "signup" ? "bg-text-primary text-white" : "text-text-secondary"}`}
        >
          Create account
        </button>
        <button
          type="button"
          onClick={() => setMode("login")}
          className={`px-3 py-1 rounded-full ${mode === "login" ? "bg-text-primary text-white" : "text-text-secondary"}`}
        >
          I have an account
        </button>
      </div>
      <label className="block text-[13px] font-medium text-text-secondary mb-1.5">Email</label>
      <input
        value={inviteEmail}
        disabled
        className="w-full px-3 py-2.5 border border-border rounded-lg text-[14px] outline-none mb-4 bg-background"
      />
      <label className="block text-[13px] font-medium text-text-secondary mb-1.5">Password</label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={8}
        className="w-full px-3 py-2.5 border border-border rounded-lg text-[14px] outline-none mb-5"
      />
      {error && <div className="text-[13px] text-danger mb-4">{error}</div>}
      <button disabled={loading} className="w-full bg-primary text-white rounded-full py-2.5 text-[14px] font-medium">
        {loading ? "Joining\u2026" : mode === "signup" ? "Create & join" : "Sign in & join"}
      </button>
    </form>
  );
}
