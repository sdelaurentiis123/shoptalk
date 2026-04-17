/**
 * Test suite for the video pipeline architecture.
 *
 * Run: npx tsx scripts/test-video-pipeline.ts
 *
 * Tests prompt generation, session notes structure, and SOP prompt content.
 * Processing logic has moved to services/processor — run `npm run processor:test` for those.
 */

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
  console.log("\n=== Video Pipeline Test Suite ===\n");

  // ── Session prompts (still in lib/session-prompts.ts for Vercel fallback) ──

  console.log("Session prompts:");

  const { sessionTranscriptPrompt, buildChunkContext, SESSION_NOTES_PROMPT } =
    await import("../lib/session-prompts");

  await test("sessionTranscriptPrompt includes chunk index and timestamps", () => {
    const p = sessionTranscriptPrompt(2, 4, 1800, 900);
    assert(p.includes("segment 3 of 4"));
    assert(p.includes("starting at 1800s"));
    assert(p.includes("≥ 1800"));
    assert(p.includes("≤ 2700"));
  });

  await test("first chunk prompt has correct bounds", () => {
    const p = sessionTranscriptPrompt(0, 1, 0, 120);
    assert(p.includes("segment 1 of 1"));
    assert(p.includes("≥ 0"));
    assert(p.includes("≤ 120"));
  });

  await test("buildChunkContext returns context with beats", () => {
    const beats = [{ timeSeconds: 42, text: "Operator picks up wrench" }];
    const ctx = buildChunkContext(beats, 60);
    assert(ctx.includes("[42s] Operator picks up wrench"));
    assert(ctx.includes("Previous segment ended at 60s"));
  });

  await test("buildChunkContext limits to last 30 beats", () => {
    const beats = Array.from({ length: 50 }, (_, i) => ({
      timeSeconds: i * 5,
      text: `Beat ${i}`,
    }));
    const ctx = buildChunkContext(beats, 250);
    assert(!ctx.includes("Beat 19"));
    assert(ctx.includes("Beat 20"));
    assert(ctx.includes("Beat 49"));
  });

  await test("SESSION_NOTES_PROMPT has required fields", () => {
    assert(typeof SESSION_NOTES_PROMPT === "string");
    assert(SESSION_NOTES_PROMPT.includes("topics"));
    assert(SESSION_NOTES_PROMPT.includes("keyPoints"));
    assert(SESSION_NOTES_PROMPT.includes("actionItems"));
  });

  // ── Gemini SOP prompt ──

  console.log("\nGemini SOP prompt:");

  const { SOP_PROMPT } = await import("../lib/gemini");

  await test("SOP_PROMPT is exported and non-empty", () => {
    assert(typeof SOP_PROMPT === "string");
    assert(SOP_PROMPT.length > 100);
    assert(SOP_PROMPT.includes("manufacturing"));
    assert(SOP_PROMPT.includes("substeps"));
  });

  await test("processWithGemini export exists", async () => {
    const mod = await import("../lib/gemini");
    assert(typeof mod.processWithGemini === "function");
  });

  // ── Architecture: PROCESSOR_URL env var ──

  console.log("\nArchitecture:");

  await test("PROCESSOR_URL is expected in .env.local (check manually)", () => {
    // This env var is loaded by Next.js at runtime, not available in raw tsx
    // Verify it exists in the .env.local file
    const { readFileSync } = require("fs");
    const env = readFileSync(".env.local", "utf-8");
    assert(env.includes("PROCESSOR_URL="), "PROCESSOR_URL should be in .env.local");
  });

  // ── Summary ──
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exit(1);
}

run().catch((e) => {
  console.error("Test runner failed:", e);
  process.exit(1);
});
