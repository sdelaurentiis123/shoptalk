import { execFile as execFileCb } from "child_process";
import { join } from "path";
import { tmpdir } from "os";
import { writeFile, readFile, unlink, readdir, mkdir } from "fs/promises";
import { promisify } from "util";
import ffmpegPath from "ffmpeg-static";
// @ts-ignore — no types for ffprobe-static
import ffprobeStatic from "ffprobe-static";
const ffprobePath: string = ffprobeStatic.path;

const exec = promisify(execFileCb);
const FFMPEG = ffmpegPath!;
const FFPROBE = ffprobePath;

export interface VideoChunk {
  index: number;
  startSec: number;
  durationSec: number;
  buf: Buffer;
}

const CHUNK_DURATION_SEC = 90; // 1.5 minutes

export async function getVideoDuration(buf: Buffer): Promise<number> {
  const tmp = join(tmpdir(), `probe-${crypto.randomUUID()}.mp4`);
  await writeFile(tmp, buf);
  try {
    const { stdout } = await exec(FFPROBE, [
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

  const ext = mimeType.includes("quicktime") ? "mov" : "mp4";
  const dir = join(tmpdir(), `split-${crypto.randomUUID()}`);
  await mkdir(dir, { recursive: true });

  const inputPath = join(dir, `input.${ext}`);
  await writeFile(inputPath, buf);

  await exec(FFMPEG, [
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
