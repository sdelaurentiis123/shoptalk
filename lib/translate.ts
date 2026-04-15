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

function logStage(sopId: string, stage: string, extra?: Record<string, unknown>) {
  const bits = [`sopId=${sopId}`, `stage=${stage}`];
  if (extra) {
    for (const [k, v] of Object.entries(extra)) bits.push(`${k}=${JSON.stringify(v)}`);
  }
  console.log(`[translate] ${bits.join(" ")}`);
}

export async function markTranslationPending(admin: SupabaseClient, sopId: string) {
  await admin.from("sops").update({ translation_status: "pending" }).eq("id", sopId);
}

/**
 * Translates SOP English content to Spanish via Claude and writes the `_es`
 * columns. Skips entirely when the English hash hasn't changed since the last
 * successful run. Writes step/substep rows in parallel (one `.update()` per
 * row, fired concurrently) and then flips the sops row atomically to status=
 * ready + new hash in a single update.
 *
 * Why .update() not .upsert(): upsert goes INSERT-first in Postgres and
 * validates NOT NULL on all target columns. Our patch payload only carries
 * _es fields, so upsert fails on sop_id/sort_order/title. .update() has no
 * such issue.
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
  logStage(sopId, "start", {
    hash_old: (sop.english_hash ?? "").slice(0, 8),
    hash_new: newHash.slice(0, 8),
  });

  if (newHash === sop.english_hash && sop.translation_status === "ready") {
    logStage(sopId, "skip_unchanged");
    return;
  }

  if (!input.title && input.steps.length === 0) {
    await admin
      .from("sops")
      .update({ translation_status: "ready", english_hash: newHash })
      .eq("id", sopId);
    logStage(sopId, "empty_done");
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

    const totalSubsteps = input.steps.reduce((n, s) => n + s.substeps.length, 0);
    logStage(sopId, "claude_start", { steps: input.steps.length, substeps: totalSubsteps });

    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system,
      messages: [{ role: "user", content: `English SOP to translate:\n\n${JSON.stringify(input, null, 2)}` }],
    });

    const raw = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    if (!raw) throw new Error("empty Claude response");
    logStage(sopId, "claude_done", { chars: raw.length });

    const parsed: Translated = JSON.parse(trimJson(raw));

    // Build per-row lookups from the Claude response.
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

    // Parallel per-row updates. Postgres handles these independently; wall
    // time ≈ one round-trip regardless of count.
    if (stepPatches.length > 0) {
      const stepResults = await Promise.all(
        stepPatches.map((p) =>
          admin
            .from("steps")
            .update({ title_es: p.title_es, description_es: p.description_es })
            .eq("id", p.id),
        ),
      );
      const stepErr = stepResults.find((r) => r.error)?.error;
      if (stepErr) throw new Error(`steps update: ${stepErr.message}`);
      logStage(sopId, "steps_updated", { rows: stepPatches.length });
    }

    if (substepPatches.length > 0) {
      const ssResults = await Promise.all(
        substepPatches.map((p) =>
          admin.from("substeps").update({ text_es: p.text_es }).eq("id", p.id),
        ),
      );
      const ssErr = ssResults.find((r) => r.error)?.error;
      if (ssErr) throw new Error(`substeps update: ${ssErr.message}`);
      logStage(sopId, "substeps_updated", { rows: substepPatches.length });
    }

    // Atomic finish: Spanish SOP fields + status=ready + hash in one call.
    const { error: finalErr } = await admin
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
    if (finalErr) throw new Error(`sops final update: ${finalErr.message}`);
    logStage(sopId, "final_update_ok");
  } catch (e: any) {
    logStage(sopId, "error", { msg: String(e?.message ?? e) });
    console.error("[translate] failed:", e);
    await admin.from("sops").update({ translation_status: "failed" }).eq("id", sopId);
    throw e;
  }
}
