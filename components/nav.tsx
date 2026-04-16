"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { LANGUAGES, t } from "@/lib/i18n";
import type { LangCode, Role } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import WorkspaceSwitcher, { type WorkspaceOption } from "@/components/workspace-switcher";

export default function Nav({
  role,
  lang,
  initial,
  isPlatformAdmin = false,
  workspace = null,
  workspaces = [],
  allWorkspaces,
}: {
  role: Role;
  lang: LangCode;
  initial?: string;
  isPlatformAdmin?: boolean;
  workspace?: WorkspaceOption | null;
  workspaces?: WorkspaceOption[];
  allWorkspaces?: WorkspaceOption[];
}) {
  const [langOpen, setLangOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [pending, start] = useTransition();
  const pathname = usePathname();
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);

  const tabs =
    role === "admin"
      ? [
          { k: "procedures", l: t(lang, "procedures"), href: "/procedures" },
          { k: "sessions", l: t(lang, "sessions"), href: "/sessions" },
          { k: "chat", l: t(lang, "ask"), href: "/chat" },
          { k: "dashboard", l: t(lang, "dashboard"), href: "/dashboard" },
        ]
      : [
          { k: "procedures", l: t(lang, "procedures"), href: "/procedures" },
          { k: "chat", l: t(lang, "ask"), href: "/chat" },
        ];

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
        setLangOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

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
          {tabs.map((tab) => {
            const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
            return (
              <Link
                key={tab.k}
                href={tab.href}
                className={`px-[14px] py-[6px] rounded-full text-[13px] font-medium transition ${
                  active ? "bg-text-primary text-white" : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {tab.l}
              </Link>
            );
          })}
        </div>
      </div>
      <div ref={menuRef} className="flex items-center gap-3 relative">
        {role === "admin" && (
          <WorkspaceSwitcher
            current={workspace}
            workspaces={workspaces}
            allWorkspaces={allWorkspaces}
            isPlatformAdmin={isPlatformAdmin}
          />
        )}
        <button
          onClick={() => {
            setLangOpen((v) => !v);
            setUserMenuOpen(false);
          }}
          disabled={pending}
          className="flex items-center gap-1 px-3 py-[5px] border border-border rounded-lg bg-surface text-[13px] text-text-secondary disabled:opacity-60"
        >
          {pending && (
            <span className="w-3 h-3 border-2 border-text-tertiary border-t-transparent rounded-full animate-spin" />
          )}
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
          onClick={() => {
            setUserMenuOpen((v) => !v);
            setLangOpen(false);
          }}
          className="w-7 h-7 rounded-full bg-background flex items-center justify-center text-xs font-semibold text-text-secondary hover:bg-border"
        >
          {(initial ?? "U").toUpperCase()}
        </button>
        {userMenuOpen && (
          <div className="absolute right-0 top-[calc(100%+6px)] bg-surface rounded-xl shadow-cardlg overflow-hidden min-w-[180px] z-[100] border border-border py-1">
            <Link
              href="/profile"
              onClick={() => setUserMenuOpen(false)}
              className="block px-4 py-[10px] text-[13px] text-text-primary hover:bg-background"
            >
              {t(lang, "profile")}
            </Link>
            {role === "admin" && (
              <Link
                href="/settings"
                onClick={() => setUserMenuOpen(false)}
                className="block px-4 py-[10px] text-[13px] text-text-primary hover:bg-background"
              >
                {t(lang, "settings")}
              </Link>
            )}
            {isPlatformAdmin && (
              <Link
                href="/platform"
                onClick={() => setUserMenuOpen(false)}
                className="block px-4 py-[10px] text-[13px] text-text-primary hover:bg-background"
              >
                Platform
              </Link>
            )}
            <div className="h-px bg-border my-1" />
            <button
              onClick={() => {
                setUserMenuOpen(false);
                logout();
              }}
              className="block w-full text-left px-4 py-[10px] text-[13px] text-danger hover:bg-background"
            >
              {t(lang, "logout")}
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
