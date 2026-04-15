import type { LangCode } from "./types";

// Helper for reading bilingual fields on SOP-related rows (sops, steps, substeps).
// Convention: an `_es` column sits alongside each translatable English column.
// `key` is the English column name (e.g. "title", "description", "text", "transcript").
// Falls back to English if the Spanish version is empty/missing.
export function pickI18n(row: any, key: string, lang: LangCode): string {
  const base = row?.[key];
  if (lang === "en") return (base as string) ?? "";
  const esKey = `${key}_es`;
  const es = row?.[esKey];
  if (typeof es === "string" && es.trim().length > 0) return es;
  return (base as string) ?? "";
}
