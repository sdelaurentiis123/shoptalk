import clsx, { type ClassValue } from "clsx";

export const cn = (...inputs: ClassValue[]) => clsx(inputs);

export const fmtTime = (s: number | null | undefined) =>
  s == null ? "" : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function generateJoinCode(facilityName: string) {
  const slug = facilityName
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 10) || "FACILITY";
  const n = Math.floor(1000 + Math.random() * 9000);
  return `${slug}-${n}`;
}

export function formatDate(d: string | Date | null | undefined) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function relativeTime(iso: string | null | undefined, lang: "en" | "es" = "en"): string {
  if (!iso) return "";
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (lang === "es") {
    if (mins < 1) return "ahora";
    if (mins < 60) return `hace ${mins} min`;
    if (hrs < 24) return `hace ${hrs} h`;
    if (days < 7) return `hace ${days} d`;
    return new Date(iso).toLocaleDateString("es-ES", { month: "short", day: "numeric" });
  }
  if (mins < 1) return "now";
  if (mins < 60) return `${mins} min ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
