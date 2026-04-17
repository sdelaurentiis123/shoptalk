import { putObject } from "../lib/r2";
import { readFileSync } from "fs";

async function main() {
  const ffmpeg = readFileSync("/tmp/ffmpeg-7.0.2-amd64-static/ffmpeg");
  await putObject("_bin/ffmpeg-linux-x64", ffmpeg, "application/octet-stream");
  console.log("uploaded ffmpeg", (ffmpeg.length / 1024 / 1024).toFixed(1), "MB");

  const ffprobe = readFileSync("/tmp/ffmpeg-7.0.2-amd64-static/ffprobe");
  await putObject("_bin/ffprobe-linux-x64", ffprobe, "application/octet-stream");
  console.log("uploaded ffprobe", (ffprobe.length / 1024 / 1024).toFixed(1), "MB");
}

main().catch(console.error);
