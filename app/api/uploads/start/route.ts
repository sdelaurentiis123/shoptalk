import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { startMultipart, presignPart } from "@/lib/r2";

export const runtime = "nodejs";

const ALLOWED = new Set([
  "video/mp4", "video/quicktime", "video/webm", "video/x-m4v", "video/x-matroska",
  "application/pdf",
  "image/png", "image/jpeg", "image/webp",
]);
const MAX_BYTES = 2 * 1024 * 1024 * 1024;
const DEFAULT_PART_BYTES = 10 * 1024 * 1024;
const MIN_PART_BYTES = 5 * 1024 * 1024; // S3/R2 hard minimum except last part

export async function POST(req: Request) {
  const { role, facilityId } = await getAuthContext();
  if (role !== "admin" || !facilityId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const file_name = String(body?.file_name ?? "").trim();
  const file_type = String(body?.file_type ?? "").trim();
  const file_size = Number(body?.file_size ?? 0);
  if (!file_name || !file_type || !Number.isFinite(file_size) || file_size <= 0) {
    return NextResponse.json({ error: "missing file_name/file_type/file_size" }, { status: 400 });
  }
  if (!ALLOWED.has(file_type)) return NextResponse.json({ error: `unsupported type: ${file_type}` }, { status: 400 });
  if (file_size > MAX_BYTES) return NextResponse.json({ error: "file too large (max 2GB)" }, { status: 400 });

  const requestedPart = Number(body?.part_size ?? DEFAULT_PART_BYTES);
  const part_size = Math.max(MIN_PART_BYTES, Math.min(requestedPart, 64 * 1024 * 1024));
  let part_count = Math.ceil(file_size / part_size);
  if (part_count > 1000) return NextResponse.json({ error: "too many parts" }, { status: 400 });
  if (part_count < 1) part_count = 1;

  const ext = (file_name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const key = `${facilityId}/${crypto.randomUUID()}.${ext || "bin"}`;

  try {
    const upload_id = await startMultipart(key, file_type);
    const parts = await Promise.all(
      Array.from({ length: part_count }, async (_, i) => ({
        partNumber: i + 1,
        url: await presignPart(key, upload_id, i + 1),
      })),
    );
    return NextResponse.json({ key, upload_id, part_size, parts });
  } catch (e: any) {
    console.error("[uploads/start]", e);
    return NextResponse.json({ error: `r2: ${e?.message ?? String(e)}` }, { status: 500 });
  }
}
