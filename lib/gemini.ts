import type { GeminiOut } from "./types";

const KEY = process.env.GEMINI_API_KEY!;
const MODEL = "gemini-2.0-flash";

const PROMPT = (kind: "video" | "pdf") => `You are analyzing a manufacturing procedure ${kind === "video" ? "video" : "document"}.

Extract each distinct procedural step. For each step provide:
- title: short name (3-6 words)
- description: one sentence
- startSeconds: integer, when step begins (null for PDFs)
- endSeconds: integer, when step ends (null for PDFs)
- substeps: array of sub-actions, each with:
  - text: what to do
  - timeSeconds: integer timestamp (null for PDFs)

Also provide:
- title: overall procedure name
- description: one sentence summary
- totalSeconds: ${kind === "video" ? "video duration in seconds" : "0"}

Return ONLY valid JSON in this format, no markdown:
{
  "title": "string",
  "description": "string",
  "totalSeconds": 0,
  "steps": [
    {
      "title": "string",
      "description": "string",
      "startSeconds": 0,
      "endSeconds": 5,
      "substeps": [{ "text": "string", "timeSeconds": 2 }]
    }
  ]
}`;

function parseJson(text: string): GeminiOut {
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleaned);
}

async function generateFromInline(mimeType: string, dataB64: string, prompt: string): Promise<GeminiOut> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ inlineData: { mimeType, data: dataB64 } }, { text: prompt }] }],
        generationConfig: { temperature: 0.1 },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini: empty response");
  return parseJson(text);
}

async function uploadLargeFile(buf: Buffer, mimeType: string, displayName: string): Promise<string> {
  // Resumable upload per Gemini File API.
  const startRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${KEY}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(buf.length),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: displayName } }),
    },
  );
  if (!startRes.ok) throw new Error(`Gemini start upload ${startRes.status}: ${await startRes.text()}`);
  const uploadUrl = startRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Gemini: no upload URL");

  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(buf.length),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: new Uint8Array(buf),
  });
  if (!uploadRes.ok) throw new Error(`Gemini upload ${uploadRes.status}: ${await uploadRes.text()}`);
  const data = await uploadRes.json();
  const name: string = data.file?.name;
  const uri: string = data.file?.uri;
  if (!name || !uri) throw new Error("Gemini: missing file metadata");

  // Poll for ACTIVE.
  for (let i = 0; i < 60; i++) {
    const s = await fetch(`https://generativelanguage.googleapis.com/v1beta/${name}?key=${KEY}`);
    if (s.ok) {
      const j = await s.json();
      if (j.state === "ACTIVE") return uri;
      if (j.state === "FAILED") throw new Error(`Gemini file failed: ${JSON.stringify(j)}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Gemini: file did not become ACTIVE in time");
}

async function generateFromFileUri(fileUri: string, mimeType: string, prompt: string): Promise<GeminiOut> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ fileData: { fileUri, mimeType } }, { text: prompt }] }],
        generationConfig: { temperature: 0.1 },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini: empty response");
  return parseJson(text);
}

export async function processWithGemini(
  buf: Buffer,
  mimeType: string,
  fileName: string,
): Promise<GeminiOut> {
  const isVideo = mimeType.startsWith("video/");
  const isPdf = mimeType === "application/pdf";
  const prompt = PROMPT(isVideo ? "video" : "pdf");

  // For PDFs under 20MB, use inline. For larger or videos, use File API.
  const INLINE_LIMIT = 18 * 1024 * 1024;
  if (!isVideo && buf.length < INLINE_LIMIT) {
    return generateFromInline(mimeType, buf.toString("base64"), prompt);
  }
  if (isVideo || isPdf) {
    const uri = await uploadLargeFile(buf, mimeType, fileName);
    return generateFromFileUri(uri, mimeType, prompt);
  }
  // images
  return generateFromInline(mimeType, buf.toString("base64"), prompt);
}
