import Anthropic from "@anthropic-ai/sdk";
import type { LangCode, SopWithSteps, Message } from "./types";
import { LANG_NAME } from "./i18n";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const MODEL = "claude-sonnet-4-5";

export interface ChatResult {
  text: string;
  sourceSopId: string | null;
  sourceStep: string | null;
}

const TRANSCRIPT_CHAR_BUDGET = 8000;

function buildSopContext(sops: SopWithSteps[]): string {
  if (sops.length === 0) return "(no procedures uploaded yet)";
  return sops
    .map((sop) => {
      const stepsTxt = sop.steps
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((st, i) => {
          const subs = st.substeps
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((ss) => `    - ${ss.text}`)
            .join("\n");
          const t = st.start_sec != null ? ` [${st.start_sec}s–${st.end_sec}s]` : "";
          return `  Step ${i + 1}: ${st.title}${t}\n    ${st.description}${subs ? "\n" + subs : ""}`;
        })
        .join("\n");
      const transcript = (sop.transcript ?? "").slice(0, TRANSCRIPT_CHAR_BUDGET);
      const transcriptSection = transcript
        ? `\n\nTRANSCRIPT (play-by-play of the video, use for detail/nuance questions):\n${transcript}${
            (sop.transcript?.length ?? 0) > TRANSCRIPT_CHAR_BUDGET ? "\n…(truncated)" : ""
          }`
        : "";
      return `### PROCEDURE: ${sop.title} (id: ${sop.id})\n${sop.description}\n\nSTEPS:\n${stepsTxt}${transcriptSection}`;
    })
    .join("\n\n");
}

export async function answerChat(opts: {
  facilityName: string;
  language: LangCode;
  sops: SopWithSteps[];
  history: Pick<Message, "role" | "content">[];
  userMessage: string;
}): Promise<ChatResult> {
  const { facilityName, language, sops, history, userMessage } = opts;
  const langName = LANG_NAME[language] ?? "English";

  const system = `You are ShopTalk, a manufacturing floor assistant for ${facilityName}.
Answer ONLY using the procedures below. Respond in ${langName}.
Be concise and practical (2-4 sentences). Cite which procedure and step you used.

Each procedure includes both STEPS (structured, action-focused) and a TRANSCRIPT (a play-by-play narration of the video).
- Prefer STEPS for "how do I do X?" answers.
- Use the TRANSCRIPT for detail/nuance questions (what did the trainer say, what color is it, what did the beep mean, exact wording, etc.).
- Quote the transcript verbatim when it answers the question directly.

At the end of every answer, on a new line, output exactly one of:
  [SOURCE: <sop_id> | Step <n>]
  [NOT_FOUND]

If the information is not in the procedures, use [NOT_FOUND] and, in your reply, ask if they want to flag this as a documentation gap.

Procedures:
${buildSopContext(sops)}`;

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    system,
    messages: [
      ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user" as const, content: userMessage },
    ],
  });

  const raw = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const sourceMatch = raw.match(/\[SOURCE:\s*([0-9a-f-]+)\s*\|\s*Step\s*(\d+)\]/i);
  const notFound = /\[NOT_FOUND\]/i.test(raw);
  const text = raw.replace(/\[SOURCE:[^\]]+\]/gi, "").replace(/\[NOT_FOUND\]/gi, "").trim();

  return {
    text,
    sourceSopId: sourceMatch ? sourceMatch[1] : null,
    sourceStep: sourceMatch ? `Step ${sourceMatch[2]}` : notFound ? null : null,
  };
}
