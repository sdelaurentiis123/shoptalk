import { execFile as execFileCb } from "child_process";
import { join } from "path";
import { tmpdir } from "os";
import { writeFile, readFile, unlink, readdir, mkdir, chmod, access } from "fs/promises";
import { promisify } from "util";
import { constants } from "fs";
import { getObjectBuffer } from "./r2";

const exec = promisify(execFileCb);

export interface VideoChunk {
  index: number;
  startSec: number;
  durationSec: number;
  buf: Buffer;
}

const CHUNK_DURATION_SEC = 90; // 1.5 minutes
const TMP_FFMPEG = "/tmp/ffmpeg";
const TMP_FFPROBE = "/tmp/ffprobe";

async function fileExists(path: string): Promise<boolean> {
  try { await access(path, constants.X_OK); return true; } catch { return false; }
}

async function getFFmpegPath(): Promise<string> {
  // Local dev: use npm package binary
  try {
    const mod = await import("ffmpeg-static");
    const p = (mod.default ?? mod) as string;
    if (p && await fileExists(p)) return p;
  } catch {}

  // Vercel: download from R2 to /tmp on cold start
  if (await fileExists(TMP_FFMPEG)) return TMP_FFMPEG;
  console.log("[ffmpeg] downloading ffmpeg binary from R2...");
  const buf = await getObjectBuffer("_bin/ffmpeg-linux-x64");
  await writeFile(TMP_FFMPEG, buf);
  await chmod(TMP_FFMPEG, 0o755);
  console.log("[ffmpeg] ffmpeg ready at /tmp");
  return TMP_FFMPEG;
}

async function getFFprobePath(): Promise<string> {
  // Local dev: use npm package binary
  try {
    // @ts-ignore
    const mod = await import("ffprobe-static");
    const p = (mod.default?.path ?? mod.path) as string;
    if (p && await fileExists(p)) return p;
  } catch {}

  // Vercel: download from R2 to /tmp on cold start
  if (await fileExists(TMP_FFPROBE)) return TMP_FFPROBE;
  console.log("[ffmpeg] downloading ffprobe binary from R2...");
  const buf = await getObjectBuffer("_bin/ffprobe-linux-x64");
  await writeFile(TMP_FFPROBE, buf);
  await chmod(TMP_FFPROBE, 0o755);
  console.log("[ffmpeg] ffprobe ready at /tmp");
  return TMP_FFPROBE;
}

export async function getVideoDuration(buf: Buffer): Promise<number> {
  const ffprobe = await getFFprobePath();
  const tmp = join(tmpdir(), `probe-${crypto.randomUUID()}.mp4`);
  await writeFile(tmp, buf);
  try {
    const { stdout } = await exec(ffprobe, [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      tmp,
    ]);
    const info = JSON.parse(stdout);
    return Math.floor(parseFloat(info.format?.duration ?? "0"));
  } finally {
    unlink(tmp).catch(() => {});
  }
}

export async function splitVideo(buf: Buffer, mimeType: string): Promise<VideoChunk[]> {
  const totalDuration = await getVideoDuration(buf);
  console.log("[ffmpeg] duration:", totalDuration, "s");

  if (totalDuration <= CHUNK_DURATION_SEC) {
    return [{ index: 0, startSec: 0, durationSec: totalDuration || 1, buf }];
  }

  const ffmpeg = await getFFmpegPath();
  const ext = mimeType.includes("quicktime") ? "mov" : "mp4";
  const dir = join(tmpdir(), `split-${crypto.randomUUID()}`);
  await mkdir(dir, { recursive: true });

  const inputPath = join(dir, `input.${ext}`);
  await writeFile(inputPath, buf);

  await exec(ffmpeg, [
    "-i", inputPath,
    "-c", "copy",
    "-map", "0",
    "-segment_time", String(CHUNK_DURATION_SEC),
    "-f", "segment",
    "-reset_timestamps", "1",
    join(dir, `chunk_%03d.${ext}`),
  ]);

  const files = (await readdir(dir))
    .filter((f) => f.startsWith("chunk_") && f.endsWith(`.${ext}`))
    .sort();

  const chunks: VideoChunk[] = [];
  for (let i = 0; i < files.length; i++) {
    const chunkBuf = await readFile(join(dir, files[i]));
    chunks.push({
      index: i,
      startSec: i * CHUNK_DURATION_SEC,
      durationSec: Math.min(CHUNK_DURATION_SEC, totalDuration - i * CHUNK_DURATION_SEC),
      buf: chunkBuf,
    });
  }

  for (const f of await readdir(dir)) unlink(join(dir, f)).catch(() => {});
  unlink(dir).catch(() => {});

  console.log("[ffmpeg] split into", chunks.length, "chunks");
  return chunks;
}
