import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const MODEL = "claude-sonnet-4-5";

interface SubstepIn {
  id: string;
  text: string;
}
interface StepIn {
  id: string;
  title: string;
  description: string;
  substeps: SubstepIn[];
}
interface SopIn {
  id: string;
  title: string;
  description: string;
  transcript: string;
  steps: StepIn[];
}

interface TranslatedSubstep {
  id: string;
  text_es: string;
}
interface TranslatedStep {
  id: string;
  title_es: string;
  description_es: string;
  substeps: TranslatedSubstep[];
}
interface Translated {
  title_es: string;
  description_es: string;
  transcript_es: string;
  steps: TranslatedStep[];
}

function trimJson(text: string) {
  return text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
}

function hashEnglish(input: SopIn): string {
  const h = createHash("sha256");
  h.update(input.title);
  h.update("\u0001");
  h.update(input.description);
  h.update("\u0001");
  h.update(input.transcript);
  for (const s of input.steps) {
    h.update("\u0002");
    h.update(s.title);
    h.update("\u0001");
    h.update(s.description);
    for (const ss of s.substeps) {
      h.update("\u0003");
      h.update(ss.text);
    }
  }
  return h.digest("hex");
}

export async function markTranslationPending(admin: SupabaseClient, sopId: string) {
  await admin.from("sops").update({ translation_status: "pending" }).eq("id", sopId);
}

/**
 * Reads the SOP + steps + substeps, translates via Claude, writes the `_es`
 * columns back. Skips entirely if the English hash hasn't changed since the
 * last successful translation. Sets `translation_status` and `english_hash`.
 *
 * Writes are batched into three calls total:
 *   1. one upsert for all step translations
 *   2. one upsert for all substep translations
 *   3. one update on the sops row that atomically sets the Spanish fields
 *      AND flips translation_status='ready' AND stores the new hash
 *
 * If the serverless function is killed after step 3 returns we're still safe;
 * if it dies mid-sequence, the next trigger will re-run and finish.
 */
export async function translateSop(admin: SupabaseClient, sopId: string): Promise<void> {
  const { data: sop, error } = await admin
    .from("sops")
    .select("id, title, description, transcript, english_hash, translation_status, steps(id, title, description, sort_order, substeps(id, text, sort_order))")
    .eq("id", sopId)
    .maybeSingle();
  if (error || !sop) throw new Error(`translate: sop fetch failed: ${error?.message ?? "not found"}`);

  const stepsSorted = [...(sop.steps ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order);
  const input: SopIn = {
    id: sop.id,
    title: sop.title ?? "",
    description: sop.description ?? "",
    transcript: sop.transcript ?? "",
    steps: stepsSorted.map((s: any) => ({
      id: s.id,
      title: s.title ?? "",
      description: s.description ?? "",
      substeps: [...(s.substeps ?? [])]
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((ss: any) => ({ id: ss.id, text: ss.text ?? "" })),
    })),
  };

  const newHash = hashEnglish(input);
  if (newHash === sop.english_hash && sop.translation_status === "ready") {
    return;
  }

  if (!input.title && input.steps.length === 0) {
    await admin
      .from("sops")
      .update({ translation_status: "ready", english_hash: newHash })
      .eq("id", sopId);
    return;
  }

  try {
    const system = `You translate manufacturing SOPs from English to neutral Latin-American Spanish for factory-floor operators.

Rules:
- Translate faithfully. Same meaning, same tone, same structure.
- Preserve numbers, units, button names in quotes, product names, model numbers, timestamps.
- Spanish strings must be natural — not literal word-for-word.
- Do NOT translate IDs or UUIDs.
- Output every id from the input exactly as received.

Return ONLY valid JSON, no markdown, no commentary, this exact schema:
{
  "title_es": "string",
  "description_es": "string",
  "transcript_es": "string",
  "steps": [
    {
      "id": "uuid-from-input",
      "title_es": "string",
      "description_es": "string",
      "substeps": [
        { "id": "uuid-from-input", "text_es": "string" }
      ]
    }
  ]
}`;

    const userContent = `English SOP to translate:\n\n${JSON.stringify(input, null, 2)}`;

    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system,
      messages: [{ role: "user", content: userContent }],
    });

    const raw = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    if (!raw) throw new Error("empty Claude response");

    const parsed: Translated = JSON.parse(trimJson(raw));

    // Build per-row lookups so we can emit batched upserts (one round-trip
    // for every steps, one for every substeps — regardless of SOP size).
    const stepById = new Map(parsed.steps.map((s) => [s.id, s]));
    const stepPatches: { id: string; title_es: string; description_es: string }[] = [];
    const substepPatches: { id: string; text_es: string }[] = [];

    for (const step of input.steps) {
      const t = stepById.get(step.id);
      stepPatches.push({
        id: step.id,
        title_es: t?.title_es ?? "",
        description_es: t?.description_es ?? "",
      });
      const tSubs = new Map((t?.substeps ?? []).map((s) => [s.id, s.text_es ?? ""]));
      for (const sub of step.substeps) {
        substepPatches.push({ id: sub.id, text_es: tSubs.get(sub.id) ?? "" });
      }
    }

    if (stepPatches.length > 0) {
      const { error: sErr } = await admin.from("steps").upsert(stepPatches, { onConflict: "id" });
      if (sErr) throw new Error(`steps upsert: ${sErr.message}`);
    }
    if (substepPatches.length > 0) {
      const { error: ssErr } = await admin
        .from("substeps")
        .upsert(substepPatches, { onConflict: "id" });
      if (ssErr) throw new Error(`substeps upsert: ${ssErr.message}`);
    }

    // Atomic finish: Spanish SOP fields + status='ready' + new hash, all in one.
    await admin
      .from("sops")
      .update({
        title_es: parsed.title_es ?? "",
        description_es: parsed.description_es ?? "",
        transcript_es: parsed.transcript_es ?? "",
        translation_status: "ready",
        english_hash: newHash,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sopId);
  } catch (e) {
    console.error("[translate] failed:", e);
    await admin.from("sops").update({ translation_status: "failed" }).eq("id", sopId);
    throw e;
  }
}
