"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LANGUAGES } from "@/lib/i18n";
import type { LangCode, Role } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

export default function Nav({
  role,
  lang,
  initial,
}: {
  role: Role;
  lang: LangCode;
  initial?: string;
}) {
  const [langOpen, setLangOpen] = useState(false);
  const [pending, start] = useTransition();
  const pathname = usePathname();
  const router = useRouter();
  const tabs =
    role === "admin"
      ? [
          { k: "procedures", l: "Procedures", href: "/procedures" },
          { k: "chat", l: "Ask", href: "/chat" },
          { k: "dashboard", l: "Dashboard", href: "/dashboard" },
        ]
      : [
          { k: "procedures", l: "Procedures", href: "/procedures" },
          { k: "chat", l: "Ask", href: "/chat" },
        ];

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  function chooseLang(code: LangCode) {
    if (code === lang) {
      setLangOpen(false);
      return;
    }
    start(async () => {
      const res = await fetch("/api/me/language", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: code }),
      });
      setLangOpen(false);
      if (res.ok) router.refresh();
    });
  }

  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between px-7 h-[52px] bg-white/70 backdrop-blur-xl border-b border-black/5">
      <div className="flex items-center gap-7">
        <Link href={role === "admin" ? "/procedures" : "/chat"} className="font-bold tracking-tight2 text-[16px]">
          ShopTalk
        </Link>
        <div className="flex gap-[2px] bg-background rounded-full p-[2px]">
          {tabs.map((t) => {
            const active = pathname === t.href || pathname.startsWith(t.href + "/");
            return (
              <Link
                key={t.k}
                href={t.href}
                className={`px-[14px] py-[6px] rounded-full text-[13px] font-medium transition ${
                  active ? "bg-text-primary text-white" : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {t.l}
              </Link>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-3 relative">
        <button
          onClick={() => setLangOpen((v) => !v)}
          disabled={pending}
          className="flex items-center gap-1 px-3 py-[5px] border border-border rounded-lg bg-surface text-[13px] text-text-secondary disabled:opacity-60"
        >
          {pending ? (
            <span className="w-3 h-3 border-2 border-text-tertiary border-t-transparent rounded-full animate-spin" />
          ) : null}
          {LANGUAGES.find((l) => l.code === lang)?.label ?? "English"}
          <span className="text-[9px] ml-0.5">▾</span>
        </button>
        {langOpen && (
          <div className="absolute right-10 top-[calc(100%+6px)] bg-surface rounded-xl shadow-cardlg overflow-hidden min-w-[140px] z-[100] border border-border">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                onClick={() => chooseLang(l.code)}
                className={`block w-full px-4 py-[10px] text-left text-[13px] ${
                  l.code === lang ? "bg-primary-bg text-primary" : "text-text-primary"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={logout}
          className="w-7 h-7 rounded-full bg-background flex items-center justify-center text-xs font-semibold text-text-secondary"
          title="Log out"
        >
          {(initial ?? "U").toUpperCase()}
        </button>
      </div>
    </nav>
  );
}
