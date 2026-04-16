import { GoogleGenAI, createUserContent, createPartFromUri } from "@google/genai";
import { tmpdir } from "os";
import { join } from "path";
import { writeFile, unlink } from "fs/promises";
import type { GeminiOut } from "./types";

const MODEL = "gemini-3-pro-preview";

let _ai: GoogleGenAI | null = null;
function ai() {
  if (_ai) return _ai;
  _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  return _ai;
}

export const SOP_PROMPT = `You are a senior manufacturing operations analyst. You watch training videos and technical documents and turn them into floor-ready Standard Operating Procedures that a line operator — possibly a non-native English speaker — can follow to do the job correctly and safely.

You produce EVERY piece of text in BOTH English (en) and Spanish (es). Spanish is for native Spanish-speaking operators. Use neutral Latin-American Spanish. Do not mix languages within a field. The Spanish version should be a faithful translation of the English version — same meaning, same structure, same order of substeps.

Your output powers a mobile app that operators use on the factory floor. Precision matters. Shallow or generic steps hurt people.

USE EVERY SIGNAL AVAILABLE TO YOU:
- Visual: what is on screen, what the operator does with their hands, the state of equipment, changes in lighting / timers / indicators.
- Audio: any voiceover narration (transcribe and use it), spoken instructions from the trainer, ambient audio cues (beeps, alarms, timer sounds, airflow, motors).
- Text: any on-screen captions, control-panel labels, tool markings, labels on ingredients or equipment.

EXTRACTION TARGETS:

1. Structured steps: the ordered, independent actions that make up the procedure.
   - Every step has a concrete start and end second.
   - Steps should not overlap in time. Tight to what's actually happening.
   - A "step" is what you would list in a written SOP, not every motion.

2. Substeps inside each step: the specific actions the operator takes, in order. These are what the operator will literally read while doing the job. Substeps MUST capture:
   - PPE changes or checks ("Put on nitrile gloves.", "Verify hairnet is on.")
   - Exact controls touched, with button names in quotes when readable ("Press \\"MANUAL BAKE\\".", "Turn dial to \\"PROOF\\".")
   - Exact numeric parameters — temperatures in F or C as shown, times in minutes/seconds, quantities with units ("Set temperature to 375°F.", "Set timer to 8 minutes.")
   - Safety warnings when the video shows one ("Do not touch the top rack: surface is hot.")
   - Verification / pass-fail criteria ("Confirm red light turns green.", "Rack must sit flush with guide rails.")
   - Tools / consumables used, by name
   - Every substep has a timeSeconds: the integer second on the VIDEO CLOCK at which this substep is demonstrated or narrated. If the action is shown, use the second it occurs. If the trainer is describing a real-world step that is not visually demonstrated (e.g. "wait 20 minutes", "log on clipboard at end of shift"), use the second at which the trainer MENTIONS that substep. Never use a real-world time offset; never use a time past the end of the video.

3. A screenplay-style transcript of the entire video. This is a continuous play-by-play, third person present tense, of everything happening — what's visible AND what's said. Format each line as:
   [m:ss] narration
   One line per discrete beat (roughly every 2–5 seconds). Include:
   - What the operator is doing with their body.
   - What equipment state changes occur on screen (panel lights, readouts, timers).
   - Every audible line of narration, verbatim when possible, in quotes: [0:12] The trainer says, "Make sure the rack is fully seated before you close the door."
   - Non-verbal audio: [1:34] A high beep sounds three times.
   This transcript is the source of truth for detail questions later, so do not skip the small stuff.

FIELD-LEVEL RULES:
- title (overall): 3–6 words, action-led (e.g. "Revent Oven Manual Bake").
- description (overall): one sentence describing what operator will accomplish.
- totalSeconds: the exact runtime of the video — the integer number of seconds from the first frame to the last frame. Measure this carefully; many downstream features depend on it being correct. 0 for PDFs/images.
- per-step title: 3–6 words, imperative.
- per-step description: one sentence, plain language.
- For PDFs / images: startSeconds / endSeconds / timeSeconds are null. transcript is a page-by-page description of what's in the document instead of time-stamped.
- Never invent content that isn't actually in the source. If the video never shows the actual temperature, don't make one up — write the substep as "Set the oven to the temperature specified in the shift batch sheet." Include only what's there.

TIMESTAMP RULES — STRICT. Do not hallucinate.
- Every startSeconds, endSeconds, and timeSeconds must be an INTEGER (whole seconds). Never a string like "0:12". Never a decimal.
- Every timestamp must be ≥ 0 and ≤ totalSeconds. Never go past the end of the video.
- startSeconds must be < endSeconds for each step.
- Steps must not overlap in time. Step N's startSeconds ≥ step N-1's endSeconds.
- timeSeconds for each substep must fall within its parent step's [startSeconds, endSeconds] range.
- If you are uncertain of an exact second, round DOWN to the nearest second you actually observed — never extrapolate past observed content.
- For narrated-future or procedural-context substeps (e.g. "wait 20 minutes", "log at end of shift"), timeSeconds is the second the trainer MENTIONS it on the video clock, not the real-world offset. Spread substeps within a narrated block according to the order and pace of the narration — they must not all share the same timeSeconds unless the trainer literally mentions them simultaneously.
- The transcript's [m:ss] markers must also respect totalSeconds and be monotonically non-decreasing.

OUTPUT FORMAT:
Return ONLY valid JSON, no markdown, no commentary, no fences. Every English text field has a Spanish sibling suffixed with _es. Schema:
{
  "title": "string (English)",
  "title_es": "string (Spanish)",
  "description": "string (English)",
  "description_es": "string (Spanish)",
  "totalSeconds": 0,
  "transcript": "string (English screenplay)",
  "transcript_es": "string (Spanish screenplay, faithfully translated)",
  "steps": [
    {
      "title": "string (English)",
      "title_es": "string (Spanish)",
      "description": "string (English)",
      "description_es": "string (Spanish)",
      "startSeconds": 0,
      "endSeconds": 0,
      "substeps": [
        {
          "text": "string (English)",
          "text_es": "string (Spanish)",
          "timeSeconds": 0
        }
      ]
    }
  ]
}`;

