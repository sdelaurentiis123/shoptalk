import Anthropic from "@anthropic-ai/sdk";
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

/**
 * Reads the SOP + steps + substeps, asks Claude to translate every English text
 * field to neutral Latin-American Spanish, and writes the `_es` columns back.
 * Idempotent: safe to call multiple times.
 */
export async function translateSop(admin: SupabaseClient, sopId: string): Promise<void> {
  const { data: sop, error } = await admin
    .from("sops")
    .select("id, title, description, transcript, steps(id, title, description, sort_order, substeps(id, text, sort_order))")
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

  if (!input.title && input.steps.length === 0) return;

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
  if (!raw) throw new Error("translate: empty Claude response");

  let parsed: Translated;
  try {
    parsed = JSON.parse(trimJson(raw));
  } catch (e: any) {
    throw new Error(`translate: JSON parse failed: ${e.message}\n---\n${raw.slice(0, 500)}`);
  }

  // Update the SOP row.
  await admin
    .from("sops")
    .update({
      title_es: parsed.title_es ?? "",
      description_es: parsed.description_es ?? "",
      transcript_es: parsed.transcript_es ?? "",
      updated_at: new Date().toISOString(),
    })
    .eq("id", sopId);

  // Index by id for fast lookup.
  const stepById = new Map(parsed.steps.map((s) => [s.id, s]));
  const substepById = new Map<string, TranslatedSubstep>();
  for (const s of parsed.steps) {
    for (const ss of s.substeps ?? []) substepById.set(ss.id, ss);
  }

  // Update each step and substep.
  for (const step of input.steps) {
    const t = stepById.get(step.id);
    if (!t) continue;
    await admin
      .from("steps")
      .update({ title_es: t.title_es ?? "", description_es: t.description_es ?? "" })
      .eq("id", step.id);
    for (const sub of step.substeps) {
      const ts = substepById.get(sub.id);
      if (!ts) continue;
      await admin.from("substeps").update({ text_es: ts.text_es ?? "" }).eq("id", sub.id);
    }
  }
}
