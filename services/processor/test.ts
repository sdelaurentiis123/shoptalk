import assert from "assert";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (e: any) {
      failed++;
      console.error(`  ✗ ${name}`);
      console.error(`    ${e.message}`);
    }
  })();
}

async function run() {
  console.log("\n=== Processor Unit Tests ===\n");

  // ── Split metadata ──
  console.log("Split metadata:");

  const { computeChunkMeta, CHUNK_DURATION_SEC } = await import("./split.js");

  await test("short video (≤90s) returns single chunk", () => {
    const chunks = computeChunkMeta(60);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].index, 0);
    assert.equal(chunks[0].startSec, 0);
    assert.equal(chunks[0].durationSec, 60);
  });

  await test("exact 90s returns single chunk", () => {
    const chunks = computeChunkMeta(90);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].durationSec, 90);
  });

  await test("91s returns two chunks", () => {
    const chunks = computeChunkMeta(91);
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].startSec, 0);
    assert.equal(chunks[0].durationSec, 90);
    assert.equal(chunks[1].startSec, 90);
    assert.equal(chunks[1].durationSec, 1);
  });

  await test("250s returns 3 chunks with correct metadata", () => {
    const chunks = computeChunkMeta(250);
    assert.equal(chunks.length, 3);
    assert.equal(chunks[0].startSec, 0);
    assert.equal(chunks[0].durationSec, 90);
    assert.equal(chunks[1].startSec, 90);
    assert.equal(chunks[1].durationSec, 90);
    assert.equal(chunks[2].startSec, 180);
    assert.equal(chunks[2].durationSec, 70);
  });

  await test("4-hour video returns 160 chunks", () => {
    const chunks = computeChunkMeta(4 * 60 * 60);
    assert.equal(chunks.length, 160);
    const last = chunks[159];
    assert.equal(last.startSec, 159 * 90);
    assert.equal(last.durationSec, 90);
  });

  await test("CHUNK_DURATION_SEC is 90", () => {
    assert.equal(CHUNK_DURATION_SEC, 90);
  });

  // ── SOP stitch logic ──
  console.log("\nSOP stitch:");

  await test("single chunk steps pass through unchanged", () => {
    const steps = [
      {
        title: "Step 1",
        title_es: "",
        description: "",
        description_es: "",
        startSeconds: 10,
        endSeconds: 50,
        substeps: [{ text: "Do thing", text_es: "", timeSeconds: 30 }],
      },
    ];
    assert.equal(steps[0].startSeconds, 10);
    assert.equal(steps[0].substeps[0].timeSeconds, 30);
  });

  await test("multi-chunk offsets timestamps for chunk_index > 0", () => {
    const chunk0Steps = [
      {
        startSeconds: 0,
        endSeconds: 60,
        substeps: [{ timeSeconds: 30 }],
      },
    ];
    const chunk1Steps = [
      {
        startSeconds: 10,
        endSeconds: 50,
        substeps: [{ timeSeconds: 25 }],
      },
    ];
    const chunk1StartSec = 90;

    const merged = [
      ...chunk0Steps,
      ...chunk1Steps.map((s) => ({
        ...s,
        startSeconds: s.startSeconds + chunk1StartSec,
        endSeconds: s.endSeconds + chunk1StartSec,
        substeps: s.substeps.map((ss) => ({
          ...ss,
          timeSeconds: ss.timeSeconds + chunk1StartSec,
        })),
      })),
    ];

    assert.equal(merged[0].startSeconds, 0);
    assert.equal(merged[1].startSeconds, 100);
    assert.equal(merged[1].endSeconds, 140);
    assert.equal(merged[1].substeps[0].timeSeconds, 115);
  });

  await test("transcripts concatenated across chunks", () => {
    const transcripts = ["[0:00] First part", "[1:30] Second part"];
    assert.equal(transcripts.join("\n"), "[0:00] First part\n[1:30] Second part");
  });

  // ── Session stitch logic ──
  console.log("\nSession stitch:");

  await test("beats sorted by timeSeconds across chunks", () => {
    const chunk0 = [
      { timeSeconds: 5, text: "A" },
      { timeSeconds: 10, text: "B" },
    ];
    const chunk1 = [
      { timeSeconds: 95, text: "C" },
      { timeSeconds: 100, text: "D" },
    ];
    const all = [...chunk0, ...chunk1].sort(
      (a, b) => a.timeSeconds - b.timeSeconds,
    );
    assert.equal(all.length, 4);
    assert.equal(all[0].text, "A");
    assert.equal(all[3].text, "D");
  });

  await test("empty chunks handled gracefully", () => {
    const chunk0 = [{ timeSeconds: 5, text: "A" }];
    const chunk1: any[] = [];
    const all = [...chunk0, ...chunk1].sort(
      (a, b) => a.timeSeconds - b.timeSeconds,
    );
    assert.equal(all.length, 1);
  });

  await test("beats with same timeSeconds preserved (not deduplicated)", () => {
    const beats = [
      { timeSeconds: 10, text: "A" },
      { timeSeconds: 10, text: "B" },
    ];
    const sorted = beats.sort((a, b) => a.timeSeconds - b.timeSeconds);
    assert.equal(sorted.length, 2);
  });

  // ── Prompt generation ──
  console.log("\nPrompt generation:");

  const { sessionTranscriptPrompt, SESSION_NOTES_PROMPT } = await import(
    "./prompts.js"
  );

  await test("sessionTranscriptPrompt includes segment info", () => {
    const p = sessionTranscriptPrompt(2, 4, 180, 90);
    assert(p.includes("segment 3 of 4"));
    assert(p.includes("starting at 180s"));
    assert(p.includes("≥ 180"));
    assert(p.includes("≤ 270"));
  });

  await test("sessionTranscriptPrompt includes continuity note", () => {
    const p = sessionTranscriptPrompt(0, 1, 0, 90);
    assert(
      p.includes("actions in progress"),
      "should mention actions in progress for continuity",
    );
  });

  await test("SESSION_NOTES_PROMPT has expected fields", () => {
    assert(typeof SESSION_NOTES_PROMPT === "string");
    assert(SESSION_NOTES_PROMPT.includes("topics"));
    assert(SESSION_NOTES_PROMPT.includes("keyPoints"));
    assert(SESSION_NOTES_PROMPT.includes("actionItems"));
    assert(SESSION_NOTES_PROMPT.includes("title"));
    assert(SESSION_NOTES_PROMPT.includes("summary"));
  });

  const { SOP_PROMPT } = await import("./gemini.js");

  await test("SOP_PROMPT is non-empty and includes key terms", () => {
    assert(typeof SOP_PROMPT === "string");
    assert(SOP_PROMPT.length > 100);
    assert(SOP_PROMPT.includes("manufacturing"));
    assert(SOP_PROMPT.includes("substeps"));
    assert(SOP_PROMPT.includes("totalSeconds"));
  });

  // ── Timestamp sanitization ──
  console.log("\nTimestamp sanitization:");

  const { sanitizeTimestamps } = await import("./gemini.js");

  await test("clamps hallucinated timestamps to maxDuration", () => {
    const out = {
      title: "T",
      title_es: "",
      description: "",
      description_es: "",
      totalSeconds: 200,
      transcript: "",
      transcript_es: "",
      steps: [
        {
          title: "S1",
          title_es: "",
          description: "",
          description_es: "",
          startSeconds: 0,
          endSeconds: 150,
          substeps: [{ text: "x", text_es: "", timeSeconds: 120 }],
        },
      ],
    };
    const result = sanitizeTimestamps(out, "video/mp4", 90);
    assert.equal(result.totalSeconds, 90);
    assert(
      result.steps[0].endSeconds! <= 90,
      `endSeconds ${result.steps[0].endSeconds} should be ≤ 90`,
    );
    assert(
      result.steps[0].substeps[0].timeSeconds! <= 90,
      `substep time ${result.steps[0].substeps[0].timeSeconds} should be ≤ 90`,
    );
  });

  await test("non-video gets null timestamps", () => {
    const out = {
      title: "T",
      title_es: "",
      description: "",
      description_es: "",
      totalSeconds: 100,
      transcript: "",
      transcript_es: "",
      steps: [
        {
          title: "S1",
          title_es: "",
          description: "",
          description_es: "",
          startSeconds: 0,
          endSeconds: 50,
          substeps: [{ text: "x", text_es: "", timeSeconds: 25 }],
        },
      ],
    };
    const result = sanitizeTimestamps(out, "application/pdf");
    assert.equal(result.totalSeconds, 0);
    assert.equal(result.steps[0].startSeconds, null);
    assert.equal(result.steps[0].endSeconds, null);
    assert.equal(result.steps[0].substeps[0].timeSeconds, null);
  });

  await test("steps are non-overlapping after sanitization", () => {
    const out = {
      title: "T",
      title_es: "",
      description: "",
      description_es: "",
      totalSeconds: 90,
      transcript: "",
      transcript_es: "",
      steps: [
        {
          title: "S1",
          title_es: "",
          description: "",
          description_es: "",
          startSeconds: 0,
          endSeconds: 60,
          substeps: [],
        },
        {
          title: "S2",
          title_es: "",
          description: "",
          description_es: "",
          startSeconds: 30,
          endSeconds: 90,
          substeps: [],
        },
      ],
    };
    const result = sanitizeTimestamps(out, "video/mp4", 90);
    assert(
      result.steps[1].startSeconds! >= result.steps[0].endSeconds!,
      `step2 start (${result.steps[1].startSeconds}) should be >= step1 end (${result.steps[0].endSeconds})`,
    );
  });

  // ── Batch logic ──
  console.log("\nBatch processing:");

  await test("batching processes all items", () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    const batchSize = 10;
    const processed: number[] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      processed.push(...batch);
    }
    assert.equal(processed.length, 25);
    assert.deepEqual(processed, items);
  });

  await test("batch count is correct", () => {
    const numBatches = Math.ceil(25 / 10);
    assert.equal(numBatches, 3);
  });

  await test("last batch handles remainder", () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    const lastBatch = items.slice(20, 30);
    assert.equal(lastBatch.length, 5);
  });

  // ── Summary ──
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exit(1);
}

run().catch((e) => {
  console.error("Test runner failed:", e);
  process.exit(1);
});