function parseJson(text: string): GeminiOut {
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleaned);
}

// Accept an integer seconds, a "m:ss" / "h:mm:ss" string, or null. Returns
// an integer clamped to [0, max], or null if the input can't be parsed.
function coerceSeconds(value: unknown, max: number): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(max, Math.round(value)));
  }
  if (typeof value === "string") {
    if (/^\d+$/.test(value.trim())) {
      return Math.max(0, Math.min(max, parseInt(value.trim(), 10)));
    }
    const parts = value.trim().split(":").map((p) => parseInt(p, 10));
    if (parts.every((n) => Number.isFinite(n))) {
      let total = 0;
      for (const n of parts) total = total * 60 + n;
      return Math.max(0, Math.min(max, Math.round(total)));
    }
  }
  return null;
}

/**
 * Clamp timestamps against the measured video duration so Gemini hallucinations
 * don't poison the DB: no negatives, no past-end values, start < end, substeps
 * inside their parent step's window, steps non-overlapping.
 */
function sanitizeTimestamps(out: GeminiOut, mimeType: string): GeminiOut {
  const isVideo = mimeType.startsWith("video/");
  if (!isVideo) {
    // Non-videos: drop any timestamps entirely.
    return {
      ...out,
      totalSeconds: 0,
      steps: (out.steps ?? []).map((s) => ({
        ...s,
        startSeconds: null,
        endSeconds: null,
        substeps: (s.substeps ?? []).map((ss) => ({ ...ss, timeSeconds: null })),
      })),
    };
  }

  const totalFromModel = coerceSeconds(out.totalSeconds, 24 * 60 * 60) ?? 0;
  // When Gemini omits totalSeconds, don't collapse every timestamp to 0 — use
  // a generous cap so later coerceSeconds() calls don't clamp valid values.
  const total = totalFromModel > 0 ? totalFromModel : 24 * 60 * 60;
  const hasReliableTotal = totalFromModel > 0;

  let lastEnd = 0;
  const cleanedSteps = (out.steps ?? []).map((s) => {
    let start = coerceSeconds((s as any).startSeconds, total) ?? lastEnd;
    let end = coerceSeconds((s as any).endSeconds, total) ?? start + 5;
    if (start < lastEnd) start = lastEnd;
    if (end <= start) end = start + 1;
    if (hasReliableTotal && end > total) end = total;
    lastEnd = end;

    // Keep Gemini's timestamps when they fall inside the step window; clamp
    // into range if they're slightly off; leave null when absent (the DB
    // column is nullable — honest > invented).
    const substeps = (s.substeps ?? []).map((ss) => {
      let ts = coerceSeconds((ss as any).timeSeconds, total);
      if (ts != null) {
        if (ts < start) ts = start;
        else if (ts > end) ts = end;
      }
      return { ...ss, timeSeconds: ts };
    });

    return { ...s, startSeconds: start, endSeconds: end, substeps };
  });

  return { ...out, totalSeconds: hasReliableTotal ? total : 0, steps: cleanedSteps };
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

const RESUMABLE_THRESHOLD = 20 * 1024 * 1024;
const CHUNK_SIZE = 8 * 1024 * 1024;

async function uploadLargeFileResumable(
  buf: Buffer,
  mimeType: string,
  displayName: string,
): Promise<{ name: string; uri: string; mimeType: string }> {
  const apiKey = process.env.GEMINI_API_KEY!;
  const totalBytes = buf.length;

  // 1. Start resumable session.
  const startRes = await withTimeout(
    fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": String(totalBytes),
          "X-Goog-Upload-Header-Content-Type": mimeType,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ file: { display_name: displayName } }),
      },
    ),
    30_000,
    "files:resumable:start",
  );
  if (!startRes.ok) {
    throw new Error(
      `Gemini resumable start failed: ${startRes.status} ${await startRes.text()}`,
    );
  }
  const sessionUrl = startRes.headers.get("x-goog-upload-url");
  if (!sessionUrl) throw new Error("Gemini resumable start: no upload URL in response");

  // 2. Upload chunks.
  const totalChunks = Math.ceil(totalBytes / CHUNK_SIZE);
  let lastMeta: any = null;
  for (let i = 0; i < totalChunks; i++) {
    const offset = i * CHUNK_SIZE;
    const end = Math.min(offset + CHUNK_SIZE, totalBytes);
    const slice = buf.subarray(offset, end);
    const isLast = i === totalChunks - 1;
    const command = isLast ? "upload, finalize" : "upload";

    let attempt = 0;
    while (true) {
      try {
        const res = await withTimeout(
          fetch(sessionUrl, {
            method: "POST",
            headers: {
              "X-Goog-Upload-Offset": String(offset),
              "X-Goog-Upload-Command": command,
              "Content-Length": String(slice.length),
            },
            body: new Uint8Array(slice.buffer, slice.byteOffset, slice.byteLength) as any,
          }),
          120_000,
          `files:resumable:chunk:${i + 1}/${totalChunks}`,
        );
        if (!res.ok) {
          throw new Error(
            `chunk ${i + 1}/${totalChunks} status ${res.status}: ${await res.text()}`,
          );
        }
        console.log(`[gemini] upload:chunk ${i + 1}/${totalChunks}`);
        if (isLast) lastMeta = await res.json();
        break;
      } catch (e) {
        attempt++;
        if (attempt >= 3) throw e;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }

  const f = lastMeta?.file;
  if (!f?.name) throw new Error("Gemini resumable finalize: missing file metadata");
  return {
    name: f.name,
    uri: f.uri,
    mimeType: f.mimeType ?? mimeType,
  };
}

async function uploadAndWait(buf: Buffer, mimeType: string, fileName: string) {
  console.log("[gemini] upload:start", { sizeMB: +(buf.length / 1024 / 1024).toFixed(2) });

  let fileName0: string;
  let fileUri: string;
  let fileMime: string;

  if (buf.length > RESUMABLE_THRESHOLD) {
    const r = await uploadLargeFileResumable(buf, mimeType, fileName);
    fileName0 = r.name;
    fileUri = r.uri;
    fileMime = r.mimeType;
  } else {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const tmpPath = join(tmpdir(), `shoptalk-${crypto.randomUUID()}-${safeName}`);
    await writeFile(tmpPath, buf);
    try {
      const f = await withTimeout(
        ai().files.upload({ file: tmpPath, config: { mimeType, displayName: fileName } }),
        120_000,
        "files.upload",
      );
      if (!f.name) throw new Error("Gemini: file has no name");
      fileName0 = f.name;
      fileUri = f.uri ?? "";
      fileMime = f.mimeType ?? mimeType;
    } finally {
      unlink(tmpPath).catch(() => {});
    }
  }
  console.log("[gemini] upload:done", { name: fileName0 });

  // Poll for ACTIVE.
  let file = await withTimeout(ai().files.get({ name: fileName0 }), 15_000, "files.get");
  for (let i = 0; i < 150 && file.state !== "ACTIVE"; i++) {
    if (file.state === "FAILED")
      throw new Error(`Gemini file processing failed: ${JSON.stringify(file)}`);
    await new Promise((r) => setTimeout(r, 1000));
    file = await withTimeout(ai().files.get({ name: fileName0 }), 15_000, "files.get");
  }
  if (file.state !== "ACTIVE") throw new Error("Gemini: file did not become ACTIVE in time");
  if (!file.uri || !file.mimeType) throw new Error("Gemini: uploaded file missing uri/mimeType");
  console.log("[gemini] poll:active");
  return { uri: file.uri, mimeType: file.mimeType };
}

export interface GeminiOpts {
  prompt?: string;
  thinkingLevel?: string;
  prevContext?: string;
  timeoutMs?: number;
}

export async function processWithGemini(
  buf: Buffer,
  mimeType: string,
  fileName: string,
  opts?: GeminiOpts,
): Promise<GeminiOut> {
  const prompt = opts?.prompt ?? SOP_PROMPT;
  const thinkingLevel = opts?.thinkingLevel ?? "high";
  const timeoutMs = opts?.timeoutMs ?? 240_000;

  const userPrompt = opts?.prevContext
    ? `${opts.prevContext}\n\n${prompt}`
    : prompt;

  const isVideo = mimeType.startsWith("video/");
  const INLINE_LIMIT = 18 * 1024 * 1024;
  const useInline = !isVideo && buf.length < INLINE_LIMIT;

  const config = {
    thinkingConfig: { thinkingLevel },
    mediaResolution: "MEDIA_RESOLUTION_HIGH",
  } as any;

  console.log("[gemini] generate:start", { useInline, thinkingLevel });
  const response = useInline
    ? await withTimeout(
        ai().models.generateContent({
          model: MODEL,
          contents: createUserContent([
            { inlineData: { mimeType, data: buf.toString("base64") } },
            userPrompt,
          ]),
          config,
        }),
        timeoutMs,
        "generateContent",
      )
    : await (async () => {
        const { uri, mimeType: uploadedMime } = await uploadAndWait(buf, mimeType, fileName);
        return withTimeout(
          ai().models.generateContent({
            model: MODEL,
            contents: createUserContent([createPartFromUri(uri, uploadedMime), userPrompt]),
            config,
          }),
          timeoutMs,
          "generateContent",
        );
      })();
  console.log("[gemini] generate:done");

  const text = response.text;
  if (!text) throw new Error("Gemini: empty response");
  const parsed = parseJson(text);
  const isSopPrompt = prompt === SOP_PROMPT;
  return isSopPrompt ? sanitizeTimestamps(parsed, mimeType) : parsed;
}
