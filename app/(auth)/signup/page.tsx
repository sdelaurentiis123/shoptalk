"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Signup() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [facility, setFacility] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, facility_name: facility }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) return setError(data.error || "Signup failed");
    router.push("/procedures");
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <form onSubmit={onSubmit} className="w-full max-w-[380px] bg-surface rounded-2xl shadow-card border border-border p-7">
        <h1 className="text-[22px] font-bold tracking-tight2 mb-6">Start a facility</h1>
        <label className="block text-[13px] font-medium text-text-secondary mb-1.5">Facility name</label>
        <input value={facility} onChange={(e) => setFacility(e.target.value)} required className="w-full px-3 py-2.5 border border-border rounded-lg text-[14px] outline-none mb-4" />
        <label className="block text-[13px] font-medium text-text-secondary mb-1.5">Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required className="w-full px-3 py-2.5 border border-border rounded-lg text-[14px] outline-none mb-4" />
        <label className="block text-[13px] font-medium text-text-secondary mb-1.5">Password</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required minLength={8} className="w-full px-3 py-2.5 border border-border rounded-lg text-[14px] outline-none mb-5" />
        {error && <div className="text-[13px] text-danger mb-4">{error}</div>}
        <button disabled={loading} className="w-full bg-primary text-white rounded-full py-2.5 text-[14px] font-medium">
          {loading ? "Creating…" : "Create account"}
        </button>
        <div className="text-[13px] text-text-secondary mt-4 text-center">
          Have an account? <Link href="/login" className="text-primary">Sign in</Link>
        </div>
      </form>
    </main>
  );
}
