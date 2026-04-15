"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LANGUAGES } from "@/lib/i18n";
import type { LangCode } from "@/lib/types";

export default function Join() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [lang, setLang] = useState<LangCode>("en");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/facilities/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ join_code: code.trim().toUpperCase(), display_name: name, language: lang }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) return setError(data.error || "Join failed");
    router.push("/chat");
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <form onSubmit={onSubmit} className="w-full max-w-[380px] bg-surface rounded-2xl shadow-card border border-border p-7">
        <h1 className="text-[22px] font-bold tracking-tight2 mb-6">Join your facility</h1>
        <label className="block text-[13px] font-medium text-text-secondary mb-1.5">Join code</label>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="DAMASCUS-1234" required className="w-full px-3 py-2.5 border border-border rounded-lg text-[14px] outline-none mb-4 uppercase tracking-wider" />
        <label className="block text-[13px] font-medium text-text-secondary mb-1.5">Your name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jorge A." required className="w-full px-3 py-2.5 border border-border rounded-lg text-[14px] outline-none mb-4" />
        <label className="block text-[13px] font-medium text-text-secondary mb-1.5">Language</label>
        <select value={lang} onChange={(e) => setLang(e.target.value as LangCode)} className="w-full px-3 py-2.5 border border-border rounded-lg text-[14px] outline-none mb-5 bg-surface">
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
        {error && <div className="text-[13px] text-danger mb-4">{error}</div>}
        <button disabled={loading} className="w-full bg-primary text-white rounded-full py-2.5 text-[14px] font-medium">
          {loading ? "Joining…" : "Join"}
        </button>
      </form>
    </main>
  );
}
