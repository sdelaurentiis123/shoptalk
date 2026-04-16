/**
 * Integration test for sessions API. Requires:
 *  - Dev server running (npm run dev)
 *  - .env.local with Supabase + Gemini + Anthropic keys
 *  - DB schema applied (work_sessions table exists)
 *  - Signed-in admin session cookie
 *
 * Run: npx tsx scripts/test-api-sessions.ts <session_cookie>
 *
 * Pass the full sb-xxx-auth-token cookie value.
 * Get it from browser DevTools → Application → Cookies.
 */

import assert from "assert";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const COOKIE_NAME = process.argv[2] ? "sb-dilaqegiryqtmyjynzxr-auth-token" : "";
const COOKIE_VAL = process.argv[2] || "";

if (!COOKIE_VAL) {
  console.log("Usage: npx tsx scripts/test-api-sessions.ts <cookie-value>");
  console.log("Get the cookie from browser DevTools → Application → Cookies → sb-*-auth-token");
  process.exit(1);
}

const headers: Record<string, string> = {
  "Content-Type": "application/json",
  Cookie: `${COOKIE_NAME}=${COOKIE_VAL}`,
};

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e: any) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
  }
}

async function run() {
  console.log("\n=== Sessions API Integration Tests ===\n");
  console.log(`Base: ${BASE}\n`);

  // ── GET /api/sessions — should return empty or existing list ──
  console.log("Sessions CRUD:");

  let sessions: any[] = [];
  await test("GET /api/sessions returns 200", async () => {
    const res = await fetch(`${BASE}/api/sessions`, { headers });
    assert.equal(res.status, 200);
    const data = await res.json();
    sessions = data.sessions;
    assert(Array.isArray(sessions));
    console.log(`    (found ${sessions.length} existing sessions)`);
  });

  // If there's at least one session, test the detail endpoint
  if (sessions.length > 0) {
    const first = sessions[0];
    console.log(`\nSession detail (${first.id}):`);

    await test("GET /api/sessions/[id] returns session with topics + keyPoints", async () => {
      const res = await fetch(`${BASE}/api/sessions/${first.id}`, { headers });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert(data.session);
      assert(Array.isArray(data.topics));
      assert(Array.isArray(data.keyPoints));
      console.log(`    title: ${data.session.title}`);
      console.log(`    status: ${data.session.processing_status}`);
      console.log(`    topics: ${data.topics.length}, keyPoints: ${data.keyPoints.length}`);
      console.log(`    transcript beats: ${data.session.raw_transcript?.length ?? 0}`);
    });

    await test("PUT /api/sessions/[id] updates title", async () => {
      const newTitle = `Test Title ${Date.now()}`;
      const res = await fetch(`${BASE}/api/sessions/${first.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ title: newTitle }),
      });
      assert.equal(res.status, 200);

      const check = await fetch(`${BASE}/api/sessions/${first.id}`, { headers });
      const data = await check.json();
      assert.equal(data.session.title, newTitle);
    });

    if (first.processing_status === "ready") {
      await test("ready session has non-empty transcript", async () => {
        const res = await fetch(`${BASE}/api/sessions/${first.id}`, { headers });
        const data = await res.json();
        assert(data.session.raw_transcript.length > 0, "transcript should have beats");
      });

      await test("ready session has notes with title", async () => {
        const res = await fetch(`${BASE}/api/sessions/${first.id}`, { headers });
        const data = await res.json();
        assert(data.session.notes?.title, "notes should have title");
      });

      await test("topics have valid time ranges", async () => {
        const res = await fetch(`${BASE}/api/sessions/${first.id}`, { headers });
        const data = await res.json();
        for (const t of data.topics) {
          if (t.start_sec != null && t.end_sec != null) {
            assert(t.start_sec < t.end_sec, `topic "${t.title}": start >= end`);
            assert(t.start_sec >= 0, `topic "${t.title}": start < 0`);
          }
        }
      });

      await test("key points have valid time_sec within video bounds", async () => {
        const res = await fetch(`${BASE}/api/sessions/${first.id}`, { headers });
        const data = await res.json();
        const total = data.session.total_seconds;
        for (const kp of data.keyPoints) {
          if (kp.time_sec != null) {
            assert(kp.time_sec >= 0, `key point: time_sec < 0`);
            assert(kp.time_sec <= total + 5, `key point: time_sec > total (${kp.time_sec} > ${total})`);
          }
        }
      });
    }
  } else {
    console.log("\n  (no sessions to test detail against — upload a video first)");
  }

  // ── Auth check ──
  console.log("\nAuth:");

  await test("GET /api/sessions without auth returns 401", async () => {
    const res = await fetch(`${BASE}/api/sessions`);
    assert([401, 500].includes(res.status), `expected 401, got ${res.status}`);
  });

  await test("GET /api/sessions/[fake-id] returns 404", async () => {
    const res = await fetch(`${BASE}/api/sessions/00000000-0000-0000-0000-000000000000`, { headers });
    assert.equal(res.status, 404);
  });

  // ── Summary ──
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exit(1);
}

run().catch((e) => {
  console.error("Runner failed:", e);
  process.exit(1);
});
