import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { abortMultipart } from "@/lib/r2";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { role, facilityId } = await getAuthContext();
  if (role !== "admin" || !facilityId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const key = String(body?.key ?? "");
  const upload_id = String(body?.upload_id ?? "");
  if (!key || !upload_id) return NextResponse.json({ error: "missing fields" }, { status: 400 });
  if (!key.startsWith(`${facilityId}/`)) return NextResponse.json({ error: "key outside facility" }, { status: 403 });
  try {
    await abortMultipart(key, upload_id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[uploads/abort]", e);
    return NextResponse.json({ error: `r2: ${e?.message ?? String(e)}` }, { status: 500 });
  }
}
