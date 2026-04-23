import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env if present (for local dev)
try {
  const envPath = resolve(import.meta.dirname ?? ".", ".env");
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
} catch {}

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { processSop } from "./process-sop.js";
import { processSession } from "./process-session.js";
import { setSessionStatus, setSopError } from "./db.js";

const app = new Hono();

app.use("*", async (c, next) => {
  if (c.req.path === "/health") return next();
  const secret = process.env.PROCESSOR_SECRET;
  if (!secret) return next();
  const auth = c.req.header("authorization");
  if (auth !== `Bearer ${secret}`) {
    return c.json({ error: "unauthorized" }, 401);
  }
  return next();
});

app.get("/health", (c) => c.json({ ok: true }));

app.post("/process/sop", async (c) => {
  const body = await c.req.json();
  const { storageKey, fileType, fileName, facilityId, sopId, stationId } =
    body;

  if (!storageKey || !fileType || !facilityId || !sopId) {
    return c.json({ error: "missing required fields" }, 400);
  }

  console.log(`[server] POST /process/sop sopId=${sopId}`);

  try {
    await processSop({ storageKey, fileType, fileName, facilityId, sopId });
    console.log(`[server] SOP ${sopId} complete`);
    return c.json({ ok: true, message: "processing complete" });
  } catch (e: any) {
    console.error(`[server] SOP ${sopId} failed:`, e?.message);
    await setSopError(sopId, e?.message ?? String(e));
    return c.json({ error: e?.message ?? String(e) }, 500);
  }
});

app.post("/process/session", async (c) => {
  const body = await c.req.json();
  const { storageKey, fileType, fileName, facilityId, sessionId, stationId } =
    body;

  if (!storageKey || !fileType || !facilityId || !sessionId) {
    return c.json({ error: "missing required fields" }, 400);
  }

  console.log(`[server] POST /process/session sessionId=${sessionId}`);

  try {
    await processSession({ storageKey, fileType, fileName, facilityId, sessionId });
    console.log(`[server] Session ${sessionId} complete`);
    return c.json({ ok: true, message: "processing complete" });
  } catch (e: any) {
    console.error(`[server] Session ${sessionId} failed:`, e?.message);
    await setSessionStatus(sessionId, "failed", e?.message ?? String(e));
    return c.json({ error: e?.message ?? String(e) }, 500);
  }
});

const port = parseInt(process.env.PORT || "3001", 10);
console.log(`[processor] starting on port ${port}`);
serve({ fetch: app.fetch, port });
