"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Row {
  id: string;
  name: string;
  join_code: string;
  created_at: string;
  members: number;
  sops: number;
}

export default function PlatformClient({ facilities }: { facilities: Row[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  function enter(id: string) {
    setBusyId(id);
    start(async () => {
      const res = await fetch("/api/workspaces/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facility_id: id }),
      });
      if (res.ok) {
        router.refresh();
        router.push("/procedures");
      }
      setBusyId(null);
    });
  }

  return (
    <main className="max-w-[960px] mx-auto px-7 py-8">
      <h1 className="text-[22px] font-bold tracking-tight2 mb-1">Platform admin</h1>
      <p className="text-[13px] text-text-secondary mb-6">
        All workspaces on this instance. Enter any workspace to act as its admin.
      </p>
      <div className="bg-surface rounded-2xl shadow-card border border-border overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-background text-text-secondary">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Workspace</th>
              <th className="text-left px-4 py-3 font-medium">Join code</th>
              <th className="text-right px-4 py-3 font-medium">Members</th>
              <th className="text-right px-4 py-3 font-medium">SOPs</th>
              <th className="text-left px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {facilities.map((f) => (
              <tr key={f.id}>
                <td className="px-4 py-3 font-medium">{f.name}</td>
                <td className="px-4 py-3 font-mono text-[12px]">{f.join_code}</td>
                <td className="px-4 py-3 text-right">{f.members}</td>
                <td className="px-4 py-3 text-right">{f.sops}</td>
                <td className="px-4 py-3 text-text-secondary">{new Date(f.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => enter(f.id)}
                    disabled={pending && busyId === f.id}
                    className="px-3 py-1.5 bg-text-primary text-white rounded-full text-[12px] font-medium disabled:opacity-60"
                  >
                    {pending && busyId === f.id ? "Entering\u2026" : "Enter"}
                  </button>
                </td>
              </tr>
            ))}
            {facilities.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-text-secondary">No workspaces yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
