"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { t } from "@/lib/i18n";
import type { LangCode } from "@/lib/types";

export default function LoginForm({ lang }: { lang: LangCode }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setError(error.message);
    router.push("/procedures");
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <form onSubmit={onSubmit} className="w-full max-w-[360px] bg-surface rounded-2xl shadow-card border border-border p-7">
        <h1 className="text-[22px] font-bold tracking-tight2 mb-6">{t(lang, "signIn")}</h1>
        <label className="block text-[13px] font-medium text-text-secondary mb-1.5">{t(lang, "email")}</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required className="w-full px-3 py-2.5 border border-border rounded-lg text-[14px] outline-none mb-4" />
        <label className="block text-[13px] font-medium text-text-secondary mb-1.5">{t(lang, "password")}</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required className="w-full px-3 py-2.5 border border-border rounded-lg text-[14px] outline-none mb-5" />
        {error && <div className="text-[13px] text-danger mb-4">{error}</div>}
        <button disabled={loading} className="w-full bg-primary text-white rounded-full py-2.5 text-[14px] font-medium">
          {loading ? t(lang, "signingIn") : t(lang, "signIn")}
        </button>
        <div className="text-[13px] text-text-secondary mt-4 text-center">
          {t(lang, "noAccount")} <Link href="/signup" className="text-primary">{t(lang, "startFacility")}</Link>
        </div>
      </form>
    </main>
  );
}
