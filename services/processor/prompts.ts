export function sessionTranscriptPrompt(
  chunkIndex: number,
  chunksTotal: number,
  startSec: number,
  durationSec: number,
): string {
  return `You are observing a work session on a production floor. This is segment ${chunkIndex + 1} of ${chunksTotal}, starting at ${startSec}s into the full session.

Produce a continuous timestamped transcript of everything happening — every discrete action or beat (every 2–5 seconds):

- What the worker does with their hands and body.
- Tools, materials, parts they interact with — by name, color, or label if visible.
- Equipment state changes (lights, readouts, timers, sounds).
- Spoken words, quoted verbatim.
- Non-verbal audio cues (beeps, alarms, clicks).
- Note any actions in progress that may have started before or continue after this segment.

Output: a JSON array, no markdown, no commentary:
[{"timeSeconds": <int>, "text": "<third-person present tense description>"}]

TIMESTAMP RULES — STRICT. Do not hallucinate.
- Every timeSeconds must be an INTEGER (whole seconds). Never a string like "0:12". Never a decimal.
- Every timeSeconds must be ≥ ${startSec} and ≤ ${startSec + durationSec}. Never go past the segment boundary or the end of the video.
- timeSeconds is the VIDEO CLOCK second at which the action is demonstrated or narrated. If the worker is described doing something in the future (e.g. "wait 20 minutes"), use the second the narrator MENTIONS it, not the real-world offset.
- If you are uncertain of an exact second, round DOWN to the nearest second you actually observed — never extrapolate past observed content.
- Entries must be in chronological order (monotonically non-decreasing).
- Do not invent timestamps for content not visible or audible in the video.`;
}

export const SESSION_NOTES_PROMPT = `You are a manufacturing operations analyst reviewing a timestamped transcript of a work session on a production floor. The transcript describes what a worker does moment-by-moment.

Produce structured notes from this transcript:

1. "title": 3–6 word title for this session, action-led.
2. "summary": 2–3 sentence overview of what was accomplished.
3. "topics": array of topic segments. Each: {"title": "...", "description": "...", "startSeconds": <int>, "endSeconds": <int>}.
   Topics are logical phases of the work (e.g. "Wire Routing", "Harness Assembly", "Quality Check"). Every second of the session should fall within exactly one topic.
4. "keyPoints": array of notable moments. Each: {"text": "...", "timeSeconds": <int>, "type": "<type>"}.
   type is one of: "technique" (skilled technique worth noting), "safety" (safety-relevant action or omission), "quality" (quality check, pass/fail, measurement), "tool" (tool or material usage worth highlighting), "other".
5. "actionItems": array of follow-up items if any. Each: {"text": "...", "priority": "high"|"medium"|"low"}.
   Only include action items if the transcript reveals something that should be addressed (e.g. incorrect technique, missing PPE, equipment issue). If none, return an empty array.

Return ONLY valid JSON, no markdown, no commentary. Schema:
{
  "title": "string",
  "summary": "string",
  "topics": [{"title": "string", "description": "string", "startSeconds": 0, "endSeconds": 0}],
  "keyPoints": [{"text": "string", "timeSeconds": 0, "type": "string"}],
  "actionItems": [{"text": "string", "priority": "string"}]
}`;
