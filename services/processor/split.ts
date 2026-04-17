import { execFile as execFileCb } from "child_process";
import { join } from "path";
import { promisify } from "util";

const exec = promisify(execFileCb);

export const CHUNK_DURATION_SEC = 90;

export interface ChunkMeta {
  index: number;
  startSec: number;
  durationSec: number;
  path: string;
}

export async function getVideoDuration(filePath: string): Promise<number> {
  const { stdout } = await exec("ffprobe", [
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_format",
    filePath,
  ]);
  const info = JSON.parse(stdout);
  return Math.floor(parseFloat(info.format?.duration ?? "0"));
}

export async function splitVideo(
  inputPath: string,
  outputDir: string,
  chunkDurationSec = CHUNK_DURATION_SEC,
): Promise<ChunkMeta[]> {
  const duration = await getVideoDuration(inputPath);
  const ext = inputPath.endsWith(".mov") ? "mov" : "mp4";
  const numChunks = Math.ceil(duration / chunkDurationSec);
  const chunks: ChunkMeta[] = [];

  for (let i = 0; i < numChunks; i++) {
    const startSec = i * chunkDurationSec;
    const durationSec = Math.min(chunkDurationSec, duration - startSec);
    const outPath = join(outputDir, `chunk_${i}.${ext}`);

    await exec("ffmpeg", [
      "-y",
      "-ss",
      String(startSec),
      "-t",
      String(durationSec),
      "-i",
      inputPath,
      "-map",
      "0:v",
      "-map",
      "0:a?",
      "-c",
      "copy",
      outPath,
    ]);

    chunks.push({ index: i, startSec, durationSec, path: outPath });
  }

  return chunks;
}

export function computeChunkMeta(
  totalDuration: number,
  chunkDurationSec = CHUNK_DURATION_SEC,
): Omit<ChunkMeta, "path">[] {
  const numChunks = Math.ceil(totalDuration / chunkDurationSec);
  const chunks: Omit<ChunkMeta, "path">[] = [];
  for (let i = 0; i < numChunks; i++) {
    const startSec = i * chunkDurationSec;
    const durationSec = Math.min(chunkDurationSec, totalDuration - startSec);
    chunks.push({ index: i, startSec, durationSec });
  }
  return chunks;
}
